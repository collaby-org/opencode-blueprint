// State management vendored from opencode-ralph-wiggum v1 (src/state/index.ts).
// Unchanged semantics: JSON state file at <project>/.opencode/ralph-state.json.
import { readFileSync, writeFileSync, existsSync, unlinkSync, mkdirSync } from "node:fs";
import { join } from "node:path";

export interface RalphState {
  active: boolean;
  iteration: number;
  maxIterations: number;
  completionPromise: string | null;
  startedAt: string;
  originalPrompt: string;
  sessionId: string | null;
  lastMessageId?: string;
}

export interface RalphConfig {
  prompt: string;
  maxIterations?: number;
  completionPromise?: string;
}

export class RalphStateManager {
  private stateFile: string;
  private stateDir: string;

  constructor(directory: string) {
    this.stateDir = join(directory, ".opencode");
    this.stateFile = join(this.stateDir, "ralph-state.json");
  }

  private ensureStateDir(): void {
    if (existsSync(this.stateDir)) return;
    try {
      mkdirSync(this.stateDir, { recursive: true });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown error";
      throw new Error(
        `Failed to create Ralph state directory at ${this.stateDir}: ${message}. ` +
          `Please check file permissions and disk space.`,
      );
    }
  }

  getState(): RalphState | null {
    if (!existsSync(this.stateFile)) return null;
    try {
      const content = readFileSync(this.stateFile, "utf-8");
      const state = JSON.parse(content) as RalphState;
      if (!this.isValidState(state)) {
        throw new Error("State file has invalid structure - may be corrupted");
      }
      return state;
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown error";
      throw new Error(
        `Failed to load Ralph state from ${this.stateFile}: ${message}. ` +
          `The state file may be corrupted. To recover, delete the file manually or use cancel-ralph.`,
      );
    }
  }

  setState(config: RalphConfig, sessionId?: string): RalphState {
    if (!config.prompt || config.prompt.trim().length === 0) {
      throw new Error("Prompt cannot be empty");
    }
    if (config.maxIterations !== undefined && config.maxIterations < 0) {
      throw new Error("maxIterations must be 0 (unlimited) or a positive number");
    }
    if (config.completionPromise !== undefined && config.completionPromise.trim().length === 0) {
      throw new Error("completionPromise cannot be empty string");
    }
    try {
      this.ensureStateDir();
      const state: RalphState = {
        active: true,
        iteration: 1,
        maxIterations: config.maxIterations ?? 50,
        completionPromise: config.completionPromise ?? null,
        startedAt: new Date().toISOString(),
        originalPrompt: config.prompt.trim(),
        sessionId: sessionId ?? null,
      };
      writeFileSync(this.stateFile, JSON.stringify(state, null, 2), "utf-8");
      console.log(`🔄 Ralph: State initialized (iteration 1, max: ${state.maxIterations})`);
      return state;
    } catch (error) {
      throw new Error(
        `Failed to write state file: ${error instanceof Error ? error.message : "Unknown error"}`,
      );
    }
  }

  updateState(updates: Partial<RalphState>): RalphState {
    const currentState = this.getState();
    if (!currentState) {
      throw new Error("Cannot update state: no active Ralph loop found");
    }
    const updatedState = { ...currentState, ...updates };
    try {
      writeFileSync(this.stateFile, JSON.stringify(updatedState, null, 2), "utf-8");
      return updatedState;
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown error";
      throw new Error(
        `Failed to save Ralph state to ${this.stateFile}: ${message}. ` +
          `Check disk space and file permissions.`,
      );
    }
  }

  incrementIteration(): RalphState {
    const state = this.getState();
    if (!state) {
      throw new Error("Cannot increment iteration: no active Ralph loop found");
    }
    const updatedState = this.updateState({ iteration: state.iteration + 1 });
    console.log(`🔄 Ralph: Iteration incremented to ${updatedState.iteration}`);
    return updatedState;
  }

  clearState(): void {
    if (!existsSync(this.stateFile)) return;
    try {
      unlinkSync(this.stateFile);
      console.log("🧹 Ralph: State cleared");
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown error";
      throw new Error(
        `Failed to delete Ralph state file at ${this.stateFile}: ${message}. ` +
          `Please delete this file manually to fully cancel the loop.`,
      );
    }
  }

  hasState(): boolean {
    return existsSync(this.stateFile);
  }

  hasReachedMaxIterations(): boolean {
    const state = this.getState();
    if (!state) return false;
    return state.maxIterations > 0 && state.iteration >= state.maxIterations;
  }

  private isValidState(state: unknown): state is RalphState {
    return (
      typeof state === "object" &&
      state !== null &&
      typeof (state as RalphState).active === "boolean" &&
      typeof (state as RalphState).iteration === "number" &&
      (state as RalphState).iteration >= 1 &&
      Number.isInteger((state as RalphState).iteration) &&
      typeof (state as RalphState).maxIterations === "number" &&
      (state as RalphState).maxIterations >= 0 &&
      Number.isInteger((state as RalphState).maxIterations) &&
      ((state as RalphState).completionPromise === null ||
        typeof (state as RalphState).completionPromise === "string") &&
      typeof (state as RalphState).startedAt === "string" &&
      (state as RalphState).startedAt.length > 0 &&
      typeof (state as RalphState).originalPrompt === "string" &&
      (state as RalphState).originalPrompt.trim().length > 0 &&
      ((state as RalphState).sessionId === null || typeof (state as RalphState).sessionId === "string")
    );
  }

  getStateFilePath(): string {
    return this.stateFile;
  }
}

export function formatDuration(seconds: number): string {
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  const remainingSeconds = seconds % 60;
  if (minutes < 60) return `${minutes}m ${remainingSeconds}s`;
  const hours = Math.floor(minutes / 60);
  return `${hours}h ${minutes % 60}m ${remainingSeconds}s`;
}

export function detectCompletionPromise(
  content: string,
  expectedPromise: string,
): { found: true; promiseText: string } | { found: false } {
  if (!expectedPromise) return { found: false };
  const promiseRegex = /<promise>(.*?)<\/promise>/gs;
  for (const match of content.matchAll(promiseRegex)) {
    const promiseText = match[1]!.trim().replace(/\s+/g, " ");
    if (promiseText === expectedPromise) return { found: true, promiseText };
  }
  return { found: false };
}

export function extractTextContent(value: unknown): string {
  if (!value) return "";
  if (typeof value === "string") return value;
  if (Array.isArray(value)) {
    return value.map((item: unknown) => {
      if (typeof item === "string") return item;
      if (item && typeof item === "object") {
        const rec = item as Record<string, unknown>;
        if (typeof rec.text === "string") return rec.text;
        if (typeof rec.content === "string") return rec.content;
      }
      return "";
    }).join("\n");
  }
  if (typeof value === "object" && typeof (value as Record<string, unknown>).text === "string") {
    return (value as Record<string, unknown>).text as string;
  }
  return "";
}

export function buildRalphStartResponse(
  state: RalphState,
): string {
  let response = `🔄 **Ralph loop activated!**\n\n`;
  response += `**Configuration:**\n`;
  response += `- Iteration: 1\n`;
  response += `- Max iterations: ${state.maxIterations > 0 ? state.maxIterations : "unlimited"}\n`;
  response += `- Completion promise: ${state.completionPromise ? `"${state.completionPromise}"` : "none"}\n`;
  response += `- State file: \`.opencode/ralph-state.json\`\n\n`;
  response += `**How it works:**\n`;
  response += `The Ralph loop is now active. When you complete your response, use /ralph-continue to advance.\n\n`;
  if (state.completionPromise) {
    response += `**🎯 COMPLETION CRITERIA**\n\n`;
    response += `To complete this loop, output this EXACT text:\n`;
    response += `\`\`\`\n<promise>${state.completionPromise}</promise>\n\`\`\`\n\n`;
    response += `**⚠️  CRITICAL RULES:**\n`;
    response += `- Use <promise> XML tags EXACTLY as shown above\n`;
    response += `- The statement MUST be completely and unequivocally TRUE\n`;
    response += `- Do NOT output false statements to exit the loop\n`;
    response += `- Do NOT lie even if you think you should exit\n\n`;
  } else {
    response += `**⚠️  WARNING:** No completion promise set! This loop will run until max iterations (${state.maxIterations}).\n`;
    response += `For better control, consider canceling and restarting with a completion promise.\n\n`;
  }
  response += `**Monitoring:**\n`;
  response += `- View state: \`cat .opencode/ralph-state.json\`\n`;
  response += `- Continue: \`/ralph-continue\` | Cancel: \`/cancel-ralph\`\n`;
  return response;
}
