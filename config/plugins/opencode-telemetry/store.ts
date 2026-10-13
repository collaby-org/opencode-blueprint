// File-backed telemetry store (v2 port).
// v1 used bun:sqlite (unavailable outside Bun). This port keeps the same
// record shapes in three files inside the plugin data dir:
//   sessions.json  — map session_id -> session aggregate (read-modify-write)
//   turns.jsonl    — one JSON object per assistant turn
//   tool_calls.jsonl — one JSON object per tool call
import { existsSync, mkdirSync, readFileSync, writeFileSync, appendFileSync } from "node:fs";
import { join } from "node:path";
import { homedir } from "node:os";

export interface SessionRecord {
  session_id: string;
  parent_session_id: string | null;
  started_at: string;
  ended_at: string | null;
  primary_agent: string | null;
  slash_command: string | null;
  project_path: string | null;
  worktree_path: string | null;
  server_url: string | null;
  total_input_tokens: number;
  total_output_tokens: number;
  total_cached_read: number;
  total_cached_write: number;
  total_reasoning: number;
  total_turns: number;
  total_tool_calls: number;
  est_cost_usd: number | null;
}

export interface TurnRow {
  session_id: string;
  turn_idx: number;
  message_id: string | null;
  parent_tool_call_id: string | null;
  agent: string | null;
  model: string | null;
  provider_id: string | null;
  thinking_level: string | null;
  input_tokens: number;
  output_tokens: number;
  cached_read_tokens: number;
  cached_write_tokens: number;
  reasoning_tokens: number | null;
  latency_ms: number | null;
  finish_reason: string | null;
  created_at: string;
}

export interface ToolCallRow {
  session_id: string;
  turn_idx: number | null;
  tool_name: string;
  skill_name: string | null;
  tool_call_id: string | null;
  spawned_session_id: string | null;
  args_size_bytes: number | null;
  result_size_bytes: number | null;
  duration_ms: number | null;
  status: string;
  error_message: string | null;
  created_at: string;
}

function defaultDataDir(): string {
  // Mirrors the v1 getDbPath() location, but stores JSON/JSONL instead of sqlite.
  if (process.platform === "win32") {
    const base = process.env.LOCALAPPDATA ?? join(homedir(), "AppData", "Local");
    return join(base, "opencode-telemetry");
  }
  const base = process.env.XDG_DATA_HOME ?? join(homedir(), ".local", "share");
  return join(base, "opencode-telemetry");
}

export function resolveDataDir(): string {
  return process.env.OPENCODE_TELEMETRY_DIR ?? defaultDataDir();
}

export class FileStore {
  readonly dir: string;
  private sessionsPath: string;
  private turnsPath: string;
  private toolCallsPath: string;
  private sessions: Map<string, SessionRecord>;

  constructor(dir?: string) {
    this.dir = dir ?? resolveDataDir();
    mkdirSync(this.dir, { recursive: true });
    this.sessionsPath = join(this.dir, "sessions.json");
    this.turnsPath = join(this.dir, "turns.jsonl");
    this.toolCallsPath = join(this.dir, "tool_calls.jsonl");
    this.sessions = this.loadSessions();
  }

  private loadSessions(): Map<string, SessionRecord> {
    try {
      if (!existsSync(this.sessionsPath)) return new Map();
      const raw = JSON.parse(readFileSync(this.sessionsPath, "utf8")) as Record<string, SessionRecord>;
      return new Map(Object.entries(raw));
    } catch {
      return new Map();
    }
  }

  private saveSessions(): void {
    try {
      writeFileSync(this.sessionsPath, JSON.stringify(Object.fromEntries(this.sessions), null, 2), "utf8");
    } catch (err) {
      console.warn("[opencode-telemetry] saveSessions failed:", err);
    }
  }

  upsertSession(fields: {
    session_id: string;
    parent_session_id?: string | null;
    started_at: string;
    primary_agent?: string | null;
    project_path?: string | null;
    worktree_path?: string | null;
    server_url?: string | null;
  }): void {
    if (this.sessions.has(fields.session_id)) return;
    this.sessions.set(fields.session_id, {
      session_id: fields.session_id,
      parent_session_id: fields.parent_session_id ?? null,
      started_at: fields.started_at,
      ended_at: null,
      primary_agent: fields.primary_agent ?? null,
      slash_command: null,
      project_path: fields.project_path ?? null,
      worktree_path: fields.worktree_path ?? null,
      server_url: fields.server_url ?? null,
      total_input_tokens: 0,
      total_output_tokens: 0,
      total_cached_read: 0,
      total_cached_write: 0,
      total_reasoning: 0,
      total_turns: 0,
      total_tool_calls: 0,
      est_cost_usd: null,
    });
    this.saveSessions();
  }

  ensureSession(session_id: string, extra?: Partial<SessionRecord>): SessionRecord {
    let s = this.sessions.get(session_id);
    if (!s) {
      this.upsertSession({ session_id, started_at: new Date().toISOString(), ...extra });
      s = this.sessions.get(session_id)!;
    }
    return s;
  }

  updatePrimaryAgent(session_id: string, agent: string): void {
    const s = this.ensureSession(session_id);
    if (s.primary_agent) return;
    s.primary_agent = agent;
    s.slash_command = `/${agent}`;
    this.saveSessions();
  }

  insertTurn(row: TurnRow): void {
    try {
      appendFileSync(this.turnsPath, JSON.stringify(row) + "\n", "utf8");
    } catch (err) {
      console.warn("[opencode-telemetry] insertTurn failed:", err);
    }
  }

  incrementSessionTurns(
    session_id: string,
    cost: number | null,
    input: number,
    output: number,
    cached_read: number,
    cached_write: number,
    reasoning: number,
  ): void {
    const s = this.ensureSession(session_id);
    s.total_turns += 1;
    s.total_input_tokens += input;
    s.total_output_tokens += output;
    s.total_cached_read += cached_read;
    s.total_cached_write += cached_write;
    s.total_reasoning += reasoning;
    if (cost != null) s.est_cost_usd = (s.est_cost_usd ?? 0) + cost;
    this.saveSessions();
  }

  insertToolCall(row: ToolCallRow): void {
    try {
      appendFileSync(this.toolCallsPath, JSON.stringify(row) + "\n", "utf8");
    } catch (err) {
      console.warn("[opencode-telemetry] insertToolCall failed:", err);
    }
  }

  incrementSessionToolCalls(session_id: string): void {
    const s = this.ensureSession(session_id);
    s.total_tool_calls += 1;
    this.saveSessions();
  }

  finalizeSession(session_id: string): void {
    const s = this.ensureSession(session_id);
    s.ended_at = new Date().toISOString();
    // Roll up totals from the JSONL logs (same semantics as the v1
    // finalizeSession UPDATE ... SELECT SUM(...) query).
    const turns = this.readJsonl<TurnRow>(this.turnsPath).filter((t) => t.session_id === session_id);
    const calls = this.readJsonl<ToolCallRow>(this.toolCallsPath).filter((t) => t.session_id === session_id);
    const sum = (xs: Array<number | null | undefined>) =>
      xs.reduce<number>((a, b) => a + (b ?? 0), 0);
    s.total_input_tokens = sum(turns.map((t) => t.input_tokens));
    s.total_output_tokens = sum(turns.map((t) => t.output_tokens));
    s.total_cached_read = sum(turns.map((t) => t.cached_read_tokens));
    s.total_cached_write = sum(turns.map((t) => t.cached_write_tokens));
    s.total_reasoning = sum(turns.map((t) => t.reasoning_tokens));
    s.total_turns = turns.length;
    s.total_tool_calls = calls.length;
    if (!s.primary_agent) {
      const counts = new Map<string, number>();
      for (const t of turns) {
        if (t.agent) counts.set(t.agent, (counts.get(t.agent) ?? 0) + 1);
      }
      let best: string | null = null;
      let bestN = 0;
      for (const [agent, n] of counts) {
        if (n > bestN) {
          best = agent;
          bestN = n;
        }
      }
      if (best) {
        s.primary_agent = best;
        s.slash_command = `/${best}`;
      }
    }
    this.saveSessions();
  }

  linkOrphanToolCalls(session_id: string, turn_idx: number, window_start: string, window_end: string): void {
    // JSONL is append-only: link orphans by appending corrected copies is
    // wrong (duplicates). Instead rewrite the tool_calls file, assigning
    // turn_idx to rows in the window that lack one (same predicate as v1).
    try {
      if (!existsSync(this.toolCallsPath)) return;
      const rows = this.readJsonl<ToolCallRow>(this.toolCallsPath);
      let changed = false;
      for (const r of rows) {
        if (
          r.session_id === session_id &&
          r.turn_idx == null &&
          r.created_at >= window_start &&
          r.created_at <= window_end
        ) {
          r.turn_idx = turn_idx;
          changed = true;
        }
      }
      if (changed) {
        writeFileSync(this.toolCallsPath, rows.map((r) => JSON.stringify(r)).join("\n") + "\n", "utf8");
      }
    } catch (err) {
      console.warn("[opencode-telemetry] linkOrphanToolCalls failed:", err);
    }
  }

  getMaxTurnIdx(session_id: string): number {
    let max = -1;
    for (const t of this.readJsonl<TurnRow>(this.turnsPath)) {
      if (t.session_id === session_id && typeof t.turn_idx === "number" && t.turn_idx > max) {
        max = t.turn_idx;
      }
    }
    for (const r of this.readJsonl<ToolCallRow>(this.toolCallsPath)) {
      if (r.session_id === session_id && typeof r.turn_idx === "number" && r.turn_idx > max) {
        max = r.turn_idx;
      }
    }
    return max;
  }

  getSession(session_id: string): SessionRecord | undefined {
    return this.sessions.get(session_id);
  }

  listRecentSessions(limit: number): SessionRecord[] {
    return [...this.sessions.values()]
      .sort((a, b) => (a.started_at < b.started_at ? 1 : -1))
      .slice(0, limit);
  }

  getTurns(session_id: string): TurnRow[] {
    return this.readJsonl<TurnRow>(this.turnsPath).filter((t) => t.session_id === session_id);
  }

  getToolCalls(session_id: string): ToolCallRow[] {
    return this.readJsonl<ToolCallRow>(this.toolCallsPath).filter((t) => t.session_id === session_id);
  }

  private readJsonl<T>(path: string): T[] {
    try {
      if (!existsSync(path)) return [];
      const text = readFileSync(path, "utf8");
      if (!text.trim()) return [];
      const out: T[] = [];
      for (const line of text.split("\n")) {
        const t = line.trim();
        if (!t) continue;
        try {
          out.push(JSON.parse(t) as T);
        } catch {
          // skip corrupt lines
        }
      }
      return out;
    } catch {
      return [];
    }
  }
}
