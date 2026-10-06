import { Plugin } from "@opencode/plugin";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { FileStore } from "./store.ts";

const here = dirname(fileURLToPath(import.meta.url));

interface PricingEntry {
  input_per_mtok: number;
  output_per_mtok: number;
  cache_read_per_mtok: number;
  cache_write_per_mtok: number;
}

function loadPricing(): Record<string, PricingEntry | string> {
  try {
    return JSON.parse(readFileSync(join(here, "pricing.json"), "utf8"));
  } catch {
    return {};
  }
}

const pricing = loadPricing();

function estimateCost(
  providerID: string | null | undefined,
  modelID: string | null | undefined,
  tokens: { input: number; output: number; cacheRead: number; cacheWrite: number },
): number | null {
  if (!providerID || !modelID) return null;
  const entry = pricing[`${providerID}/${modelID}`];
  if (!entry || typeof entry === "string") return null;
  const e = entry as PricingEntry;
  return (
    (tokens.input * e.input_per_mtok +
      tokens.output * e.output_per_mtok +
      tokens.cacheRead * e.cache_read_per_mtok +
      tokens.cacheWrite * e.cache_write_per_mtok) /
    1_000_000
  );
}

interface PendingToolCall {
  session_id: string;
  turn_idx: number;
  tool_name: string;
  skill_name: string | null;
  tool_call_id: string | null;
  args_size_bytes: number | null;
  start_time: number;
  created_at: string;
}

function safeByteLen(value: unknown): number | null {
  try {
    return Buffer.byteLength(JSON.stringify(value), "utf8");
  } catch {
    return null;
  }
}

function extractSkillName(args: unknown): string | null {
  if (!args || typeof args !== "object") return null;
  const a = args as Record<string, unknown>;
  const v = a.name ?? a.skillName ?? a.id ?? a.skill;
  return typeof v === "string" ? v : null;
}

function readData(ev: unknown): Record<string, unknown> {
  const e = (ev ?? {}) as Record<string, unknown>;
  const d = e.data ?? e.properties ?? {};
  return (d ?? {}) as Record<string, unknown>;
}

function readSessionID(ev: unknown): string | null {
  const e = (ev ?? {}) as Record<string, unknown>;
  const d = readData(ev);
  const v =
    d.sessionID ?? d.session_id ?? d.sessionId ?? e.sessionID ?? e.session_id ?? e.sessionId;
  return typeof v === "string" ? v : null;
}

function formatReport(store: FileStore, days: number): string {
  const cutoff = Date.now() - days * 24 * 60 * 60 * 1000;
  const sessions = store
    .listRecentSessions(1000)
    .filter((s) => Date.parse(s.started_at) >= cutoff);
  if (sessions.length === 0) return `No telemetry sessions in the last ${days} day(s).`;
  const lines = [`# Telemetry report (last ${days}d)`, ""];
  let totalCost = 0;
  for (const s of sessions) {
    totalCost += s.est_cost_usd ?? 0;
    lines.push(
      `- ${s.session_id} | agent=${s.primary_agent ?? "?"} | turns=${s.total_turns} | tools=${s.total_tool_calls} | in=${s.total_input_tokens} out=${s.total_output_tokens} | cost=$${(s.est_cost_usd ?? 0).toFixed(4)}`,
    );
  }
  lines.push("", `Sessions: ${sessions.length} | Total est. cost: $${totalCost.toFixed(4)}`);
  return lines.join("\n");
}

function formatInspect(store: FileStore, sessionID: string): string {
  const id =
    sessionID === "latest" ? (store.listRecentSessions(1)[0]?.session_id ?? null) : sessionID;
  if (!id) return "No telemetry sessions recorded yet.";
  const s = store.getSession(id);
  if (!s) return `Unknown session: ${id}`;
  const turns = store.getTurns(id);
  const calls = store.getToolCalls(id);
  const lines = [
    `# Session ${id}`,
    `agent=${s.primary_agent ?? "?"} started=${s.started_at} ended=${s.ended_at ?? "—"}`,
    `turns=${turns.length} tools=${calls.length} cost=$${(s.est_cost_usd ?? 0).toFixed(4)}`,
    "",
    "## Turns",
  ];
  for (const t of turns) {
    lines.push(
      `- #${t.turn_idx} ${t.model ?? "?"} in=${t.input_tokens} out=${t.output_tokens} latency=${t.latency_ms ?? "?"}ms finish=${t.finish_reason ?? "?"}`,
    );
  }
  lines.push("", "## Tool calls");
  for (const c of calls) {
    lines.push(
      `- ${c.tool_name}${c.skill_name ? `:${c.skill_name}` : ""} status=${c.status} dur=${c.duration_ms ?? "?"}ms args=${c.args_size_bytes ?? "?"}B result=${c.result_size_bytes ?? "?"}B`,
    );
  }
  return lines.join("\n");
}

export default Plugin.define({
  id: "opencode-telemetry",
  async setup(ctx) {
    // NOTE (v1 -> v2): bun:sqlite replaced with JSON/JSONL files (store.ts);
    // v1 event names (session.created/message.updated) replaced with v2
    // session.tool.* + session.idle; turn/token capture is opportunistic
    // (see gaps below). registerCommands() wrote project .opencode/commands
    // files — replaced by owned commands via command.transform add.
    const store = new FileStore();
    const seenMessageIds = new Set<string>();
    const sessionTurnCounters = new Map<string, number>();
    const sessionCurrentAgent = new Map<string, string>();
    const pendingToolCalls = new Map<string, PendingToolCall>();
    const projectPath = process.cwd();

    function peekCurrentTurnIdx(sessionId: string): number {
      if (!sessionTurnCounters.has(sessionId)) {
        sessionTurnCounters.set(sessionId, store.getMaxTurnIdx(sessionId) + 1);
      }
      return sessionTurnCounters.get(sessionId)!;
    }

    function getNextTurnIdx(sessionId: string): number {
      const idx = peekCurrentTurnIdx(sessionId);
      sessionTurnCounters.set(sessionId, idx + 1);
      return idx;
    }

    function recordTurnFromData(sessionID: string, d: Record<string, unknown>): void {
      // Opportunistic turn capture: v2 text/usage events carry different
      // shapes across versions, so extract defensively and skip when the
      // payload has no token usage.
      const msg = (d.message ?? d.info ?? d) as Record<string, unknown>;
      const id = typeof msg.id === "string" ? msg.id : null;
      if (id && seenMessageIds.has(id)) return;
      const tokens = (msg.tokens ?? msg.usage ?? null) as {
        input?: number;
        output?: number;
        reasoning?: number;
        cache?: { read?: number; write?: number };
      } | null;
      if (!tokens || typeof tokens.input !== "number") return;
      if (id) seenMessageIds.add(id);
      const time = (msg.time ?? {}) as { created?: number; completed?: number };
      if (typeof time.completed !== "number") return; // terminal only (v1 parity)
      const agent =
        (typeof msg.agent === "string" ? msg.agent : null) ?? sessionCurrentAgent.get(sessionID) ?? null;
      const turn_idx = getNextTurnIdx(sessionID);
      const input = tokens.input ?? 0;
      const output = tokens.output ?? 0;
      const cacheRead = tokens.cache?.read ?? 0;
      const cacheWrite = tokens.cache?.write ?? 0;
      const reasoning = tokens.reasoning ?? 0;
      let thinkingLevel: string | null = null;
      if (reasoning > 0) thinkingLevel = "active";
      else if (typeof msg.mode === "string" && msg.mode !== "default") thinkingLevel = msg.mode;
      const providerID = typeof msg.providerID === "string" ? msg.providerID : null;
      const modelID = typeof msg.modelID === "string" ? msg.modelID : null;
      const cost = estimateCost(providerID, modelID, {
        input,
        output,
        cacheRead,
        cacheWrite,
      });
      const turnCreatedAt =
        typeof time.created === "number" ? new Date(time.created).toISOString() : new Date().toISOString();
      const turnCompletedAt = new Date(time.completed + 100).toISOString();
      store.insertTurn({
        session_id: sessionID,
        turn_idx,
        message_id: id,
        parent_tool_call_id: null,
        agent,
        model: modelID,
        provider_id: providerID,
        thinking_level: thinkingLevel,
        input_tokens: input,
        output_tokens: output,
        cached_read_tokens: cacheRead,
        cached_write_tokens: cacheWrite,
        reasoning_tokens: reasoning > 0 ? reasoning : null,
        latency_ms:
          typeof time.created === "number" ? Math.round(time.completed - time.created) : null,
        finish_reason: typeof msg.finish === "string" ? msg.finish : null,
        created_at: turnCreatedAt,
      });
      store.linkOrphanToolCalls(sessionID, turn_idx, turnCreatedAt, turnCompletedAt);
      store.incrementSessionTurns(sessionID, cost, input, output, cacheRead, cacheWrite, reasoning);
    }

    // Tool before/after hooks (primary tool-call accounting).
    await ctx.tool.hook("execute.before", (event: unknown) => {
      try {
        const ev = (event ?? {}) as Record<string, unknown>;
        const tool = typeof ev.tool === "string" ? ev.tool : "unknown";
        const input = ev.input ?? (ev as Record<string, unknown>).args;
        const sessionID =
          typeof ev.sessionID === "string"
            ? ev.sessionID
            : (readSessionID(event) ?? "unknown");
        const callID =
          typeof ev.callID === "string"
            ? ev.callID
            : typeof (ev as Record<string, unknown>).callId === "string"
              ? ((ev as Record<string, unknown>).callId as string)
              : `${sessionID}:${Date.now()}`;
        store.ensureSession(sessionID, { project_path: projectPath });
        const skillName = tool === "skill" ? extractSkillName(input) : null;
        pendingToolCalls.set(callID, {
          session_id: sessionID,
          turn_idx: peekCurrentTurnIdx(sessionID),
          tool_name: tool,
          skill_name: skillName,
          tool_call_id: callID,
          args_size_bytes: safeByteLen(input),
          start_time: Date.now(),
          created_at: new Date().toISOString(),
        });
      } catch (err) {
        console.warn("[opencode-telemetry] tool.before error:", err);
      }
    });

    await ctx.tool.hook("execute.after", (event: unknown) => {
      try {
        const ev = (event ?? {}) as Record<string, unknown>;
        const status = typeof ev.status === "string" ? ev.status : "completed";
        const tool = typeof ev.tool === "string" ? ev.tool : "unknown";
        const sessionID =
          typeof ev.sessionID === "string" ? ev.sessionID : (readSessionID(event) ?? "unknown");
        const callID =
          typeof ev.callID === "string"
            ? ev.callID
            : typeof ev.callId === "string"
              ? (ev.callId as string)
              : null;
        const result = ev.result ?? ev.output;
        const pending = callID ? pendingToolCalls.get(callID) : undefined;
        if (callID) pendingToolCalls.delete(callID);
        const duration_ms = pending ? Date.now() - pending.start_time : null;
        const isError = status === "error";
        const input = ev.input ?? ev.args;
        store.insertToolCall({
          session_id: pending?.session_id ?? sessionID,
          turn_idx: pending?.turn_idx ?? null,
          tool_name: pending?.tool_name ?? tool,
          skill_name: pending?.skill_name ?? (tool === "skill" ? extractSkillName(input) : null),
          tool_call_id: callID,
          spawned_session_id: null,
          args_size_bytes: pending?.args_size_bytes ?? safeByteLen(input),
          result_size_bytes: safeByteLen(result),
          duration_ms,
          status: isError ? "error" : "ok",
          error_message: isError ? String((result as unknown) ?? "").slice(0, 500) : null,
          created_at: pending?.created_at ?? new Date().toISOString(),
        });
        store.incrementSessionToolCalls(pending?.session_id ?? sessionID);
      } catch (err) {
        console.warn("[opencode-telemetry] tool.after error:", err);
      }
    });

    // Owned commands (replace v1 registerCommands + bun scripts).
    await ctx.command.transform((ed) => {
      ed.add({
        name: "telemetry-report",
        description: "Show a markdown report of recent telemetry (last 7 days by default).",
        async execute(args: unknown) {
          const a = (args ?? {}) as { prompt?: string; sessionID?: string };
          const days = Number.parseInt((a.prompt ?? "").trim(), 10);
          return formatReport(store, Number.isFinite(days) && days > 0 ? days : 7);
        },
      });
      ed.add({
        name: "telemetry-inspect",
        description: 'Deep-dive into a specific session by ID or "latest".',
        async execute(args: unknown) {
          const a = (args ?? {}) as { prompt?: string; sessionID?: string };
          return formatInspect(store, (a.prompt ?? "").trim() || "latest");
        },
      });
    });

    // Event subscription: session.idle finalization + opportunistic turns.
    const controller = new AbortController();
    void (async () => {
      for await (const ev of ctx.event.subscribe({ signal: controller.signal })) {
        try {
          const e = (ev ?? {}) as { type?: string };
          if (e.type === "session.idle") {
            const sid = readSessionID(ev);
            if (sid) store.finalizeSession(sid);
            continue;
          }
          if (e.type === "session.tool.called") {
            const sid = readSessionID(ev);
            if (sid) store.ensureSession(sid, { project_path: projectPath });
            continue;
          }
          if (e.type === "session.tool.success" || e.type === "session.tool.failed") {
            // Already accounted via tool hooks; ensure the session exists.
            const sid = readSessionID(ev);
            if (sid) store.ensureSession(sid, { project_path: projectPath });
            continue;
          }
          // session.text.* and any usage-carrying events -> turn capture.
          const sid = readSessionID(ev);
          if (sid) {
            const d = readData(ev);
            const agent = d.agent ?? (readData(d.message).agent as unknown);
            if (typeof agent === "string") {
              sessionCurrentAgent.set(sid, agent);
              store.updatePrimaryAgent(sid, agent);
            } else {
              store.ensureSession(sid, { project_path: projectPath });
            }
            recordTurnFromData(sid, d);
          }
        } catch (err) {
          console.warn("[opencode-telemetry] event handler error:", err);
        }
      }
    })();
    return () => controller.abort();
  },
});
