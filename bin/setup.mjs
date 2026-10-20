#!/usr/bin/env node
// One-command opencode setup: MCPs, plugins, skills, AGENTS.md, commands, CLIs.
// Usage on a fresh machine (after `npm publish`, or via git):
//   npx opencode-blueprint            # full install
//   npx opencode-blueprint --dry-run  # print what would happen
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, copyFileSync, cpSync, rmSync, readFileSync, writeFileSync, readdirSync, lstatSync, renameSync, statSync } from "node:fs";
import { homedir } from "node:os";
import { join, dirname, delimiter } from "node:path";
import { fileURLToPath } from "node:url";

const DRY = process.argv.includes("--dry-run");
const REPO = join(dirname(fileURLToPath(import.meta.url)), "..");
const TARGET =
  process.env.OPENCODE_CONFIG_HOME ||
  join(homedir(), ".config", "opencode");
const SKILLS_DIR = join(homedir(), ".agents", "skills");

const log = (m) => console.log(m);
// A path that is not a regular file is never read or written: reading a
// directory throws, and writing through a link would put the file outside
// the config home. An installer that dies half way leaves a broken config
// home, and a link is not ours to replace either.
const isRegular = (p) => {
  try {
    const stat = lstatSync(p);
    return stat.isFile() && !stat.isSymbolicLink();
  } catch {
    return false;
  }
};
// A dangling link is a path that exists even though it resolves to nothing,
// so existsSync() (which follows the link) says false. The destination checks
// ask the path itself.
const existsAny = (p) => {
  try {
    lstatSync(p);
    return true;
  } catch {
    return false;
  }
};
// Windows .cmd/.ps1 shims (npx, npm, kodus) need a shell to spawn.
const SHELL = process.platform === "win32";
const run = (cmd, args, opts = {}) => {
  log(`$ ${cmd} ${args.join(" ")}`);
  if (DRY) return true;
  try {
    execFileSync(cmd, args, { stdio: "inherit", shell: SHELL, ...opts });
    return true;
  } catch (error) {
    // A step that fails (a network hiccup, a locked file, a path that is not a
    // directory) is reported and skipped. The installer keeps going and says
    // what it could not do; it does not die half way.
    log(`  keep ${cmd} ${args.join(" ")} (failed: ${error && error.status ? `exit ${error.status}` : "see above"})`);
    return false;
  }
};
const has = (cmd) => {
  try {
    execFileSync(cmd, ["--version"], { stdio: "ignore", shell: SHELL });
    return true;
  } catch {
    return false;
  }
};
// An absolute path to an executable needs no shell — and must NOT go through
// one on Windows: `cmd /c "C:\Program Files\...\python.exe ..."` breaks on the
// spaces in the path. execFileSync with an absolute path skips the shell.
const runAbs = (exe, args) => {
  log(`$ ${exe} ${args.join(" ")}`);
  if (DRY) return true;
  try {
    execFileSync(exe, args, { stdio: "inherit" });
    return true;
  } catch (error) {
    log(`  keep ${exe} ${args.join(" ")} (failed: ${error && error.status ? `exit ${error.status}` : "see above"})`);
    return false;
  }
};

// ------------------------------------------------------- node runtime probe
// The repo config pins an absolute Node exe + absolute CLI script for `rea`,
// because `npx` resolves whatever `node` is first on PATH and a machine-wide
// downgrade (e.g. to Node 18) crashes rea-agents with "does not provide an
// export named 'styleText'" (needs Node >= 20.12). So resolve at install
// time: newest nvm runtime, else the system-wide install, else this
// process's own runtime. Anything below the floor is rejected outright — a
// Node 18 path must never be written to the config.
const NODE_MIN = [20, 12, 0];
// The `skills` CLI (>= 1.7) imports `fs/promises.glob`, which only exists on
// Node >= 22.20 — under an older `node` on PATH every `skills add` dies with
// "The requested module 'fs/promises' does not provide an export named
// 'glob'". That floor is for the SKILLS step only; rea/rea-MCP is happy at
// NODE_MIN, so it keeps the lower floor.
const NODE_MIN_SKILLS = [22, 20, 0];
const verParts = (v) => String(v).trim().replace(/^v/, "").split(/[.+-]/).map((n) => Number.parseInt(n, 10) || 0);
const verCmp = (a, b) => {
  const x = typeof a === "string" ? verParts(a) : a;
  const y = typeof b === "string" ? verParts(b) : b;
  for (let i = 0; i < Math.max(x.length, y.length); i++) {
    const d = (x[i] || 0) - (y[i] || 0);
    if (d) return d;
  }
  return 0;
};
const nodeCandidates = () => {
  const found = [];
  const add = (exe) => {
    if (!exe || !existsSync(exe) || found.some((c) => c.exe === exe)) return;
    try {
      // --version on the exe itself: a node that cannot report its version
      // is not a runtime we can trust to spawn.
      const ver = execFileSync(exe, ["--version"], { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }).trim();
      if (ver) found.push({ exe, ver });
    } catch {
      // not a working node — ignore
    }
  };
  // nvm-for-windows: %LOCALAPPDATA%\nvm\v<major>.<minor>.<patch>\node.exe
  const localAppData = process.env.LOCALAPPDATA || join(homedir(), "AppData", "Local");
  const nvmRoot = join(localAppData, "nvm");
  if (existsSync(nvmRoot)) {
    for (const entry of readDirSafe(nvmRoot)) {
      if (entry.isDirectory()) add(join(nvmRoot, entry.name, "node.exe"));
    }
  }
  // System-wide install, then the runtime running this installer.
  add(join(process.env.ProgramFiles || "C:\\Program Files", "nodejs", "node.exe"));
  add(process.execPath);
  return found.sort((a, b) => verCmp(b.ver, a.ver));
};
// ----------------------------------------------------------- jsonc tolerant
// config/opencode.jsonc is JSONC (block/line comments, trailing commas), so
// JSON.parse throws on the copy this script just installed. Strip comments
// and trailing commas outside of strings, then parse.
const parseJsonc = (text) => {
  let out = "";
  let inStr = false;
  let esc = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    const next = text[i + 1];
    if (esc) {
      out += c;
      esc = false;
      continue;
    }
    if (c === "\\" && inStr) {
      out += c;
      esc = true;
      continue;
    }
    if (c === '"') {
      inStr = !inStr;
      out += c;
      continue;
    }
    if (!inStr && c === "/" && next === "/") {
      while (i < text.length && text[i] !== "\n") i++;
      out += "\n";
      continue;
    }
    if (!inStr && c === "/" && next === "*") {
      i += 2;
      while (i < text.length && !(text[i] === "*" && text[i + 1] === "/")) i++;
      i++;
      continue;
    }
    if (!inStr && c === ",") {
      // drop a comma that only precedes a closing bracket
      let j = i + 1;
      while (j < text.length && /\s/.test(text[j])) j++;
      if (text[j] === "}" || text[j] === "]") continue;
    }
    out += c;
  }
  return JSON.parse(out);
};

// --------------------------------------------------- jsonc surgical rewrite
// opencode.jsonc is JSONC, so the two MCP repoints below must never round-trip
// it through JSON.parse/JSON.stringify: JSON.parse throws on its comments (the
// repoint silently no-ops behind a `warn`), and a stringify rewrite deletes
// every comment the user wrote — including the `rea` entry's rationale. So
// rewrite ONLY the `"command": [ ... ]` array text, leaving the rest of the
// bytes (comments, blank lines, indentation, EOL style) untouched.
const escRe = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const replaceMcpCommand = (cfgPath, key, nextArgs) => {
  const raw = readFileSync(cfgPath, "utf8");
  // Anchor on the exact quoted key first (`"key"\s*:\s*\{`) so a key that is a
  // prefix of another (`rea` vs `rea-agents`) or a mention in prose cannot
  // match. `[^{}]*?` then walks to the entry's own `"command": [...]` — safe
  // because MCP entries are flat (no nested braces), and requiring the command
  // array before the closing `}` keeps the match on the right block even if the
  // key also appears in a comment.
  const re = new RegExp(`("${escRe(key)}"\\s*:\\s*\\{[^{}]*?"command"\\s*:\\s*)\\[[^\\]]*\\]`);
  if (!re.test(raw)) throw new Error(`no "${key}.command" array found in ${cfgPath}`);
  // Function replacement (not a "$1..." string) so a `$&`/`$'`-looking segment
  // in a Windows path is copied through verbatim.
  const next = raw.replace(re, (_full, head) => `${head}[${nextArgs.map((a) => JSON.stringify(String(a))).join(", ")}]`);
  // Validate in memory BEFORE writing: the result must still parse, and the
  // entry must carry exactly the array we meant to write. A regex that landed
  // on the wrong block fails here and leaves the file untouched.
  const parsed = parseJsonc(next);
  const cmd = parsed?.mcp?.[key]?.command;
  if (!Array.isArray(cmd) || JSON.stringify(cmd) !== JSON.stringify(nextArgs)) {
    throw new Error(`refusing to write ${cfgPath}: "${key}.command" would be ${JSON.stringify(cmd)}, expected ${JSON.stringify(nextArgs)}`);
  }
  writeFileSync(cfgPath, next);
  return cmd;
};

// ------------------------------------------------------- autoinvoke mirror
// Matt Pocock's user-invoked skills ship Claude's `disable-model-invocation:
// true`. OpenCode ignores that key, so those skills would stay model-
// autoinvocable and could fire against our own gates (/the-fool,
// /feature-forge, /code-reviewer). OpenCode's own key is
// `metadata.opencode/autoinvoke: "false"`, so mirror the Claude flag into
// OpenCode's namespace. `skills add` rewrites SKILL.md from upstream, so this
// has to run AFTER every install — and it must be idempotent: the key is
// rewritten in place, never duplicated.
const AUTOINVOKE_SKILLS = [
  "grilling", "grill-me", "grill-with-docs", "writing-for-agents",
  "domain-modeling", "research", "handoff", "retro", "prototype", "pr", "ask-matt",
];
const AUTOINVOKE_KEY = "opencode/autoinvoke";
const AUTOINVOKE_VALUE = '"false"';

// Returns a short status string for the log: missing | no-frontmatter |
// not-user-invoked | already-patched | patched | would-patch | unsupported
const patchAutoinvoke = (file) => {
  if (!existsSync(file)) return "missing";
  let text;
  try {
    if (!isRegular(file)) return "unsupported";
    text = readFileSync(file, "utf8");
  } catch {
    // A skill file that cannot be read (a directory, a locked file) is left
    // alone: the mirror is cosmetic, never worth an aborted install.
    return "unsupported";
  }
  const fm = text.match(/^---\r?\n([\s\S]*?)\r?\n---/);
  if (!fm) return "no-frontmatter";
  const lines = fm[1].split(/\r?\n/);
  // Only skills that opted out of model invocation need the mirror.
  if (!lines.some((l) => /^\s*disable-model-invocation:\s*true\s*$/.test(l))) return "not-user-invoked";
  const eol = text.includes("\r\n") ? "\r\n" : "\n";
  const isKey = (l) => l.trim().startsWith(AUTOINVOKE_KEY + ":");
  let metaIdx = -1;
  let metaInline = "";
  for (let i = 0; i < lines.length; i++) {
    const mm = lines[i].match(/^metadata:\s*(.*)$/);
    if (mm) {
      metaIdx = i;
      metaInline = mm[1].trim();
      break;
    }
  }
  let next;
  if (metaIdx === -1) {
    // No metadata mapping yet — add one, keeping every pre-existing key.
    next = [...lines, "metadata:", `  ${AUTOINVOKE_KEY}: ${AUTOINVOKE_VALUE}`];
  } else if (!metaInline) {
    // Block mapping: merge into it, keeping every pre-existing (nested) key.
    let end = lines.length;
    for (let i = metaIdx + 1; i < lines.length; i++) {
      if (lines[i].trim() && !/^\s/.test(lines[i])) {
        end = i;
        break;
      }
    }
    const children = lines.slice(metaIdx + 1, end).filter((l) => !isKey(l));
    const indent = (children.find((l) => l.trim()) || "  ").match(/^\s*/)[0] || "  ";
    next = [
      ...lines.slice(0, metaIdx + 1),
      `${indent}${AUTOINVOKE_KEY}: ${AUTOINVOKE_VALUE}`,
      ...children,
      ...lines.slice(end),
    ];
  } else if (metaInline.startsWith("{") && metaInline.endsWith("}")) {
    // Flow mapping: splice the key inside the braces.
    const parts = metaInline
      .slice(1, -1)
      .split(",")
      .map((p) => p.trim())
      .filter(Boolean)
      .filter((p) => !p.startsWith(AUTOINVOKE_KEY + ":"));
    parts.push(`${AUTOINVOKE_KEY}: ${AUTOINVOKE_VALUE}`);
    next = [...lines];
    next[metaIdx] = `metadata: { ${parts.join(", ")} }`;
  } else {
    return "unsupported";
  }
  const head = text.slice(0, fm[0].indexOf("\n") + 1);
  const tail = text.slice(fm[0].length);
  const patched = `${head}${next.join(eol)}${eol}---${tail}`;
  if (patched === text) return "already-patched";
  if (!DRY) {
    try {
      writeFileSync(file, patched);
    } catch {
      // A read-only or locked skill file keeps its content: the mirror is
      // cosmetic, never worth an aborted install.
      return "unsupported";
    }
  }
  return DRY ? "would-patch" : "patched";
};

// ---------------------------------------------------------------- skills
// [repo, skill names] — empty array = whole repo
const SKILLS = [
  ["xirothedev/skills", ["nestjs-best-practices", "nextjs-best-practices", "nextjs-nestjs-integration"]],
  ["prisma/skills", ["prisma-database-setup", "prisma-client-api", "prisma-cli", "prisma-postgres", "prisma-postgres-setup", "prisma-upgrade-v7", "prisma-mongodb-upgrade"]],
  ["Jeffallan/claude-skills", ["api-designer", "architecture-designer", "code-documenter", "code-reviewer", "database-optimizer", "debugging-wizard", "devops-engineer", "feature-forge", "fullstack-guardian", "graphql-architect", "javascript-pro", "kubernetes-specialist", "legacy-modernizer", "mcp-developer", "microservices-architect", "monitoring-expert", "nestjs-expert", "nextjs-developer", "playwright-expert", "postgres-pro", "react-expert", "secure-code-guardian", "security-reviewer", "spec-miner", "terraform-engineer", "test-master", "the-fool", "typescript-pro", "websocket-engineer"]],
  ["microsoft/azure-skills", ["microsoft-foundry"]],
  ["vercel-labs/agent-skills", ["vercel-react-best-practices"]],
  ["michaelshimeles/skills", ["before-and-after", "code-structure", "evidence-driven-testing", "new-feature", "unslop"]],
  ["kodustech/kodus-ai", ["perf-debug"]],
  ["coleam00/excalidraw-diagram-skill", []],
  ["pbakaus/impeccable", []],
  ["emilkowalski/skills", []],
  ["Leonxlnx/taste-skill@design-taste-frontend", []],
  ["shadcn-ui/ui@shadcn", []],
  ["expo/skills", ["expo-overview", "expo-router", "expo-upgrade", "expo-native-ui", "expo-data-fetching", "eas-app-stores", "eas-workflows", "eas-update"]],
  ["nodnarbnitram/claude-code-extensions", ["tauri-v2"]],
  ["morluto/rea", ["reverse-engineer-anything", "rea-changelog-update", "rea-ci-tests-audit", "rea-tool-design"]],
  ["cathrynlavery/diagram-design", ["diagram-design"]],
  ["heygen-com/hyperframes", ["hyperframes", "hyperframes-core", "hyperframes-animation", "hyperframes-audio", "hyperframes-cli", "hyperframes-creative", "hyperframes-keyframes", "hyperframes-registry", "hyperframes-studio", "media-use", "pr-to-video", "product-launch-video", "faceless-explainer", "general-video"]],
  // No `prototype` here on purpose: emilkowalski/skills ships the variants
  // picker that AGENTS.md routes for component work, mattpocock ships a
  // throwaway-prototype builder. One directory, one name — keep the routed one.
  ["mattpocock/skills", ["grilling", "grill-me", "grill-with-docs", "writing-for-agents", "domain-modeling", "research", "handoff", "retro", "pr", "ask-matt"]],
];

// ---------------------------------------------------------------- main
log("== 1/6 prerequisites ==");
const need = ["node", "npx", "git"];
const missing = need.filter((c) => !has(c));
if (missing.length) throw new Error(`Missing required tools: ${missing.join(", ")}`);
for (const c of ["gh", "python", "pipx"]) if (!has(c)) log(`  warn: ${c} not found (some steps will be skipped or need manual install)`);
log("  ok");

log("== 2/6 config files ==");
// A directory that cannot be created (a link, a path that is a file, a locked
// entry) is not ours to replace: skip it with a log instead of aborting the
// install half way.
const ensureDir = (dir) => {
  try {
    mkdirSync(dir, { recursive: true });
    return true;
  } catch {
    log(`  keep ${dir} (cannot create the directory)`);
    return false;
  }
};
// Whether the directory can hold the shipped files: a link or a file in the
// way cannot, and a path that does not exist yet can.
const dirReady = (dir) => {
  try {
    const stat = lstatSync(dir);
    if (stat.isSymbolicLink()) return false;
    return stat.isDirectory();
  } catch {
    return true;
  }
};
// Every filesystem operation that can fail on a path the user owns is wrapped:
// the installer keeps going and says what it skipped, instead of dying with a
// half installed config home.
const rmSafe = (p) => {
  try {
    rmSync(p, { recursive: true, force: true });
    return true;
  } catch {
    log(`  keep ${p} (cannot be removed)`);
    return false;
  }
};
const readDirSafe = (dir) => {
  try {
    if (!lstatSync(dir).isDirectory()) return [];
    return readdirSync(dir, { withFileTypes: true });
  } catch {
    return [];
  }
};
const readTextSafe = (p) => {
  try {
    if (!isRegular(p)) return null;
    return readFileSync(p, "utf8");
  } catch {
    return null;
  }
};
ensureDir(TARGET);
ensureDir(join(TARGET, "commands"));
ensureDir(join(TARGET, "plugins"));
const backup = (p) => {
  // A directory or a locked file cannot be copied: the backup is skipped and
  // the install continues.
  if (DRY || !isRegular(p)) return false;
  try {
    copyFileSync(p, `${p}.bak-${Date.now()}`);
    return true;
  } catch {
    log(`  keep ${p} (cannot be backed up)`);
    return false;
  }
};
backup(join(TARGET, "opencode.jsonc"));
backup(join(TARGET, "AGENTS.md"));
// Content comparison that ignores line endings: a Windows checkout can turn
// LF into CRLF, and that is not a user edit.
const sameContent = (a, b) => {
  try {
    return (
      readFileSync(a, "utf8").replace(/\r\n/g, "\n") ===
      readFileSync(b, "utf8").replace(/\r\n/g, "\n")
    );
  } catch {
    // A file that cannot be read (locked, deleted between the check and the
    // read) is not identical to anything: it is kept, not fatal.
    return false;
  }
};

// Copy a file, and never let one bad destination abort the install.
const copyOrKeep = (from, to) => {
  try {
    copyFileSync(from, to);
    return true;
  } catch {
    log(`  keep ${to} (cannot be written)`);
    return false;
  }
};
// Copy a tree over another one, file by file, without deleting what is
// already there.
const mergeDir = (src, dest) => {
  // A destination that is a link is not ours to write through: the copy would
  // land outside the config home. A destination that exists as a regular file
  // cannot hold the shipped directory either: creating it would throw and
  // abort the install half way.
  let destStat = null;
  try {
    destStat = lstatSync(dest);
  } catch {
    destStat = null;
  }
  if (destStat && destStat.isSymbolicLink()) {
    log(`  keep ${dest} (a link; not ours to write through)`);
    return;
  }
  if (destStat && isRegular(dest)) {
    log(`  keep ${dest} (you have a file where the shipped tree needs a directory)`);
    return;
  }
  try {
    mkdirSync(dest, { recursive: true });
  } catch {
    // A path that cannot become a directory (a link, a locked entry) is not
    // ours to replace: skip it instead of aborting the install.
    log(`  keep ${dest} (cannot create the directory)`);
    return;
  }
  for (const entry of readdirSync(src, { withFileTypes: true })) {
    const from = join(src, entry.name);
    const to = join(dest, entry.name);
    if (entry.isDirectory()) {
      mergeDir(from, to);
      continue;
    }
    if (!entry.isFile()) continue;
    // A destination that is not a regular file is never written: copying into
    // it throws, and one bad entry must not abort the whole install.
    if (existsAny(to) && !isRegular(to)) {
      log(`  keep ${to} (not a regular file; not ours to replace)`);
      continue;
    }
    copyOrKeep(from, to);
  }
};
const cp = (src, dest) => {
  log(`  copy ${src} -> ${dest}`);
  if (DRY) return true;
  try {
    if (isRegular(src)) {
      // A file is replaced atomically: write a temporary file next to it and
      // rename it over the destination. A remove-then-copy leaves a window
      // where the host reads an empty file, and an empty opencode.jsonc takes
      // every plugin, MCP and agent with it.
      const tmp = `${dest}.new-${process.pid}`;
      copyFileSync(src, tmp);
      renameSync(tmp, dest);
      // The destination must hold the shipped content. An empty file where the
      // source has bytes means the copy was truncated; say so loudly instead
      // of leaving the host without its config.
      try {
        if (statSync(dest).size === 0 && statSync(src).size > 0) {
          log(`  warn: ${dest} is empty after the copy — the host will start without it`);
        }
      } catch {
        // Nothing to compare.
      }
      return true;
    }
    if (existsAny(dest)) {
      // A link is not ours to replace: copying through it would write outside
      // the config home.
      try {
        if (lstatSync(dest).isSymbolicLink()) {
          log(`  keep ${dest} (a link; not ours to write through)`);
          return false;
        }
      } catch {
        // Fall through to the copy.
      }
      rmSafe(dest);
    }
    cpSync(src, dest, { recursive: true });
    return true;
  } catch {
    log(`  keep ${dest} (cannot be written)`);
    return false;
  }
};
cp(join(REPO, "config", "opencode.jsonc"), join(TARGET, "opencode.jsonc"));
cp(join(REPO, "AGENTS.md"), join(TARGET, "AGENTS.md"));
// The MCP servers that need a credential fail at connect time when the value
// is not in the process environment, and the host expands {env:NAME} from
// its own environment when it starts. A value set after the host started is
// invisible until it is restarted, so say it here instead of leaving the
// MCPs silently red.
const MCP_ENV = [
  ["GITHUB_TOKEN", "the github MCP (Authorization: Bearer {env:GITHUB_TOKEN})"],
  ["SENTRY_ACCESS_TOKEN", "the sentry MCP (Sentry-Bearer {env:SENTRY_ACCESS_TOKEN})"],
];
for (const [name, why] of MCP_ENV) {
  if (!process.env[name]) {
    log(`  note: ${name} is not in this process environment, so ${why} cannot connect`);
  }
}
log("  note: set a missing value in the environment that starts OpenCode, then restart the app; a value set after the start is not visible");
// opencode-mem opens a local Turso database that only one process may own.
// A second OpenCode server cannot open it, and the plugin reports itself as
// failed. One server at a time.
log("  note: opencode-mem holds a single-writer database; run one OpenCode server at a time");
// The commands directory holds the shipped commands and the ones the user
// wrote. Copy the shipped ones that are missing, keep a tuned file with a
// backup, and never remove a file this installer did not put there.
const cpDirIfMissing = (src, dest) => {
  log(`  copy ${src} -> ${dest} (missing files only)`);
  if (!dirReady(dest)) {
    log(`  keep ${dest} (cannot create the directory)`);
    return;
  }
  if (!DRY && !ensureDir(dest)) return;
  for (const entry of readdirSync(src, { withFileTypes: true })) {
    if (!entry.isFile()) continue;
    const from = join(src, entry.name);
    const to = join(dest, entry.name);
    if (!existsAny(to)) {
      log(`  copy ${from} -> ${to}`);
      if (!DRY) copyOrKeep(from, to);
      continue;
    }
    if (!isRegular(to)) {
      log(`  keep ${to} (not a regular file; not ours to replace)`);
      continue;
    }
    if (sameContent(to, from)) {
      log(`  skip ${to} (already current)`);
      continue;
    }
    backup(to);
    log(`  keep ${to} (you changed it; backed up, not overwritten)`);
  }
};
cpDirIfMissing(join(REPO, "config", "commands"), join(TARGET, "commands"));
// The orchestrator agent is a file, not a slim default: with
// setDefaultAgent=false slim no longer registers the name, and sessions or
// task sessions that still reference it fail to drain with `Agent not found`.
// V2 reads agent markdown from `agents/` (plural); the v1 `agent/` directory
// is ignored, which is why the file used to be missing at runtime.
// Installed per file, copy-if-missing: a tuned agent file survives an
// install, the same rule the `.env` template follows. A file that differs
// from the shipped one is kept and backed up, never overwritten.
const agentsSrc = join(REPO, "config", "agents");
const agentsDest = join(TARGET, "agents");
const agentsDirReady = dirReady(agentsDest);
if (agentsDirReady && !DRY) ensureDir(agentsDest);
for (const entry of readdirSync(agentsSrc, { withFileTypes: true })) {
  if (!entry.isFile() || !entry.name.endsWith(".md")) continue;
  if (!agentsDirReady) {
    log(`  skip ${join(agentsDest, entry.name)} (the agents directory could not be created)`);
    continue;
  }
  const src = join(agentsSrc, entry.name);
  const dest = join(agentsDest, entry.name);
  if (existsAny(dest)) {
    if (!isRegular(dest)) {
      log(`  keep ${dest} (not a regular file; not ours to replace)`);
      continue;
    }
    if (sameContent(dest, src)) {
      log(`  skip ${dest} (already current)`);
    } else {
      backup(dest);
      log(`  keep ${dest} (you changed it; backed up, not overwritten — delete it to take the shipped one)`);
    }
    continue;
  }
  log(`  copy ${src} -> ${dest}`);
  if (!DRY) copyOrKeep(src, dest);
}
// The V1 `agent/` directory is ignored by V2. Remove it only when it holds
// nothing but the exact file this installer shipped; anything else belongs to
// the user and is left alone.
const legacyAgentDir = join(TARGET, "agent");
if (existsAny(legacyAgentDir)) {
  const legacyEntries = readDirSafe(legacyAgentDir);
  const legacyFile = join(legacyAgentDir, "orchestrator.md");
  const shippedAgent = join(agentsSrc, "orchestrator.md");
  const isShippedCopy =
    legacyEntries.length === 1 &&
    isRegular(legacyFile) &&
    existsSync(shippedAgent) &&
    sameContent(legacyFile, shippedAgent);
  if (isShippedCopy) {
    rmSafe(legacyAgentDir);
    log(`  removed ${legacyAgentDir} (V2 reads agents/)`);
  } else {
    log(`  keep ${legacyAgentDir} (not the file this installer shipped; V2 ignores it, remove it yourself)`);
  }
}
// The plugins directory is a plain copy, but a link or a file in the way must
// not be written through.
const pluginsDir = join(TARGET, "plugins");
const pluginsDirReady = dirReady(pluginsDir);
if (!pluginsDirReady) log(`  keep ${pluginsDir} (a link or a file; not ours to write through)`);
for (const plugin of [
  "opencode-review",
  "opencode-code-review",
  "opencode-dcp",
  "opencode-github-release",
  "opencode-telemetry",
  "envsitter-guard",
  "opencode-log-sanitizer",
  "opencode-command-inject",
  "opencode-ralph-wiggum",
  "opencode-mem",
]) {
  if (!pluginsDirReady) {
    log(`  skip ${join(pluginsDir, plugin)} (the plugins directory is not ours to write into)`);
    continue;
  }
  cp(join(REPO, "config", "plugins", plugin), join(pluginsDir, plugin));
}
// mcp-env wrapper: loads <config>/.env and expands {env:...} for local MCP
// servers, because OpenCode's own expansion reads only its process
// environment. Without it DATABASE_URL / REDIS_URL arrive empty.
const toolsDir = join(TARGET, "tools");
const toolsDirReady = dirReady(toolsDir);
if (!toolsDirReady) log(`  keep ${toolsDir} (a link or a file; not ours to write through)`);
else {
  if (!DRY) ensureDir(toolsDir);
  cp(join(REPO, "config", "tools", "mcp-env.mjs"), join(toolsDir, "mcp-env.mjs"));
}
// Copy .env.example as a starter template only — never overwrite an existing
// (possibly filled-in) .env.example in TARGET.
const envExampleDest = join(TARGET, ".env.example");
if (!existsSync(envExampleDest)) {
  cp(join(REPO, "config", ".env.example"), envExampleDest);
} else {
  log(`  skip ${envExampleDest} (already exists — not overwriting filled template)`);
}
// Create the .env the mcp-env wrapper reads. Without it DATABASE_URL /
// REDIS_URL / MDB_MCP_CONNECTION_STRING are missing and those MCPs die at
// startup (postgres: `new URL('')`). Copy the template if missing — never
// overwrite an existing .env, it holds real credentials.
const envDest = join(TARGET, ".env");
if (!existsSync(envDest)) {
  cp(join(REPO, "config", ".env.example"), envDest);
} else {
  log(`  skip ${envDest} (already exists — not overwriting real credentials)`);
}
// Slim plugin config: setDefaultAgent=false so sessions keep the native
// default agent. Slim otherwise stamps orchestrator as default, and during
// multi-project restore sessions drain before the per-directory agent draft
// is ready and die with `Agent not found: "orchestrator"`. Copy-if-missing
// only — never overwrite a user-tuned config.
const slimCfgDest = join(TARGET, "oh-my-opencode-slim.jsonc");
if (!existsSync(slimCfgDest)) {
  cp(join(REPO, "config", "oh-my-opencode-slim.jsonc"), slimCfgDest);
} else {
  log(`  skip ${slimCfgDest} (already exists — not overwriting user config)`);
}

log("== 3/6 local plugin deps (review, code-review, mem, dcp + 6 ports) ==");
// The dependency installs write into the plugin directories: when the plugins
// directory is a link or a file, npm would create it and write outside the
// config home, so the step is skipped instead.
const pluginPrefix = (dir) => join(TARGET, "plugins", dir);
if (!pluginsDirReady) {
  log(`  skip the plugin dependencies (${pluginsDir} is not ours to write into)`);
} else {
  run("npm", ["install", "--prefix", pluginPrefix("opencode-review"), "@opencode-ai/plugin"]);
  // opencode-dcp is a vendored npm tree (deps pinned in its package.json):
  // production-only install. --legacy-peer-deps works around an upstream
  // dev-tree conflict (dev @opencode/plugin wants @opentui/core >=0.5.14
  // while the package pins ^0.4.5); --omit=dev keeps the 0.4.x runtime the
  // TUI entry was built against. No version upgrades beyond the pins.
  run("npm", ["install", "--prefix", pluginPrefix("opencode-dcp"), "--omit=dev", "--legacy-peer-deps", "--no-audit", "--no-fund"]);
  // Ported plugins (deps pinned in each package.json) — same production flags.
  // opencode-mem is NOT here: it installs into the config home, because the Bun
  // loader resolves bare imports up to TARGET/node_modules, not from the plugin
  // directory. A local tree there is invisible to the loader (and 864 MB of
  // duplicated dependencies).
  for (const name of ["opencode-github-release", "opencode-telemetry", "envsitter-guard", "opencode-log-sanitizer", "opencode-command-inject", "opencode-ralph-wiggum", "opencode-code-review"]) {
    run("npm", ["install", "--prefix", pluginPrefix(name), "--omit=dev", "--legacy-peer-deps", "--no-audit", "--no-fund"]);
  }
}
// Central fallback deps: the Bun loader walks bare imports up to
// TARGET/node_modules, so the central copy must expose ./v2/promise
// (>=1.18.29). opencode-mem is here for the same reason — its own tree inside
// plugins/opencode-mem is never consulted. Merge into TARGET/package.json
// (never overwrite other keys), then install. Without this, path plugins fall
// back to a stale central copy and fail with "Cannot find package".
const centralPkgPath = join(TARGET, "package.json");
let centralPkg = {};
const centralPkgText = readTextSafe(centralPkgPath);
if (centralPkgText !== null) {
  try {
    centralPkg = JSON.parse(centralPkgText);
  } catch {
    log(`  keep ${centralPkgPath} (not valid JSON; the dependencies are not merged)`);
    centralPkg = {};
  }
} else if (existsAny(centralPkgPath)) {
  log(`  keep ${centralPkgPath} (not a regular file; the dependencies are not merged)`);
}
centralPkg.dependencies = {
  ...(centralPkg.dependencies || {}),
  "@opencode-ai/plugin": "^1.19.1",
  "opencode-mem": "2.32.0",
};
if (!DRY) {
  try {
    writeFileSync(centralPkgPath, JSON.stringify(centralPkg, null, 2) + "\n");
  } catch {
    log(`  keep ${centralPkgPath} (cannot be written)`);
  }
} else log(`  write ${centralPkgPath} (merge @opencode-ai/plugin into dependencies)`);
run("npm", ["install", "--prefix", TARGET, "--no-audit", "--no-fund"]);

log("== 4/6 skills (global, agent=opencode) ==");
let skillsRootReady = dirReady(SKILLS_DIR);
if (skillsRootReady) {
  // ensureDir owns the creation: a path that cannot become a directory (a
  // link, an ancestor that is a file) is kept, not fatal.
  skillsRootReady = ensureDir(SKILLS_DIR);
} else {
  log(`  keep ${SKILLS_DIR} (a link or a file; the global skills are not installed)`);
}
// `npx` resolves `node` from PATH, so a machine-wide Node 20 makes the
// skills CLI (which needs Node >= 22.20 for fs/promises.glob) crash on EVERY
// entry. Resolve a newer runtime and put its directory FIRST on PATH for the
// duration of the install loop only.
const skillsCands = nodeCandidates();
const skillsOk = skillsCands.filter((c) => verCmp(c.ver, NODE_MIN_SKILLS) >= 0);
if (!skillsOk.length) {
  throw new Error(
    `no Node >= ${NODE_MIN_SKILLS.join(".")} found for the skills step (candidates: ${skillsCands.map((c) => `${c.exe} -> ${c.ver}`).join(", ") || "none"}) — the skills CLI needs Node >= 22.20 for fs/promises.glob; install one and rerun`,
  );
}
// Prefer a runtime that ships its own npx: npx.cmd runs the node next to it,
// so PATH and the CLI's runtime stay on the same version.
const skillsNode = skillsOk.find((c) => existsSync(join(dirname(c.exe), process.platform === "win32" ? "npx.cmd" : "npx"))) || skillsOk[0];
log(`  skills step node -> ${skillsNode.exe} (${skillsNode.ver})`);
const skillsPath = process.env.PATH || "";
process.env.PATH = `${dirname(skillsNode.exe)}${delimiter}${skillsPath}`;
try {
  for (const [repo, skills] of SKILLS) {
    if (!skillsRootReady) {
      log(`  skip ${repo} (the global skills directory is not ours to write into)`);
      continue;
    }
    const args = ["-y", "skills", "add", repo];
    for (const s of skills) args.push("-s", s);
    args.push("-a", "opencode", "-g", "-y");
    run("npx", args);
  }
} finally {
  process.env.PATH = skillsPath;
}
// `skills add` rewrote SKILL.md above, so re-apply OpenCode's autoinvoke
// opt-out for the user-invoked skills (idempotent — see patchAutoinvoke).
for (const name of AUTOINVOKE_SKILLS) {
  log(`  autoinvoke ${name} -> ${patchAutoinvoke(join(SKILLS_DIR, name, "SKILL.md"))}`);
}
// Vendored local/workflow skills (skills/ in this repo) — cannot be installed
// via `skills add`. The shipped tree is merged over the installed one: the
// versioned files are replaced, a file the user added is kept, and a file the
// user changed in a shipped one is replaced like the rest of the versioned
// content (unlike .env.example above).
const VENDORED_SKILLS = ["architect", "audit", "check", "code-review", "debug", "design-system", "develop", "document", "kodus-review", "living-docs", "opencode-github", "pr-agent", "repo-standards", "scope", "ship", "skill-routing", "sync", "test", "write-swift"];
for (const name of VENDORED_SKILLS) {
  const src = join(REPO, "skills", name);
  const dest = join(SKILLS_DIR, name);
  if (!skillsRootReady) {
    log(`  skip skills/${name} (the global skills directory is not ours to write into)`);
    continue;
  }
  if (!existsSync(src)) {
    log(`  skip skills/${name} (not in repo skills/)`);
    continue;
  }
  log(`  copy skills/${name} -> ${dest}`);
  if (!DRY) {
    // Merge over the existing tree instead of deleting it: the shipped files
    // are versioned content and may be replaced, but a file the user added
    // to a vendored skill must not disappear without a copy.
    mergeDir(src, dest);
  }
}

log("== 5/6 CLIs ==");
run("npm", ["install", "-g", "@kodus/cli"]);
if (has("python")) {
  run("python", ["-m", "pip", "install", "redis-mcp-server"]);
  // The repo's redis MCP entry points at the author's exe path — repoint it
  // at this machine's install (pip Scripts dir differs per user/machine).
  if (!DRY) {
    try {
      const scripts = execFileSync("python", ["-c", "import sysconfig; print(sysconfig.get_path('scripts'))"], { encoding: "utf8" }).trim();
      const exe = join(scripts, "redis-mcp-server.exe");
      // The entry must not point at an exe that was never installed: a failed
      // pip install leaves the repo's absolute paths in place.
      if (!existsSync(exe)) {
        log(`  warn: ${exe} missing after install — redis MCP left at the repo's absolute paths`);
      } else {
        const cfgPath = join(TARGET, "opencode.jsonc");
        // JSONC-aware: JSON.parse throws on this file's comments, and a
        // JSON.stringify round-trip would strip them.
        replaceMcpCommand(cfgPath, "redis", [process.execPath, join(TARGET, "tools", "mcp-env.mjs"), exe, "--url", "@REDIS_URL@"]);
        log(`  redis MCP -> ${exe}`);
      }
    } catch (e) {
      log(`  warn: could not repoint redis MCP (${e.message})`);
    }
  } else {
    log("  [dry-run] would repoint redis MCP at this machine's pip Scripts dir");
  }
} else log("  skip: redis-mcp-server (no python)");

// The repo's rea entry points at the author's nvm dir + CLI script — repoint
// it at this machine's install (both are absolute, neither is portable). Same
// pattern as the redis repoint above; the version is pinned, and both repoints
// rewrite only the `"command": [...]` array in place, so the user's comments
// (and this entry's own rationale) survive the install.
const REA_PKG = "rea-agents@6.5.0";
const REA_DIR = join(TARGET, "tools", "rea-agents");
const REA_CLI = join(REA_DIR, "node_modules", "rea-agents", "scripts", "rea.mjs");
if (toolsDirReady) {
  run("npm", ["install", "--prefix", REA_DIR, "--no-audit", "--no-fund", REA_PKG]);
} else {
  log(`  skip ${REA_PKG} (${toolsDir} is not ours to write into)`);
}
if (DRY) {
  log("  [dry-run] would repoint rea MCP at this machine's newest Node >= 20.12 + the installed rea.mjs");
} else if (!existsSync(REA_CLI)) {
  log(`  warn: ${REA_CLI} missing after install — rea MCP left at the repo's absolute paths`);
} else {
  try {
    const cfgPath = join(TARGET, "opencode.jsonc");
    const cfg = parseJsonc(readFileSync(cfgPath, "utf8"));
    const cands = nodeCandidates();
    const picked = cands.find((c) => verCmp(c.ver, NODE_MIN) >= 0);
    if (!cfg?.mcp?.rea) throw new Error(`no mcp.rea entry in ${cfgPath}`);
    // Never write a too-old runtime: a Node 18 exe makes rea-agents@6.5.0
    // crash on `styleText`, which is worse than an unrepointed entry.
    if (!picked) {
      throw new Error(`no Node >= ${NODE_MIN.join(".")} found (candidates: ${cands.map((c) => `${c.exe} -> ${c.ver}`).join(", ") || "none"}) — install Node >= ${NODE_MIN.join(".")} and rerun, rea MCP left untouched`);
    }
    replaceMcpCommand(cfgPath, "rea", [picked.exe, REA_CLI, "mcp"]);
    log(`  rea MCP -> ${picked.exe} (${picked.ver}) + ${REA_CLI}`);
  } catch (e) {
    log(`  warn: could not repoint rea MCP (${e.message})`);
  }
}

// The repo config pins the local MCPs below at the author's absolute paths
// (prisma, postgres, mongodb, kubernetes, google-analytics). A fresh install
// on another machine would inherit those dead paths, so each tool is
// installed into TARGET/tools/<name> and the entry is repointed at the
// machine-local install. Same pattern as the rea block above: the install
// runs first, the repoint only ever writes a path that exists afterwards,
// and the rewrite touches the `"command": [...]` array only — the file's
// comments survive.
const NODE_MIN_MCP = [20, 19, 0]; // prisma 7 + mongodb-mcp-server 3 engines
const mcpCands = nodeCandidates();
const mcpNode = mcpCands.find((c) => verCmp(c.ver, NODE_MIN_MCP) >= 0);
// kubernetes-mcp-server ships one native binary package per platform; the
// repo config pins the Windows one, so pick the package for THIS machine.
const K8S_PLATFORM = `${process.platform === "win32" ? "windows" : process.platform === "darwin" ? "darwin" : "linux"}-${process.arch === "x64" ? "amd64" : process.arch === "arm64" ? "arm64" : process.arch}`;
// [mcp key, tool dir, pinned npm package, entry path inside the tool dir,
//  trailing command args, launcher]
const MCP_TOOL_INSTALLS = [
  {
    key: "prisma",
    dir: "prisma",
    pkg: "prisma@7.10.1",
    entry: ["node_modules", "prisma", "build", "index.js"],
    args: ["mcp"],
    via: "node",
  },
  {
    key: "postgres",
    dir: "postgres-mcp",
    pkg: "@modelcontextprotocol/server-postgres@0.6.2",
    entry: ["node_modules", "@modelcontextprotocol", "server-postgres", "dist", "index.js"],
    args: ["@DATABASE_URL@"],
    via: "node",
    // postgres reads the URL from argv, and mongodb reads
    // MDB_MCP_CONNECTION_STRING from env: both need mcp-env to load
    // <config>/.env. The host's {env:...} expansion runs before this process
    // starts and would pass "" instead.
    wrap: true,
  },
  {
    key: "mongodb",
    dir: "mongodb-mcp",
    pkg: "mongodb-mcp-server@3.1.0",
    entry: ["node_modules", "mongodb-mcp-server", "dist", "esm", "index.js"],
    args: ["--readOnly"],
    via: "node",
    wrap: true,
  },
  {
    key: "kubernetes",
    dir: "kubernetes-mcp",
    pkg: "kubernetes-mcp-server@0.0.67",
    entry: [
      "node_modules",
      `kubernetes-mcp-server-${K8S_PLATFORM}`,
      "bin",
      `kubernetes-mcp-server-${K8S_PLATFORM}${process.platform === "win32" ? ".exe" : ""}`,
    ],
    args: [],
    via: "exe",
  },
];

for (const t of MCP_TOOL_INSTALLS) {
  const dir = join(TARGET, "tools", t.dir);
  const entryPath = join(dir, ...t.entry);
  if (!toolsDirReady) {
    log(`  skip ${t.pkg} (${toolsDir} is not ours to write into)`);
    continue;
  }
  log(`  install ${t.pkg} -> ${dir}`);
  run("npm", ["install", "--prefix", dir, "--no-audit", "--no-fund", t.pkg]);
  // node <entry> <args> for the JS MCPs; the platform binary itself for
  // kubernetes (a native exe, not a node script).
  const launcher = t.via === "node" ? mcpNode?.exe : null;
  if (DRY) {
    log(`  [dry-run] would repoint ${t.key} MCP at ${launcher ? `${launcher} ` : ""}${entryPath}${t.args.length ? ` ${t.args.join(" ")}` : ""}`);
    continue;
  }
  if (t.via === "node" && !launcher) {
    // Never write a too-old runtime: prisma 7 / mongodb-mcp-server 3 need
    // Node >= 20.19 and crash on anything older.
    log(`  warn: no Node >= ${NODE_MIN_MCP.join(".")} found (candidates: ${mcpCands.map((c) => `${c.exe} -> ${c.ver}`).join(", ") || "none"}) — ${t.key} MCP left at the repo's absolute paths`);
    continue;
  }
  if (!existsSync(entryPath)) {
    log(`  warn: ${entryPath} missing after install — ${t.key} MCP left at the repo's absolute paths`);
    continue;
  }
  try {
    const cfgPath = join(TARGET, "opencode.jsonc");
    const mcpEnv = join(TARGET, "tools", "mcp-env.mjs");
    const cmd = t.wrap
      ? [launcher, mcpEnv, launcher, entryPath, ...t.args]
      : [...(launcher ? [launcher] : []), entryPath, ...t.args];
    replaceMcpCommand(cfgPath, t.key, cmd);
    log(`  ${t.key} MCP -> ${cmd.join(" ")}`);
  } catch (e) {
    log(`  warn: could not repoint ${t.key} MCP (${e.message})`);
  }
}

// google-analytics is a PyPI package, not an npm one: build a venv under
// TARGET/tools/analytics-mcp, install the pinned wheel into it and point
// the MCP at the venv's console script. Guarded end-to-end — no python, a
// slow venv build or a failed pip install must warn and continue, never
// abort the whole install.
const ANALYTICS_PKG = "analytics-mcp==0.7.0";
const ANALYTICS_DIR = join(TARGET, "tools", "analytics-mcp");
const ANALYTICS_VENV = join(ANALYTICS_DIR, ".venv");
const ANALYTICS_BIN = join(ANALYTICS_VENV, process.platform === "win32" ? "Scripts" : "bin");
const ANALYTICS_PY = join(ANALYTICS_BIN, process.platform === "win32" ? "python.exe" : "python");
const ANALYTICS_EXE = join(ANALYTICS_BIN, process.platform === "win32" ? "analytics-mcp.exe" : "analytics-mcp");
if (!has("python")) {
  log("  skip: analytics-mcp (no python)");
} else if (!toolsDirReady) {
  log(`  skip: analytics-mcp (${toolsDir} is not ours to write into)`);
} else {
  try {
    log(`  install ${ANALYTICS_PKG} -> ${ANALYTICS_DIR} (venv)`);
    run("python", ["-m", "venv", ANALYTICS_VENV]);
    runAbs(ANALYTICS_PY, ["-m", "pip", "install", ANALYTICS_PKG]);
    if (DRY) {
      log(`  [dry-run] would repoint google-analytics MCP at ${ANALYTICS_EXE}`);
    } else if (!existsSync(ANALYTICS_EXE)) {
      log(`  warn: ${ANALYTICS_EXE} missing after install — google-analytics MCP left at the repo's absolute paths`);
    } else {
      try {
        const cfgPath = join(TARGET, "opencode.jsonc");
        replaceMcpCommand(cfgPath, "google-analytics", [process.execPath, join(TARGET, "tools", "mcp-env.mjs"), ANALYTICS_EXE]);
        log(`  google-analytics MCP -> ${ANALYTICS_EXE}`);
      } catch (e) {
        log(`  warn: could not repoint google-analytics MCP (${e.message})`);
      }
    }
  } catch (e) {
    log(`  warn: analytics-mcp install failed (${e.message}) — google-analytics MCP left at the repo's absolute paths`);
  }
}

log("== 6/6 manual steps (cannot be automated) ==");
log(`
  1. Auth:  kodus auth login   (or export KODUS_TEAM_KEY)
            gh auth login
  2. Env (the installer copies config/.env.example to .env in the opencode
     config dir if missing — fill the placeholders in, never overwrite it):
      CONTEXT7_API_KEY, SENTRY_ACCESS_TOKEN,
      GOOGLE_APPLICATION_CREDENTIALS, GOOGLE_PROJECT_ID, DATABASE_URL,
      MDB_MCP_CONNECTION_STRING, REDIS_URL, OPENCODE_ZEN_API_KEY,
      KODUS_TEAM_KEY (or: kodus auth login)
  3. Cluster: configure kubeconfig for the kubernetes MCP.
  4. Restart opencode (config is loaded once at startup).
  5. Per repo: run /pr-agent-setup once (adds PR-Agent Action; set OPENAI_KEY secret).
`);
log(DRY ? "DRY RUN — nothing executed." : "Done.");
