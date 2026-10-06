import { Plugin } from "@opencode/plugin";
import {
  injectCommandArguments,
  loadCatalog,
  loadPluginConfigFile,
  type CommandInfo,
} from "./lib.ts";

function buildListOutput(catalog: Map<string, CommandInfo>): string {
  if (catalog.size === 0) return "No project commands discovered (no Makefile targets, npm scripts, or local skills).";
  const lines = [`Discovered ${catalog.size} project command(s):`, ""];
  for (const cmd of catalog.values()) {
    lines.push(`- ${cmd.name} — ${cmd.description} [${cmd.sourceId ?? "dynamic"}]`);
  }
  lines.push("", "Tip: invoke one by starting your message with its name, e.g. `make:build --release`.");
  return lines.join("\n");
}

function tryExpandPrompt(
  text: string,
  catalog: Map<string, CommandInfo>,
): string | null {
  // v1 `command.execute.before` replacement: when the user message starts
  // with a discovered command name, expand it to the stored template with
  // $ARGUMENTS substituted (same injectCommandArguments semantics).
  const trimmed = text.trimStart();
  const stripped = trimmed.startsWith("/") ? trimmed.slice(1) : trimmed;
  for (const cmd of catalog.values()) {
    if (stripped === cmd.name || stripped.startsWith(`${cmd.name} `) || stripped.startsWith(`${cmd.name}\n`)) {
      const rest = stripped.slice(cmd.name.length).trim();
      return injectCommandArguments(cmd.template, rest);
    }
  }
  return null;
}

export default Plugin.define({
  id: "opencode-command-inject",
  async setup(ctx) {
    // NOTE (v1 -> v2): v1 mutated host config (`config` hook injecting
    // config.command entries) and patched execution via
    // `command.execute.before`. Both are BLOCKED in v2 (commands are
    // add-only; no command.execute.before hook exists). This port instead:
    //  - registers one OWNED command (`project-commands`) listing the
    //    discovered Makefile / npm-script / skill catalog, and
    //  - observes user prompts via the session prompt hook, expanding a
    //    leading discovered command name into its template (the v1
    //    injectCommandArguments behavior, relocated to admission time).
    const logger = { warn: (msg: string) => console.warn(msg) };
    const projectRoot = process.cwd();
    const config = loadPluginConfigFile(projectRoot, logger);
    let catalog = await loadCatalog(projectRoot, logger, config);

    await ctx.command.transform((ed) => {
      ed.add({
        name: "project-commands",
        description:
          "List auto-discovered project commands (Makefile targets, package.json scripts, local skills).",
        async execute(_args: unknown) {
          catalog = await loadCatalog(projectRoot, logger, config);
          return buildListOutput(catalog);
        },
      });
    });

    await ctx.session.hook("prompt", (e: unknown) => {
      const ev = (e ?? {}) as Record<string, unknown>;
      const prompt = ev.prompt as Record<string, unknown> | undefined;
      if (!prompt || typeof prompt.text !== "string") return;
      const expanded = tryExpandPrompt(prompt.text as string, catalog);
      if (expanded) prompt.text = expanded;
    });
  },
});
