import { define } from "@opencode-ai/plugin/v2/promise";
import { appendFile, mkdir } from "node:fs/promises";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import { resolveConfig, sanitize } from "./sanitizer.ts";

const DEFAULT_LOG_PATH = join(homedir(), ".local", "share", "opencode", "opencode-log-sanitizer.debug.log");

function resolveLogPath(filePath?: string): string {
  if (!filePath) return DEFAULT_LOG_PATH;
  if (filePath.startsWith("~/")) return join(homedir(), filePath.slice(2));
  return filePath;
}

function scrubText(value: unknown, cfg: ReturnType<typeof resolveConfig>): unknown {
  if (typeof value === "string") return sanitize(value, cfg).text;
  return value;
}

function scrubSystem(
  system: unknown,
  cfg: ReturnType<typeof resolveConfig>,
): { changed: boolean; redactions: number } {
  let changed = false;
  let redactions = 0;
  const visit = (v: unknown): unknown => {
    if (typeof v === "string") {
      const r = sanitize(v, cfg);
      if (r.redactionCount > 0) {
        changed = true;
        redactions += r.redactionCount;
        return r.text;
      }
      return v;
    }
    if (Array.isArray(v)) return v.map(visit);
    if (v && typeof v === "object") {
      const rec = v as Record<string, unknown>;
      // Common message/part shapes: { text }, { content }, { parts }
      if (typeof rec.text === "string") {
        const r = sanitize(rec.text, cfg);
        if (r.redactionCount > 0) {
          changed = true;
          redactions += r.redactionCount;
          return { ...rec, text: r.text };
        }
        return v;
      }
      if (typeof rec.content === "string") {
        const r = sanitize(rec.content, cfg);
        if (r.redactionCount > 0) {
          changed = true;
          redactions += r.redactionCount;
          return { ...rec, content: r.text };
        }
        return v;
      }
      if (Array.isArray(rec.parts)) return { ...rec, parts: rec.parts.map(visit) };
    }
    return v;
  };
  if (Array.isArray(system)) {
    const next = system.map(visit);
    if (changed) {
      system.splice(0, system.length, ...next);
    }
  } else if (typeof system === "string") {
    // string system prompts cannot be replaced in place by the caller unless
    // the hook event holds a mutable reference; handled by the caller below.
  }
  return { changed, redactions };
}

export default define({
  id: "opencode-log-sanitizer",
  async setup(ctx) {
    // NOTE (v1 -> v2): v1 mutated stored chat parts via the "chat.message"
    // hook. v2 cannot mutate stored assistant parts in place, so redaction
    // moves to the admission boundary (session prompt hook, user input
    // before admission) and the outgoing boundary (session context hook,
    // system/messages scrubbed before they reach the model).
    const cfg = resolveConfig();
    const logPath = resolveLogPath(cfg.debugLogFile);

    async function debugLog(entry: Record<string, unknown>): Promise<void> {
      if (!cfg.debug) return;
      try {
        await mkdir(dirname(logPath), { recursive: true });
        await appendFile(logPath, `${JSON.stringify({ ts: new Date().toISOString(), service: "opencode-log-sanitizer", ...entry })}\n`, "utf8");
      } catch {
        // debug logging must never break redaction
      }
    }

    await debugLog({ level: "info", message: "plugin initialized", maxStringLength: cfg.maxStringLength });

    await ctx.session.hook("prompt", (e: unknown) => {
      const ev = (e ?? {}) as Record<string, unknown>;
      const prompt = ev.prompt as Record<string, unknown> | undefined;
      if (!prompt || typeof prompt.text !== "string") return;
      const original = prompt.text as string;
      if (!original) return;
      const { text: redacted, redactionCount, redactions } = sanitize(original, cfg);
      if (redactionCount === 0) return;
      prompt.text = redacted;
      void debugLog({
        level: "info",
        message: "prompt redacted",
        originalLength: original.length,
        redactedLength: redacted.length,
        redactionCount,
        redactions,
      });
    });

    await ctx.session.hook("context", (e: unknown) => {
      const ev = (e ?? {}) as Record<string, unknown>;
      let total = 0;
      if (Array.isArray(ev.system)) {
        const r = scrubSystem(ev.system, cfg);
        total += r.redactions;
      } else if (typeof ev.system === "string") {
        const r = sanitize(ev.system as string, cfg);
        if (r.redactionCount > 0) {
          ev.system = r.text;
          total += r.redactionCount;
        }
      }
      if (Array.isArray(ev.messages)) {
        const r = scrubSystem(ev.messages, cfg);
        total += r.redactions;
      }
      // Also cover a bare `text` field if the host passes one.
      if (typeof ev.text === "string") {
        ev.text = scrubText(ev.text, cfg);
      }
      if (total > 0) {
        void debugLog({ level: "info", message: "context scrubbed", redactions: total });
      }
    });
  },
});
