// Discovery logic ported from opencode-command-inject v1 (src/command-sources,
// src/skills, src/config). Config-file schema validation (zod) is replaced by
// a permissive structural read — unknown fields are ignored.
import { readFile, readdir, realpath, stat } from "node:fs/promises";
import { readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join, relative, basename } from "node:path";

export interface Logger {
  warn: (msg: string) => void;
  debug?: (msg: string) => void;
}

export interface CommandInfo {
  name: string;
  description: string;
  template: string;
  sourceId?: string;
  canonicalName?: string;
  usedCustomizedName?: boolean;
}

export interface CommandSource {
  readonly id: string;
  load(ctx: LoadContext): Promise<CommandInfo[]>;
}

export interface LoadContext {
  rootDir: string;
  logger: Logger;
}

export interface LoadedSkillCommandInput {
  name: string;
  description?: string;
  template: string;
  body?: string;
}

// ---------- template / variables (template.ts, variable-substitution.ts) ----------

export const SHELL_TEMPLATE_PREFIX = "Use shell to execute";

export function buildShellTemplate(command: string): string {
  return `${SHELL_TEMPLATE_PREFIX} \`${command}\``;
}

export function substituteVariables(template: string, vars: Record<string, string>): string {
  let result = template;
  for (const [key, value] of Object.entries(vars)) {
    result = result.replace(new RegExp(`\\{${key}\\}`, "g"), value);
  }
  return result;
}

export function injectCommandArguments(template: string, argumentsText?: string): string {
  return template.replaceAll("$ARGUMENTS", argumentsText ?? "").trim();
}

// ---------- command-name-prefix.ts ----------

export interface CommandNamePrefix {
  value?: string;
  disable?: boolean;
}

export interface SourceConfig {
  disable?: boolean;
  prompt?: string;
  prompt_append?: string;
  command_name_prefix?: CommandNamePrefix;
}

export interface CommandInjectConfig {
  command_name_prefix?: CommandNamePrefix;
  sources?: {
    makefile?: SourceConfig;
    "npm-scripts"?: SourceConfig;
    skill?: SourceConfig;
  };
}

function buildCommandName(opts: {
  name: string;
  canonicalPrefix: string;
  globalCommandNamePrefix?: CommandNamePrefix;
  sourceConfig?: SourceConfig;
}): { configuredName: string; canonicalName: string; usedCustomizedName: boolean } {
  const { name, canonicalPrefix, globalCommandNamePrefix, sourceConfig } = opts;
  const sourceCommandNamePrefix = sourceConfig?.command_name_prefix;
  const canonicalName = `${canonicalPrefix}:${name}`;
  const hasSourceCustomPrefixValue =
    sourceCommandNamePrefix?.value !== undefined && sourceCommandNamePrefix.value !== "";
  let usedCustomizedName = false;
  const configuredName = ((): string => {
    if (sourceCommandNamePrefix?.disable === true) {
      usedCustomizedName = true;
      return name;
    }
    if (sourceCommandNamePrefix?.disable === false) {
      usedCustomizedName = sourceCommandNamePrefix.value !== undefined || canonicalPrefix !== "";
      return `${sourceCommandNamePrefix.value ?? canonicalPrefix}:${name}`;
    }
    if (globalCommandNamePrefix?.disable === true) {
      usedCustomizedName = sourceCommandNamePrefix?.value === undefined;
      return name;
    }
    if (hasSourceCustomPrefixValue) {
      usedCustomizedName = true;
      return `${sourceCommandNamePrefix.value}:${name}`;
    }
    return canonicalName;
  })();
  return { configuredName, canonicalName, usedCustomizedName };
}

function buildConfiguredTemplate(
  defaultTemplate: string,
  vars: Record<string, string>,
  config?: SourceConfig,
): string {
  const baseTemplate = config?.prompt ? substituteVariables(config.prompt, vars) : defaultTemplate;
  const append = config?.prompt_append ? substituteVariables(config.prompt_append, vars) : "";
  return baseTemplate + append;
}

// ---------- makefile-parser.ts ----------

export interface MakefileTarget {
  target: string;
  description: string;
}

const targetPattern = /^([a-zA-Z0-9_-]+):.*?(?:##(.*))?$/;

export function parseMakefile(content: string): MakefileTarget[] {
  const targets = new Map<string, string | undefined>();
  for (const line of content.split(/\r?\n/u)) {
    const trimmed = line.trim();
    if (trimmed === "" || trimmed.startsWith("#") || trimmed.startsWith(".")) continue;
    const match = targetPattern.exec(trimmed);
    if (!match) continue;
    const target = match[1]!;
    const description = match[2]?.trim() || undefined;
    if (targets.has(target)) {
      if (targets.get(target) === undefined && description !== undefined) {
        targets.set(target, description);
      }
      continue;
    }
    targets.set(target, description);
  }
  return Array.from(targets, ([target, description]) => ({ target, description: description ?? target }));
}

// ---------- errors.ts ----------

function isErrnoException(error: unknown): error is NodeJS.ErrnoException {
  return !!error && typeof error === "object" && "code" in (error as Record<string, unknown>);
}

// ---------- npm-scripts-runner.ts ----------

export type PackageManager = "npm" | "pnpm" | "yarn" | "bun";

export async function detectNpmScriptsRunner(
  rootDir: string,
  packageJsonData?: { packageManager?: string; packageJsonRead?: boolean },
): Promise<PackageManager> {
  if (typeof packageJsonData?.packageManager === "string") {
    const pm = packageJsonData.packageManager.split("@")[0]!;
    if (["npm", "pnpm", "yarn", "bun"].includes(pm)) return pm as PackageManager;
  }
  if (!packageJsonData?.packageJsonRead) {
    try {
      const content = await readFile(join(rootDir, "package.json"), "utf8");
      const data = JSON.parse(content) as { packageManager?: string };
      if (typeof data.packageManager === "string") {
        const pm = data.packageManager.split("@")[0]!;
        if (["npm", "pnpm", "yarn", "bun"].includes(pm)) return pm as PackageManager;
      }
    } catch {
      // missing/unparseable package.json -> fall through to lockfiles
    }
  }
  const lockfiles: Record<string, PackageManager> = {
    "pnpm-lock.yaml": "pnpm",
    "yarn.lock": "yarn",
    "bun.lockb": "bun",
    "bun.lock": "bun",
    "package-lock.json": "npm",
  };
  const results = await Promise.all(
    Object.entries(lockfiles).map(async ([lockfile, runner]) => {
      try {
        await stat(join(rootDir, lockfile));
        return runner;
      } catch (error) {
        if (isErrnoException(error) && error.code === "ENOENT") return null;
        return null;
      }
    }),
  );
  for (const r of results) {
    if (r !== null) return r;
  }
  return "npm";
}

// ---------- sources ----------

export class MakefileCommandSource implements CommandSource {
  readonly id = "makefile";
  constructor(
    private readonly config?: SourceConfig,
    private readonly globalCommandNamePrefix?: CommandNamePrefix,
  ) {}
  async load(ctx: LoadContext): Promise<CommandInfo[]> {
    const makefilePath = join(ctx.rootDir, "Makefile");
    let content: string;
    try {
      content = await readFile(makefilePath, "utf8");
    } catch (error) {
      if (isErrnoException(error) && error.code === "ENOENT") return [];
      ctx.logger.warn(`[command-sources] failed to read Makefile: ${makefilePath}`);
      return [];
    }
    return parseMakefile(content).map(({ target, description }) => {
      const commandName = buildCommandName({
        name: target,
        canonicalPrefix: "make",
        globalCommandNamePrefix: this.globalCommandNamePrefix,
        sourceConfig: this.config,
      });
      const command = `make ${target}`;
      const vars = { name: target, description, command, arguments: "$ARGUMENTS" };
      return {
        name: commandName.configuredName,
        description,
        template: buildConfiguredTemplate(buildShellTemplate(`${command} $ARGUMENTS`), vars, this.config),
        sourceId: this.id,
        canonicalName: commandName.canonicalName,
        usedCustomizedName: commandName.usedCustomizedName,
      };
    });
  }
}

export class NpmScriptsCommandSource implements CommandSource {
  readonly id = "npm-scripts";
  constructor(
    private readonly config?: SourceConfig,
    private readonly globalCommandNamePrefix?: CommandNamePrefix,
  ) {}
  async load(ctx: LoadContext): Promise<CommandInfo[]> {
    const packageJsonPath = join(ctx.rootDir, "package.json");
    let content: string;
    try {
      content = await readFile(packageJsonPath, "utf8");
    } catch (error) {
      if (isErrnoException(error) && error.code === "ENOENT") return [];
      ctx.logger.warn(`[command-sources] failed to read package.json: ${packageJsonPath}`);
      return [];
    }
    let data: { scripts?: Record<string, unknown>; packageManager?: string };
    try {
      data = JSON.parse(content);
    } catch {
      ctx.logger.warn(`[command-sources] failed to parse package.json: ${packageJsonPath}`);
      return [];
    }
    if (!data.scripts || typeof data.scripts !== "object") return [];
    const runner = await detectNpmScriptsRunner(ctx.rootDir, {
      packageManager: data.packageManager,
      packageJsonRead: true,
    });
    return Object.keys(data.scripts).map((script) => {
      const commandName = buildCommandName({
        name: script,
        canonicalPrefix: runner,
        globalCommandNamePrefix: this.globalCommandNamePrefix,
        sourceConfig: this.config,
      });
      const command = `${runner} run ${script}`;
      const vars = { name: script, description: script, command, arguments: "$ARGUMENTS" };
      return {
        name: commandName.configuredName,
        description: script,
        template: buildConfiguredTemplate(buildShellTemplate(`${command} -- $ARGUMENTS`), vars, this.config),
        sourceId: this.id,
        canonicalName: commandName.canonicalName,
        usedCustomizedName: commandName.usedCustomizedName,
      };
    });
  }
}

// ---------- skills: normalize-skill-name.ts, frontmatter.ts, load-skill.ts, discovery.ts ----------

const skillPrefix = "skill:";

export function normalizeSkillName(name: string): string {
  const trimmed = name.trim();
  if (trimmed.toLowerCase().startsWith(skillPrefix)) {
    return trimmed.slice(skillPrefix.length).trim();
  }
  return trimmed;
}

const FRONTMATTER_REGEX = /^---\r?\n([\s\S]*?)\r?\n---\r?\n([\s\S]*)$/;

function normalizeScalar(value: string): string {
  if (
    (value.startsWith('"') && value.endsWith('"')) ||
    (value.startsWith("'") && value.endsWith("'"))
  ) {
    return value.slice(1, -1);
  }
  return value;
}

function foldBlockLines(lines: string[]): string {
  const folded: string[] = [];
  for (const line of lines) {
    if (!folded.length) {
      folded.push(line);
      continue;
    }
    if (line === "" || folded[folded.length - 1] === "") {
      folded.push(line);
      continue;
    }
    folded[folded.length - 1] = `${folded[folded.length - 1]} ${line}`;
  }
  return folded.join("\n").trimEnd();
}

function extractSupportedFields(yaml: string): Record<string, string> {
  const result: Record<string, string> = {};
  const lines = yaml.split("\n");
  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index]!;
    const trimmedLine = line.trim();
    if (!trimmedLine || trimmedLine.startsWith("#")) continue;
    const colonIndex = line.indexOf(":");
    if (colonIndex === -1) continue;
    const key = line.slice(0, colonIndex).trim();
    if (key !== "name" && key !== "description") continue;
    const rawValue = line.slice(colonIndex + 1).trim();
    if (rawValue === "|" || rawValue === "|-" || rawValue === "|+") {
      const blockLines: string[] = [];
      for (let nextIndex = index + 1; nextIndex < lines.length; nextIndex += 1) {
        const nextLine = lines[nextIndex]!;
        if (!nextLine.startsWith("  ") && nextLine.trim() !== "") break;
        blockLines.push(nextLine.startsWith("  ") ? nextLine.slice(2) : "");
        index = nextIndex;
      }
      result[key] = blockLines.join("\n").trimEnd();
      continue;
    }
    if (rawValue === ">" || rawValue === ">-" || rawValue === ">+") {
      const blockLines: string[] = [];
      for (let nextIndex = index + 1; nextIndex < lines.length; nextIndex += 1) {
        const nextLine = lines[nextIndex]!;
        if (!nextLine.startsWith("  ") && nextLine.trim() !== "") break;
        blockLines.push(nextLine.startsWith("  ") ? nextLine.slice(2) : "");
        index = nextIndex;
      }
      result[key] = foldBlockLines(blockLines);
      continue;
    }
    result[key] = normalizeScalar(rawValue);
  }
  return result;
}

export function parseFrontmatter(content: string): { name?: string; description?: string; body: string } {
  const match = content.match(FRONTMATTER_REGEX);
  if (!match) return { name: undefined, description: undefined, body: content };
  const fields = extractSupportedFields(match[1]!);
  return { name: fields.name, description: fields.description, body: (match[2] ?? "").trim() };
}

function buildSkillTemplate(body: string): string {
  return `<skill-instruction>\n${body}\n</skill-instruction>\n\n<user-request>\n$ARGUMENTS\n</user-request>`;
}

export interface LoadedSkillDefinition extends LoadedSkillCommandInput {
  body: string;
  sourcePath: string;
}

export async function loadSkill(skillDir: string): Promise<LoadedSkillDefinition | null> {
  const skillPath = join(skillDir, "SKILL.md");
  let content: string;
  try {
    content = await readFile(skillPath, "utf8");
  } catch (err) {
    if (isErrnoException(err) && err.code === "ENOENT") return null;
    throw err;
  }
  const parsed = parseFrontmatter(content);
  const dirName = basename(skillDir);
  if (!parsed.body || parsed.body.trim() === "") return null;
  const name = parsed.name ?? dirName;
  const description = parsed.description ?? name;
  return { name, description, template: buildSkillTemplate(parsed.body), body: parsed.body, sourcePath: skillPath };
}

export function getSkillRoots(projectRoot: string, homeDirectory = homedir()): string[] {
  return [
    join(projectRoot, ".opencode", "skills"),
    join(homeDirectory, ".config", "opencode", "skills"),
    join(projectRoot, ".claude", "skills"),
    join(projectRoot, ".agents", "skills"),
    join(homeDirectory, ".claude", "skills"),
    join(homeDirectory, ".agents", "skills"),
  ];
}

async function scanDirectory(
  dir: string,
  root: string,
  discovered: LoadedSkillDefinition[],
  seen: Map<string, string>,
  visitedPaths: Set<string>,
  logger: Logger,
): Promise<void> {
  let entries;
  try {
    entries = await readdir(dir, { withFileTypes: true });
  } catch (error) {
    if (isErrnoException(error) && error.code === "ENOENT") return;
    logger.warn(`[command-inject] failed to read skills directory '${dir}': ${(error as Error).message}`);
    return;
  }
  let resolvedPath: string;
  try {
    resolvedPath = await realpath(dir);
  } catch {
    return;
  }
  if (visitedPaths.has(resolvedPath)) return;
  visitedPaths.add(resolvedPath);
  for (const entry of entries) {
    const entryPath = join(dir, entry.name);
    if (!entry.isDirectory()) {
      if (entry.isSymbolicLink()) {
        try {
          const stats = await stat(entryPath);
          if (!stats.isDirectory()) continue;
        } catch {
          continue;
        }
      } else {
        continue;
      }
    }
    let loaded: LoadedSkillDefinition | null;
    try {
      loaded = await loadSkill(entryPath);
    } catch (error) {
      logger.warn(`[command-inject] failed to load skill from '${entryPath}': ${(error as Error).message}`);
      continue;
    }
    if (loaded) {
      const namespaced = applyNamespace(loaded, entryPath, root);
      const normalizedName = normalizeSkillName(namespaced.name);
      const existingSource = seen.get(normalizedName);
      if (!existingSource) {
        seen.set(normalizedName, namespaced.sourcePath);
        discovered.push(namespaced);
      }
    }
    await scanDirectory(entryPath, root, discovered, seen, visitedPaths, logger);
  }
}

function applyNamespace(
  skill: LoadedSkillDefinition,
  skillDir: string,
  rootDir: string,
): LoadedSkillDefinition {
  const relativePath = relative(rootDir, skillDir);
  const dirName = basename(skillDir);
  const useShortName = skill.name.toLowerCase() === dirName.toLowerCase();
  if (!relativePath || relativePath === ".") {
    return { ...skill, name: useShortName ? `${skillPrefix}${dirName}` : `${skillPrefix}${skill.name}` };
  }
  const namespacePrefix = skillPrefix + relativePath.replace(/[/\\]/g, ":");
  return { ...skill, name: useShortName ? namespacePrefix : `${namespacePrefix}:${skill.name}` };
}

export async function discoverSkills(options: {
  projectRoot: string;
  logger: Logger;
  roots?: string[];
  homeDirectory?: string;
}): Promise<LoadedSkillDefinition[]> {
  const roots = options.roots ?? getSkillRoots(options.projectRoot, options.homeDirectory);
  const discovered: LoadedSkillDefinition[] = [];
  const seen = new Map<string, string>();
  const visitedPaths = new Set<string>();
  for (const root of roots) {
    await scanDirectory(root, root, discovered, seen, visitedPaths, options.logger);
  }
  return discovered;
}

export class SkillCommandSource implements CommandSource {
  readonly id = "skill";
  constructor(
    private readonly loadedSkills: LoadedSkillCommandInput[],
    private readonly config?: SourceConfig,
    private readonly globalCommandNamePrefix?: CommandNamePrefix,
  ) {}
  async load(ctx: LoadContext): Promise<CommandInfo[]> {
    const commands: CommandInfo[] = [];
    const seenNames = new Set<string>();
    for (const skill of this.loadedSkills) {
      const rawName = skill.name.trim();
      if (!rawName) {
        ctx.logger.warn(`[command-sources] skipping skill with blank name`);
        continue;
      }
      const name = normalizeSkillName(rawName);
      if (!name) {
        ctx.logger.warn(`[command-sources] skipping skill with blank name after normalization`);
        continue;
      }
      const commandName = buildCommandName({
        name,
        canonicalPrefix: "skill",
        globalCommandNamePrefix: this.globalCommandNamePrefix,
        sourceConfig: this.config,
      });
      if (seenNames.has(commandName.configuredName)) {
        ctx.logger.warn(`[command-sources] duplicate skill command '${commandName.configuredName}', skipping`);
        continue;
      }
      seenNames.add(commandName.configuredName);
      const description = skill.description ?? name;
      const instruction = skill.body ?? skill.template;
      const vars = { name, description, instruction, arguments: "$ARGUMENTS" };
      commands.push({
        name: commandName.configuredName,
        description,
        template: buildConfiguredTemplate(skill.template, vars, this.config),
        sourceId: this.id,
        canonicalName: commandName.canonicalName,
        usedCustomizedName: commandName.usedCustomizedName,
      });
    }
    return commands;
  }
}

// ---------- aggregator.ts ----------

export async function aggregateCommandSources(
  sources: readonly CommandSource[],
  context: LoadContext,
): Promise<CommandInfo[]> {
  const results = await Promise.all(sources.map((source) => source.load(context)));
  const merged: Array<{ command: CommandInfo; order: number }> = [];
  const seen = new Set<string>();
  const loaded: Array<{ command: CommandInfo; sourceId: string; order: number }> = [];
  for (let i = 0; i < sources.length; i++) {
    for (const command of results[i]!) {
      loaded.push({ command: { ...command, sourceId: command.sourceId ?? sources[i]!.id }, sourceId: command.sourceId ?? sources[i]!.id, order: loaded.length });
    }
  }
  const groups = new Map<string, typeof loaded>();
  for (const entry of loaded) {
    const group = groups.get(entry.command.name);
    if (group) {
      group.push(entry);
      continue;
    }
    groups.set(entry.command.name, [entry]);
  }
  const orderedGroups = [...groups.values()].sort((left, right) => left[0]!.order - right[0]!.order);
  for (const group of orderedGroups) {
    if (group.length === 1) {
      const only = group[0]!.command;
      seen.add(only.name);
      merged.push({ command: only, order: group[0]!.order });
      continue;
    }
    const collidedName = group[0]!.command.name;
    const canonicalNames = group.map((entry) => entry.command.canonicalName ?? entry.command.name);
    const hasCustomizedCommand = group.some((entry) => entry.command.usedCustomizedName === true);
    const canonicalNamesAreUnique = new Set(canonicalNames).size === canonicalNames.length;
    const fallbackNamesAvailable = canonicalNames.every((name) => !seen.has(name));
    if (hasCustomizedCommand && canonicalNamesAreUnique && fallbackNamesAvailable) {
      const fallbackCommands = group.map((entry, index) => ({
        command: { ...entry.command, name: canonicalNames[index]! },
        order: entry.order,
      }));
      for (const entry of fallbackCommands) {
        seen.add(entry.command.name);
        merged.push(entry);
      }
      context.logger.warn(
        `[command-sources] customized command name collision on '${collidedName}' across ${group.map((entry) => entry.sourceId).join(", ")}; falling back to canonical names: ${fallbackCommands.map((entry) => `${entry.command.sourceId} -> ${entry.command.name}`).join(", ")}`,
      );
      continue;
    }
    if (hasCustomizedCommand) {
      context.logger.warn(
        `[command-sources] customized command name collision on '${collidedName}' across ${group.map((entry) => entry.sourceId).join(", ")}; attempted canonical fallback but names still collide, keeping first`,
      );
    }
    for (let i = 0; i < group.length; i++) {
      const command = group[i]!.command;
      if (seen.has(command.name)) {
        context.logger.warn(
          `[command-sources] duplicate command '${command.name}' from source '${group[i]!.sourceId}', keeping first`,
        );
        continue;
      }
      seen.add(command.name);
      merged.push({ command, order: group[i]!.order });
    }
  }
  return merged.sort((left, right) => left.order - right.order).map((entry) => entry.command);
}

// ---------- catalog (plugin/command-inject.ts collision handling, config part) ----------

export function resolveDynamicCommandCollisions(
  commands: readonly CommandInfo[],
  reservedNames: ReadonlySet<string>,
  logger: Logger,
): CommandInfo[] {
  const groups = new Map<string, CommandInfo[]>();
  for (const command of commands) {
    const group = groups.get(command.name);
    if (group) {
      group.push(command);
      continue;
    }
    groups.set(command.name, [command]);
  }
  const resolved: CommandInfo[] = [];
  const takenNames = new Set(reservedNames);
  const processedNames = new Set<string>();
  for (const command of commands) {
    if (processedNames.has(command.name)) continue;
    processedNames.add(command.name);
    const group = groups.get(command.name) ?? [command];
    const collidesWithReserved = reservedNames.has(command.name);
    const hasCustomizedCommand = group.some((item) => item.usedCustomizedName === true);
    const fallbackNames = group.map((item) => item.canonicalName ?? item.name);
    const fallbackNamesAreUnique = new Set(fallbackNames).size === fallbackNames.length;
    const fallbackNamesAvailable = fallbackNames.every((name) => !takenNames.has(name));
    if (collidesWithReserved && hasCustomizedCommand && fallbackNamesAreUnique && fallbackNamesAvailable) {
      const fallbackCommands = group.map((item, index) => ({ ...item, name: fallbackNames[index]! }));
      for (const fallbackCommand of fallbackCommands) {
        takenNames.add(fallbackCommand.name);
        resolved.push(fallbackCommand);
      }
      logger.warn(
        `[command-inject] customized command name collision on '${command.name}' with config command; falling back to canonical names: ${fallbackCommands.map((c) => `${c.sourceId ?? "dynamic"} -> ${c.name}`).join(", ")}`,
      );
      continue;
    }
    if (collidesWithReserved) {
      if (hasCustomizedCommand) {
        logger.warn(
          `[command-inject] customized command name collision on '${command.name}' with config command; attempted canonical fallback but names still collide, keeping existing`,
        );
      } else {
        resolved.push(...group);
      }
      continue;
    }
    for (const item of group) {
      if (takenNames.has(item.name)) {
        logger.warn(`[command-inject] duplicate command '${item.name}' from dynamic sources, keeping existing`);
        continue;
      }
      takenNames.add(item.name);
      resolved.push(item);
    }
  }
  return resolved;
}

export async function loadCatalog(
  projectRoot: string,
  logger: Logger,
  config?: CommandInjectConfig,
): Promise<Map<string, CommandInfo>> {
  const dynamicSources: CommandSource[] = [];
  if (!config?.sources?.makefile?.disable) {
    dynamicSources.push(new MakefileCommandSource(config?.sources?.makefile, config?.command_name_prefix));
  }
  if (!config?.sources?.["npm-scripts"]?.disable) {
    dynamicSources.push(
      new NpmScriptsCommandSource(config?.sources?.["npm-scripts"], config?.command_name_prefix),
    );
  }
  let loadedSkills: LoadedSkillCommandInput[] = [];
  if (!config?.sources?.skill?.disable) {
    const discovered = await discoverSkills({ projectRoot, logger });
    loadedSkills = discovered.map((skill) => ({
      name: skill.name,
      description: skill.description,
      template: skill.template,
      body: skill.body,
    }));
  }
  if (loadedSkills.length > 0) {
    dynamicSources.push(
      new SkillCommandSource(loadedSkills, config?.sources?.skill, config?.command_name_prefix),
    );
  }
  const dynamicCommands = await aggregateCommandSources(dynamicSources, { rootDir: projectRoot, logger });
  // No access to other plugins' config commands in v2 (commands are
  // add-only), so reserve nothing and keep every non-duplicate command.
  const resolved = resolveDynamicCommandCollisions(dynamicCommands, new Set(), logger);
  return new Map(resolved.map((command) => [command.name, command]));
}

export function loadPluginConfigFile(projectRoot: string, logger: Logger): CommandInjectConfig | undefined {
  // Structural read of opencode-command-inject.{jsonc,json} (v1 used zod;
  // v2 port ignores unknown/invalid fields instead of failing).
  const candidates = [
    join(projectRoot, "opencode-command-inject.jsonc"),
    join(projectRoot, "opencode-command-inject.json"),
  ];
  const envPath = process.env.OPENCODE_COMMAND_INJECT_CONFIG;
  if (envPath) candidates.unshift(envPath);
  for (const p of candidates) {
    try {
      const raw = readFileSync(p, "utf8").replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|\s)\/\/.*$/gm, "$1");
      const parsed = JSON.parse(raw) as CommandInjectConfig;
      if (parsed && typeof parsed === "object") return parsed;
    } catch {
      // missing or invalid -> try next
    }
  }
  logger.debug?.(`[command-inject] no config file found under ${projectRoot}`);
  return undefined;
}
