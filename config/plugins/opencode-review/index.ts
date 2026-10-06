import { define } from "@opencode-ai/plugin/v2/promise";
import { loadConfig, getLang } from "./config.ts";
import { buildAgentPrompt, buildFixerPrompt, buildTogglePrompt } from "./agent.ts";
import { getDimensionPrompts } from "./dimensions/index.ts";

export default define({
  id: "opencode-review",
  setup: async (ctx) => {
    // NOTE (v1 -> v2): PluginContext carries no project/client/$ — only
    // `options` plus hook domains. loadConfig() needs a project directory,
    // so fall back to the server working directory for the
    // `<project>/.opencode/review.json` lookup (the global
    // `~/.config/opencode/review.json` lookup is unaffected).
    const config = await loadConfig(process.cwd());
    const agentPrompt = buildAgentPrompt(config);
    const fixerPrompt = buildFixerPrompt(config);
    const dimensionPrompts = getDimensionPrompts(config);
    const lang = getLang(config);

    await ctx.agent.transform((draft) => {
      draft.update("review", (agent) => {
        agent.mode = "primary";
        agent.steps = 30;
        agent.color = "accent";
        agent.permissions = [
          { action: "bash", resource: "git diff*", effect: "allow" },
          { action: "bash", resource: "git log*", effect: "allow" },
          { action: "bash", resource: "git show*", effect: "allow" },
        ];
      });

      draft.update("review:fixer", (agent) => {
        agent.mode = "subagent";
        agent.steps = 20;
        agent.system = fixerPrompt;
      });

      if (config.parallel) {
        for (const dim of dimensionPrompts) {
          draft.update(dim.agentName, (agent) => {
            agent.mode = "subagent";
            agent.steps = 30;
            agent.system = dim.prompt;
          });
        }
      }
    });

    const toggleDescriptions = {
      zh: "切换自动审查开关（on/off）",
      en: "Toggle auto-review on/off",
      tr: "Otomatik incelemeyi aç/kapat (on/off)",
    };

    await ctx.command.transform((draft) => {
      draft.update("review", (command) => {
        command.agent = "review";
        command.description = "Review code changes with structured feedback";
        command.template = agentPrompt;
      });

      draft.update("review:auto", (command) => {
        command.agent = "review";
        command.description = toggleDescriptions[lang];
        command.template = buildTogglePrompt(config);
      });
    });
  },
});
