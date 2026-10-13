import { define } from "@opencode-ai/plugin/v2/promise";
import {
  RalphStateManager,
  buildRalphStartResponse,
  detectCompletionPromise,
  extractTextContent,
  formatDuration,
} from "./state.ts";

function startLoop(
  stateManager: RalphStateManager,
  args: { prompt?: string; maxIterations?: number; completionPromise?: string },
  sessionID?: string,
): string {
  const prompt = (args.prompt ?? "").trim();
  if (!prompt) {
    return `❌ Error: No prompt provided. Ralph needs a task description to work on.`;
  }
  if (args.maxIterations !== undefined && args.maxIterations < 0) {
    return `❌ Error: max-iterations must be 0 (unlimited) or a positive number, got: ${args.maxIterations}`;
  }
  if (args.completionPromise !== undefined && args.completionPromise.trim() === "") {
    return `❌ Error: completion-promise cannot be empty. Either provide a meaningful phrase or omit the parameter.`;
  }
  try {
    const existingState = stateManager.getState();
    if (existingState?.active) {
      return `❌ Ralph loop already active (iteration ${existingState.iteration}).\n\nUse /cancel-ralph to stop it first.`;
    }
    const newState = stateManager.setState(
      {
        prompt,
        maxIterations: args.maxIterations ?? 50,
        completionPromise: args.completionPromise?.trim() || undefined,
      },
      sessionID,
    );
    return `${buildRalphStartResponse(newState)}\n\n📝 **Starting Task:**\n\n${newState.originalPrompt}`;
  } catch (error) {
    return `❌ Ralph loop setup failed: ${error instanceof Error ? error.message : "Unknown error"}`;
  }
}

function continueLoop(stateManager: RalphStateManager): string {
  try {
    const state = stateManager.getState();
    if (!state?.active) {
      return "ℹ️  No active Ralph loop found. Start one with /ralph-loop first.";
    }
    if (stateManager.hasReachedMaxIterations()) {
      stateManager.clearState();
      return `🛑 Ralph loop completed - reached max iterations (${state.maxIterations})`;
    }
    const updatedState = stateManager.incrementIteration();
    let response = `🔄 **Ralph iteration ${updatedState.iteration}**\n\n`;
    if (updatedState.completionPromise) {
      response += `To stop: output \`<promise>${updatedState.completionPromise}</promise>\` when truly done\n\n`;
    }
    if (updatedState.maxIterations > 0) {
      const remaining = updatedState.maxIterations - updatedState.iteration;
      response += `**${remaining} iterations remaining**\n\n`;
    }
    response += `**Continuing task:** ${updatedState.originalPrompt}`;
    return response;
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return (
      `❌ Failed to continue Ralph loop: ${message}\n\n` +
      `This may be due to disk space or file permissions. ` +
      `Try canceling and restarting the loop.`
    );
  }
}

function cancelLoop(stateManager: RalphStateManager): string {
  try {
    const state = stateManager.getState();
    if (!state?.active) {
      return "ℹ️  No active Ralph loop found.";
    }
    const iteration = state.iteration;
    let durationText = "unknown";
    try {
      const startTime = new Date(state.startedAt);
      durationText = formatDuration(Math.round((Date.now() - startTime.getTime()) / 1000));
    } catch (error) {
      console.warn("Could not calculate loop duration:", error);
    }
    const truncatedPrompt =
      state.originalPrompt.length > 100 ? state.originalPrompt.substring(0, 100) + "..." : state.originalPrompt;
    stateManager.clearState();
    return (
      `✅ **Cancelled Ralph loop**\n\n` +
      `- Was at iteration: ${iteration}\n` +
      `- Running for: ${durationText}\n` +
      `- Original prompt: "${truncatedPrompt}"`
    );
  } catch (error) {
    return `❌ Failed to cancel Ralph loop: ${error instanceof Error ? error.message : "Unknown error"}`;
  }
}

function parseLoopArgs(text: string): { prompt?: string; maxIterations?: number; completionPromise?: string } {
  // Accept: PROMPT [MAX_ITERATIONS] [COMPLETION_PROMISE] plus
  // --max-iterations N / --completion-promise TEXT flags.
  const out: { prompt?: string; maxIterations?: number; completionPromise?: string } = {};
  const maxFlag = text.match(/--max-iterations\s+(\d+)/);
  if (maxFlag) out.maxIterations = parseInt(maxFlag[1]!, 10);
  const promiseFlag = text.match(/--completion-promise\s+"([^"]+)"|--completion-promise\s+'([^']+)'|--completion-promise\s+(\S+)/);
  if (promiseFlag) out.completionPromise = (promiseFlag[1] ?? promiseFlag[2] ?? promiseFlag[3] ?? "").trim();
  const positional = text
    .replace(/--max-iterations\s+\d+/g, "")
    .replace(/--completion-promise\s+("[^"]+"|'[^']+'|\S+)/g, "")
    .trim()
    .replace(/^["']|["']$/g, "")
    .trim();
  // Trailing bare numbers / quoted phrases act as MAX_ITERATIONS / PROMISE.
  const tailPromise = positional.match(/^(.*?)\s+"([^"]+)"\s*$/);
  const tailNumber = positional.match(/^(.*?)\s+(\d+)\s*$/);
  if (out.completionPromise === undefined && tailPromise && out.maxIterations === undefined) {
    const maybeNum = tailPromise[1]!.match(/^(.*?)\s+(\d+)\s*$/);
    if (maybeNum) {
      out.maxIterations = parseInt(maybeNum[2]!, 10);
      out.prompt = maybeNum[1]!.trim();
      out.completionPromise = tailPromise[2]!.trim();
    } else {
      out.prompt = tailPromise[1]!.trim();
      out.completionPromise = tailPromise[2]!.trim();
    }
  } else if (out.maxIterations === undefined && tailNumber && out.completionPromise === undefined) {
    out.prompt = tailNumber[1]!.trim();
    out.maxIterations = parseInt(tailNumber[2]!, 10);
  } else {
    out.prompt = positional;
  }
  return out;
}

export default define({
  id: "opencode-ralph-wiggum",
  async setup(ctx) {
    // NOTE (v1 -> v2): v1 imported { tool } from "@opencode-ai/plugin" (the
    // isolated-npm-cache failure: "Cannot find package @opencode-ai/plugin").
    // This port vendors the state/event logic locally (state.ts,
    // commands/*.md) and registers tools through ctx.tool.transform, so no
    // external plugin package is resolved at runtime. v1's onLoad/onUnload
    // logs move into setup; automatic session.idle continuation stays OFF
    // (upstream disabled it to prevent freezing) — idle only enforces the
    // max-iteration stop. Completion-promise detection moves to v2
    // session.text.* events (message.updated does not exist in v2).
    const projectRoot = process.cwd();
    const stateManager = new RalphStateManager(projectRoot);
    console.log("🔄 Ralph Wiggum plugin loaded!");
    try {
      const existingState = stateManager.getState();
      if (existingState?.active) {
        const maxDisplay = existingState.maxIterations > 0 ? existingState.maxIterations : "∞";
        console.log(`📊 Existing Ralph loop detected: iteration ${existingState.iteration}/${maxDisplay}`);
        console.log(`   State file: ${stateManager.getStateFilePath()}`);
      }
    } catch (error) {
      console.error("⚠️  Failed to load Ralph state:", error instanceof Error ? error.message : "Unknown error");
    }
    console.log("📚 Ralph Wiggum Commands: /ralph-loop, /ralph-continue, /cancel-ralph");

    await ctx.tool.transform((editor) => {
      editor.namespace({ name: "ralph", description: "Ralph Wiggum iterative development loops" });

      editor.add({
        name: "start",
        description: "Start a Ralph Wiggum self-referential development loop (internal; prefer /ralph-loop).",
        input: {
          type: "object",
          properties: {
            prompt: { type: "string" },
            maxIterations: { type: "number" },
            completionPromise: { type: "string" },
          },
          required: ["prompt"],
          additionalProperties: false,
        },
        async execute(raw: unknown) {
          const args = (raw ?? {}) as { prompt?: string; maxIterations?: number; completionPromise?: string };
          return { content: startLoop(stateManager, args) };
        },
      });

      editor.add({
        name: "continue",
        description: "Manually continue the Ralph loop to the next iteration.",
        input: { type: "object", properties: {}, additionalProperties: false },
        async execute() {
          return { content: continueLoop(stateManager) };
        },
      });

      editor.add({
        name: "cancel",
        description: "Cancel the active Ralph Wiggum loop.",
        input: { type: "object", properties: {}, additionalProperties: false },
        async execute() {
          return { content: cancelLoop(stateManager) };
        },
      });
    });

    // Owned slash commands (replace the v1 commands/*.md `!tool` shims with
    // first-class v2 commands; the original .md files are vendored under
    // commands/ as reference).
    await ctx.command.transform((ed) => {
      ed.add({
        name: "ralph-loop",
        description: "Start Ralph Wiggum loop in current session",
        async execute(args: unknown) {
          const a = (args ?? {}) as { prompt?: string; sessionID?: string };
          return startLoop(stateManager, parseLoopArgs(a.prompt ?? ""), a.sessionID);
        },
      });
      ed.add({
        name: "ralph-continue",
        description: "Continue Ralph loop to next iteration",
        async execute(_args: unknown) {
          return continueLoop(stateManager);
        },
      });
      ed.add({
        name: "cancel-ralph",
        description: "Cancel active Ralph Wiggum loop",
        async execute(_args: unknown) {
          return cancelLoop(stateManager);
        },
      });
    });

    const controller = new AbortController();
    void (async () => {
      for await (const ev of ctx.event.subscribe({ signal: controller.signal })) {
        try {
          const e = (ev ?? {}) as { type?: string; data?: unknown };
          if (e.type === "session.idle") {
            // Manual-continuation mode: never auto-inject (prevents the
            // freezing upstream observed). Only enforce the max-iteration stop.
            try {
              if (stateManager.hasState()) {
                const state = stateManager.getState();
                if (state?.active && stateManager.hasReachedMaxIterations()) {
                  console.log(`🛑 Ralph: Max iterations (${state.maxIterations}) reached`);
                  stateManager.clearState();
                }
              }
            } catch (error) {
              console.error("❌ Ralph: Error in session idle handler:", error instanceof Error ? error.message : "Unknown error");
            }
            continue;
          }
          // Completion-promise detection on assistant text events.
          if (typeof e.type === "string" && e.type.startsWith("session.text.")) {
            try {
              const state = stateManager.getState();
              if (!state?.active || !state.completionPromise) continue;
              const d = (e.data ?? {}) as Record<string, unknown>;
              const content = extractTextContent(d.content ?? d.text ?? d.message);
              if (!content) continue;
              const detection = detectCompletionPromise(content, state.completionPromise);
              if (detection.found) {
                console.log(`✅ Ralph: Detected completion promise: "${detection.promiseText}"`);
                stateManager.clearState();
              }
            } catch (error) {
              console.error("❌ Ralph: Error in text handler:", error instanceof Error ? error.message : "Unknown error");
            }
          }
        } catch (error) {
          console.error("❌ Ralph: Error in event handler:", error instanceof Error ? error.message : "Unknown error");
        }
      }
    })();
    return () => controller.abort();
  },
});
