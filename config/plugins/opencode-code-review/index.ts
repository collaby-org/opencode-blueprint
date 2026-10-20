import { define } from "@opencode-ai/plugin/v2/promise";
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

// opencode-code-review
//
// Registers the /code-review command and its orchestrator agent, exposes a
// read only status tool, and enforces the local review gate on `gh pr create`.
//
// The gate is the point: instructions can be skipped, a hook cannot. It fails
// closed, with a clear reason and three deliberate escape hatches: a draft PR,
// `enforce_pr_gate: false` in review.json, and `CODE_REVIEW_SKIP=1` before a
// single command (the verdict names which one applied).

const COMMAND_TEMPLATE = `Run the code review gate for this change.

Load the \`code-review\` skill with the skill tool and follow it end to end.
$ARGUMENTS

Rules that must not be relaxed:
- The reviewers run on a model from a different family than the one that wrote the code.
- Do not edit code in this step. Report, then hand the findings to the implementer.
- Do not open a pull request until the verdict is approve or approve-with-nits.
- Sync the result to the pull request after it exists.`;

const AGENT_PROMPT = `You orchestrate the local code review gate. Load the \`code-review\` skill before doing anything else and follow it exactly.

You are not the reviewer. You plan the diff, spawn reviewer subagents on a model from a different family than the author, reconcile their JSON findings with the skill's scripts, report the verdict, and sync the result to the pull request.

Never review the code yourself. Never edit code in this step. A clean review you did not run is a fabricated review.`;

function readJson(path) {
  try {
    return JSON.parse(readFileSync(path, "utf8").replace(/^\uFEFF/, ""));
  } catch {
    return null;
  }
}

// The plugin server does not start in the project directory, so `process.cwd()`
// can point at the opencode config home instead of the checkout. V2 exposes
// the loaded location as `ctx.location.directory` (not `ctx.directory`), and a
// session can point at a worktree: resolve the session's location at hook time
// and fall back to the plugin location, never to the server cwd.
function reviewConfig(root: string) {
  return {
    ...(readJson(join(homedir(), ".config", "opencode", "review.json")) || {}),
    ...(readJson(join(root, ".opencode", "review.json")) || {}),
  };
}

// Windows rejects a UNC path as a process working directory and paths past
// MAX_PATH need the extended prefix. Try the plain path first, then the
// extended form, so a valid checkout is never reported as "not a repository".
function gitCwd(root: string) {
  if (root.startsWith("\\\\") && !root.startsWith("\\\\?\\")) return "\\\\?\\" + root;
  return root;
}

function git(args: string[], root: string) {
  for (const cwd of [root, gitCwd(root)]) {
    try {
      return execFileSync("git", args, {
        cwd,
        encoding: "utf8",
        stdio: ["ignore", "pipe", "pipe"],
        maxBuffer: 8 * 1024 * 1024,
      }).trim();
    } catch {
      // Try the extended form, then give up.
    }
  }
  return null;
}

function gitDir(root: string) {
  const dir = git(["rev-parse", "--absolute-git-dir"], root);
  return dir || null;
}

function statePath(root: string) {
  const gd = gitDir(root);
  return gd ? join(gd, "code-review", "last-result.json") : null;
}

function readState(root: string) {
  const path = statePath(root);
  if (!path) return { path: null, state: null, head: null };
  return { path, state: readJson(path), head: git(["rev-parse", "HEAD"], root) };
}

// A review made on the working tree records the HEAD it sat on top of. Once
// that tree is committed, HEAD moves and the review would look stale although
// it covered exactly this content. Accept it when the reviewed head is HEAD^.
// The root is required: the gate must never consult the server working
// directory. Exported so the rule can be probed without driving the whole hook.
export function reviewCoversHead(state, head, root: string) {
  if (!state || !head || !state.head) return false;
  if (state.head === head) return true;
  if (state.mode !== "uncommitted") return false;
  const parent = git(["rev-parse", "HEAD^"], root);
  return Boolean(parent && parent === state.head);
}

// The hook event is not guaranteed to carry the session id at the top level.
// Read the common shapes before giving up: without it the gate falls back to
// the plugin location and can evaluate a checkout it does not protect.
function readSessionID(ev: Record<string, unknown>): string | undefined {
  const data = ev.data as Record<string, unknown> | undefined;
  const properties = ev.properties as Record<string, unknown> | undefined;
  const candidates = [
    ev.sessionID,
    ev.sessionId,
    ev.session_id,
    data?.sessionID,
    data?.sessionId,
    data?.session_id,
    properties?.sessionID,
    properties?.sessionId,
    properties?.session_id,
  ];
  for (const candidate of candidates) {
    if (typeof candidate === "string" && candidate) return candidate;
  }
  return undefined;
}

function describe(state) {
  if (!state) return "no review artifact";
  const counts = state.counts || {};
  return [
    `verdict ${state.verdict}`,
    `${counts.blocker || 0} blocker(s)`,
    `${counts.major || 0} major`,
    `${counts.total || 0} finding(s)`,
    `reviewed head ${String(state.head || "").slice(0, 8) || "unknown"}`,
  ].join(", ");
}

// How the gate reads a command line.
//
// It is parsed as shell, not matched as text. Every segment between
// separators (`;`, `&&`, `||`, `|`, newline) is inspected with its command
// word in mind, so only a real invocation of `gh` can be a creation:
// `git commit -m "fix gh pr create"` and `rg "gh pr create"` are arguments,
// not invocations on this machine. Tokens keep the shell's own resolution —
// quote splicing (`cre'ate'`), backslash escapes (`g\h`) and a path prefix
// (`/usr/bin/gh`) reduce to the same words, and command substitution is
// removed before the arguments are read, so `--title "$(echo --draft)"` can
// never manufacture a draft flag.
//
// `gh pr new` is create's cobra alias and is treated as create. A shell
// wrapper (`bash -lc "..."`) is re-parsed one level deep. What this cannot
// follow — `echo "pr create" | xargs gh` — is deliberate obfuscation rather
// than a command an agent writes: the gate is a workflow guard, not a
// security boundary against someone who already holds a shell.
type ShellToken = { value: string; separator: boolean };

function shellTokens(text: string): ShellToken[] {
  const tokens: ShellToken[] = [];
  let value = "";
  let started = false;
  let quote = "";
  let escaped = false;

  const flush = () => {
    if (started) tokens.push({ value, separator: false });
    value = "";
    started = false;
  };

  for (let i = 0; i < text.length; i += 1) {
    const ch = text[i];
    if (escaped) {
      // Backslash-newline is a line continuation: the shell removes both
      // characters, so neither ends nor extends a token by itself.
      if (ch === "\n" || ch === "\r") {
        escaped = false;
        continue;
      }
      value += ch;
      escaped = false;
      started = true;
      continue;
    }
    if (quote) {
      if (ch === "\\" && quote !== "'") {
        escaped = true;
        started = true;
        continue;
      }
      if (ch === quote) {
        quote = "";
        started = true;
        continue;
      }
      value += ch;
      started = true;
      continue;
    }
    if (ch === "\\") {
      escaped = true;
      started = true;
      continue;
    }
    if (ch === '"' || ch === "'" || ch === "`") {
      quote = ch;
      started = true;
      continue;
    }
    if (ch === "\n" || ch === ";" || ch === "&" || ch === "|") {
      flush();
      tokens.push({ value: "", separator: true });
      continue;
    }
    if (/\s/.test(ch)) {
      flush();
      continue;
    }
    value += ch;
    started = true;
  }
  flush();
  return tokens;
}

type GhInvocation = { args: string[]; prefix: string[] };

const ASSIGNMENT = /^[A-Za-z_][A-Za-z0-9_]*=/;
// Wrappers that execute their arguments. `env FOO=1 gh ...` and
// `command gh ...` are still invocations of gh; the prefix travels with the
// invocation so `CODE_REVIEW_SKIP=1` can only exempt the command it precedes.
// The list covers the wrappers a person actually types in front of a command,
// not only the POSIX five: `timeout 30 gh ...` and `nice -n 5 gh ...` run gh.
const WRAPPERS = new Set([
  "env", "command", "nohup", "time", "sudo", "doas", "pkexec",
  "timeout", "nice", "setsid", "stdbuf", "flock", "chrt", "ionice", "taskset",
]);
// Wrapper options that consume the following word, per wrapper. They are not
// interchangeable: `sudo -p` takes a prompt, but `time -p` is a Boolean, and
// treating it as value-taking would swallow `gh` and hide the invocation.
const WRAPPER_VALUE_FLAGS: Record<string, Set<string>> = {
  env: new Set(["-u", "--unset", "-C", "--chdir", "-S", "--split-string"]),
  sudo: new Set([
    "-u", "--user", "-g", "--group", "-p", "--prompt", "-h", "--host",
    "-U", "--other-user", "-C", "--close-from", "-r", "--role", "-t", "--type",
    "-D", "--chdir",
  ]),
  doas: new Set(["-u", "-C"]),
  pkexec: new Set(["--user"]),
  time: new Set(["-o", "--output", "-f", "--format"]),
  timeout: new Set(["-k", "--kill-after", "-s", "--signal"]),
  nice: new Set(["-n", "--adjustment"]),
  setsid: new Set(),
  stdbuf: new Set(["-i", "--input", "-o", "--output", "-e", "--error"]),
  flock: new Set(["-w", "--timeout", "-E", "--conflict-exit-code"]),
  chrt: new Set(["-T", "--sched-runtime", "-P", "--sched-period", "-D", "--sched-deadline"]),
  ionice: new Set(["-c", "--class", "-n", "--classdata"]),
  taskset: new Set(["-c", "--cpu-list"]),
  command: new Set(),
  nohup: new Set(),
};
// Wrappers with a leading positional that is not the command. `timeout 30 gh`
// spends one word on the duration before the command; `flock /tmp/l gh` spends
// one on the lock file; `chrt -f 50 gh` and `taskset 3 gh` one each.
const WRAPPER_POSITIONAL: Record<string, number> = {
  timeout: 1,
  flock: 1,
  chrt: 1,
  taskset: 1,
};
// `flock /tmp/l -c "gh pr create"` runs the value as a shell string, the same
// way `bash -c` does. The payload goes back through the parser.
const WRAPPER_PAYLOAD_FLAGS: Record<string, Set<string>> = {
  flock: new Set(["-c", "--command"]),
};
const SHELLS = new Set(["bash", "sh", "zsh", "dash", "pwsh", "powershell", "cmd", "cmd.exe"]);
// ssh options that consume the following word, so the host can be located.
const SSH_VALUE_FLAGS = new Set([
  "-p", "-i", "-l", "-o", "-F", "-L", "-R", "-D", "-W", "-b", "-c", "-E",
  "-e", "-I", "-J", "-m", "-O", "-Q", "-S", "-w", "-B",
]);
// `gh pr create` booleans pflag accepts grouped: `-df` is `-d -f`.
const SHORTHAND_BOOLEANS = new Set(["d", "f", "w", "h"]);

// `$(...)`, `${...}` and backticks are separate commands/expansions: their
// body is not an argument of the invocation around them. Replacing the span
// with an inert word keeps the surrounding flags intact; the body itself is
// fed back through the parser, because the shell runs it.
function stripSubstitutions(text: string): string {
  return text
    .replace(/\$\([^()]*\)/g, " __subst__ ")
    .replace(/\$\{[^}]*\}/g, " __subst__ ")
    .replace(/`[^`]*`/g, " __subst__ ");
}

function substitutionBodies(text: string): string[] {
  const bodies: string[] = [];
  for (const match of text.matchAll(/\$\(([^()]*)\)/g)) bodies.push(match[1]);
  for (const match of text.matchAll(/\$\{([^}]*)\}/g)) bodies.push(match[1]);
  for (const match of text.matchAll(/`([^`]*)`/g)) bodies.push(match[1]);
  return bodies;
}

// Split on the separator tokens the tokenizer reports, dropping empty runs
// (`&&` is two separators) so each element is one command.
function commandWords(text: string): string[][] {
  const segments: string[][] = [];
  let current: string[] = [];
  for (const token of shellTokens(text)) {
    if (token.separator) {
      if (current.length > 0) segments.push(current);
      current = [];
      continue;
    }
    current.push(token.value);
  }
  if (current.length > 0) segments.push(current);
  return segments;
}

function commandName(word: string): string {
  const slashed = word.replace(/\\/g, "/");
  return slashed.slice(slashed.lastIndexOf("/") + 1).toLowerCase();
}

// Strip assignments and wrappers so the first remaining word is the command
// that actually runs. The stripped prefix is kept for the skip escape hatch.
function commandStart(words: string[]): { prefix: string[]; words: string[]; payload?: string } {
  let i = 0;
  const prefix: string[] = [];
  let payload: string | undefined;
  const takeAssignments = () => {
    while (i < words.length && ASSIGNMENT.test(words[i])) {
      prefix.push(words[i]);
      i += 1;
    }
  };
  takeAssignments();
  while (i < words.length && WRAPPERS.has(commandName(words[i]))) {
    const wrapper = commandName(words[i]);
    prefix.push(words[i]);
    i += 1;
    const valueFlags = WRAPPER_VALUE_FLAGS[wrapper] || new Set<string>();
    const payloadFlags = WRAPPER_PAYLOAD_FLAGS[wrapper] || new Set<string>();
    // `taskset -c 0-3 gh` carries the CPU list as a flag value; only the
    // `taskset 0x3 gh` mask form has a positional to skip.
    let skip = WRAPPER_POSITIONAL[wrapper] || 0;
    const consumeFlags = () => {
      while (i < words.length && words[i].startsWith("-")) {
        const flag = words[i];
        if (
          wrapper === "taskset" &&
          (flag === "-c" || flag === "--cpu-list" || flag.startsWith("--cpu-list="))
        ) {
          skip = 0;
        }
        prefix.push(flag);
        i += 1;
        if (flag === "--") break;
        if (payloadFlags.has(flag) && i < words.length) {
          payload = words[i];
          prefix.push(words[i]);
          i += 1;
          return;
        }
        if (valueFlags.has(flag) && !flag.includes("=") && i < words.length) {
          prefix.push(words[i]);
          i += 1;
        }
      }
    };
    consumeFlags();
    // `timeout 30 gh` and `flock /tmp/l gh` spend a positional before the
    // command; options may also follow that positional (`flock /tmp/l -c ...`).
    for (let n = 0; n < skip && i < words.length && !words[i].startsWith("-"); n += 1) {
      prefix.push(words[i]);
      i += 1;
    }
    if (skip > 0) consumeFlags();
    if (payload !== undefined) break;
    takeAssignments();
  }
  let rest = words.slice(i);
  // A subshell group or negation is not part of the command word:
  // `(gh pr create)` and `!(gh pr create)` both run gh.
  while (rest.length > 0 && /^[({!]+$/.test(rest[0])) rest = rest.slice(1);
  if (rest.length > 0) rest[0] = rest[0].replace(/^[({!]+/, "");
  if (rest.length > 0) rest[rest.length - 1] = rest[rest.length - 1].replace(/\)+$/, "");
  // A bare `$VAR` in command position resolves to a binary the parser cannot
  // read. Mark it like `${...}` so the gate can fail closed instead of
  // treating `$RUNNER pr create` as an unknown command.
  if (rest.length > 0 && /^\$[A-Za-z_][A-Za-z0-9_]*$/.test(rest[0])) rest[0] = "__subst__";
  return { prefix, words: rest, payload };
}

// Every invocation of `gh pr create` in the command. All of them are
// evaluated: `gh pr create --draft; gh pr create --fill` is still a real
// creation and must not be exempted by the first one.
function ghInvocations(text: string, depth = 0): GhInvocation[] {
  const found: GhInvocation[] = [];
  for (const segment of commandWords(stripSubstitutions(text))) {
    const { prefix, words, payload } = commandStart(segment);
    // `flock /tmp/l -c "gh pr create"` carries its command in an argument.
    if (payload !== undefined && depth < 2) {
      for (const invocation of ghInvocations(payload, depth + 1)) {
        found.push({ prefix: [...prefix, ...invocation.prefix], args: invocation.args });
      }
    }
    if (words.length === 0) continue;

    const name = commandName(words[0]);
    // A remote command through ssh runs on the other side; the host and ssh's
    // own options come first.
    if (name === "ssh" || name === "ssh.exe") {
      if (depth >= 2) continue;
      let j = 1;
      const skipSshFlags = () => {
        while (j < words.length && words[j].startsWith("-")) {
          j += SSH_VALUE_FLAGS.has(words[j]) ? 2 : 1;
        }
      };
      skipSshFlags();
      j += 1; // destination
      skipSshFlags(); // options may follow the destination too
      if (j < words.length) {
        for (const invocation of ghInvocations(words.slice(j).join(" "), depth + 1)) {
          found.push({ prefix: [...prefix, ...invocation.prefix], args: invocation.args });
        }
      }
      continue;
    }
    if (name === "eval") {
      if (depth < 2) {
        for (const invocation of ghInvocations(words.slice(1).join(" "), depth + 1)) {
          found.push({ prefix: [...prefix, ...invocation.prefix], args: invocation.args });
        }
      }
      continue;
    }
    if (SHELLS.has(name)) {
      if (depth >= 2) continue;
      // `bash -lc`, `sh -c`, `powershell -Command`, `cmd /c`.
      const flagIndex = words.findIndex(
        (word) => /^-[a-z]*c[a-z]*$/i.test(word) || /^\/[ck]$/i.test(word),
      );
      if (flagIndex === -1 || flagIndex + 1 >= words.length) continue;
      const payload = words.slice(flagIndex + 1).join(" ");
      // The outer prefix travels with the inner invocation: `bash` exports a
      // `CODE_REVIEW_SKIP=1` assignment to the command it runs.
      for (const invocation of ghInvocations(payload, depth + 1)) {
        found.push({ prefix: [...prefix, ...invocation.prefix], args: invocation.args });
      }
      continue;
    }

    if (name !== "gh" && name !== "gh.exe") continue;

    // Global flags may precede the subcommand; `--repo`/`-R` take a value.
    let i = 1;
    while (i < words.length && words[i] !== "pr") {
      i += words[i] === "--repo" || words[i] === "-R" ? 2 : 1;
    }
    if (i >= words.length) continue;
    const subcommand = words[i + 1];
    if (subcommand !== "create" && subcommand !== "new") continue;
    found.push({ prefix, args: words.slice(i + 2) });
  }
  // A substitution the shell runs is also a command: `echo $(gh pr create)`
  // creates a PR even though the outer command word is `echo`.
  if (depth < 2) {
    for (const body of substitutionBodies(text)) {
      found.push(...ghInvocations(body, depth + 1));
    }
  }
  return found;
}

// Fail closed only where the subcommand cannot be read: `gh pr $(echo create)`
// strips to `__subst__`. A parseable non-create (`gh pr list --label new`,
// `gh pr close 12 --body "create changelog"`) is a real command and stays
// ungated — the word after `pr`, not the whole segment, decides.
function suspiciousCreation(command: string, depth = 0): boolean {
  for (const segment of commandWords(stripSubstitutions(command))) {
    const { words } = commandStart(segment);
    if (words.length === 0) continue;
    const name = commandName(words[0]);
    if (name === "__subst__") {
      // `$RUNNER pr create` or `$(...) pr create`: the command word is
      // unknown, so a literal `pr create` after it cannot be cleared.
      const pr = words.findIndex((word, i) => i > 0 && word === "pr");
      if (pr !== -1) {
        const sub = words[pr + 1];
        if (sub === "create" || sub === "new" || sub === "__subst__") return true;
      }
      continue;
    }
    if (name !== "gh" && name !== "gh.exe") continue;
    // Find the `pr` word with the same value-skipping rule the invocation
    // parser uses, so `gh -R pr create` does not read the repo name as the
    // subcommand.
    let pr = -1;
    for (let i = 1; i < words.length; i += 1) {
      if (words[i] === "pr") {
        pr = i;
        break;
      }
      if (words[i] === "--repo" || words[i] === "-R") i += 1;
    }
    if (pr === -1) continue;
    const subcommand = words[pr + 1];
    if (subcommand === "__subst__" || subcommand === "create" || subcommand === "new") {
      return true;
    }
  }
  if (depth < 2) {
    for (const body of substitutionBodies(command)) {
      if (suspiciousCreation(body, depth + 1)) return true;
    }
  }
  return false;
}

// `gh pr create` flags that take a value. The next token is that value, even
// when it looks like a flag, because pflag does not re-inspect it.
const VALUE_FLAGS = new Set([
  "--title", "-t",
  "--body", "-b",
  "--body-file", "-F",
  "--head", "-H",
  "--base", "-B",
  "--reviewer", "-r",
  "--label", "-l",
  "--assignee", "-a",
  "--milestone", "-m",
  "--project", "-p",
  "--template", "-T",
  "--repo", "-R",
]);

// `sudo` resets the environment unless told otherwise, so a
// `CODE_REVIEW_SKIP=1` assignment before it never reaches gh.
function skipExempt(prefix: string[]): boolean {
  if (!prefix.includes("CODE_REVIEW_SKIP=1")) return false;
  const sudo = prefix.indexOf("sudo");
  if (sudo === -1) return true;
  const args = prefix.slice(sudo + 1);
  return (
    args.includes("-E") ||
    args.some((arg) => arg === "--preserve-env" || arg.startsWith("--preserve-env="))
  );
}

export function prCreateVerdict(command: string): { creates: boolean; gated: boolean; reason: string } {
  const text = String(command ?? "");
  const invocations = ghInvocations(text);
  if (invocations.length === 0) {
    if (suspiciousCreation(text)) {
      return { creates: true, gated: true, reason: "unparsed gh pr create" };
    }
    return { creates: false, gated: false, reason: "no gh pr create" };
  }

  let gated = false;
  const reasons: string[] = [];
  for (const invocation of invocations) {
    // pflag consumes the next argument as the value of a string flag, so
    // `--body "--draft"` is a body value, not a draft flag. Inline
    // `--flag=value` forms carry their own value and never consume a token.
    const flags: string[] = [];
    for (let i = 0; i < invocation.args.length; i += 1) {
      const arg = invocation.args[i];
      if (VALUE_FLAGS.has(arg)) {
        i += 1;
        continue;
      }
      const group = /^-([a-zA-Z]{2,})$/.exec(arg);
      if (group && [...group[1]].every((letter) => SHORTHAND_BOOLEANS.has(letter))) {
        for (const letter of group[1]) flags.push(`-${letter}`);
        continue;
      }
      flags.push(arg);
    }

    // Non-mutating invocations cannot create a PR.
    if (flags.includes("--help") || flags.includes("-h") || flags.includes("--dry-run")) {
      reasons.push("non-mutating");
      continue;
    }

    // Drafts exist for early CI; they are not the shipping gate. A later
    // `--draft=false` wins, as it does in gh itself.
    let draft: boolean | null = null;
    for (const arg of flags) {
      if (arg === "--draft" || arg === "-d" || arg === "--draft=true") draft = true;
      else if (arg === "--draft=false") draft = false;
    }
    if (draft === true) {
      reasons.push("draft");
      continue;
    }

    if (skipExempt(invocation.prefix)) {
      reasons.push("CODE_REVIEW_SKIP=1");
      continue;
    }

    gated = true;
    reasons.push(draft === false ? "--draft=false" : "review required");
  }

  return { creates: true, gated, reason: reasons.join("; ") };
}

export function isPrCreate(command: string): boolean {
  return prCreateVerdict(command).gated;
}

export default define({
  id: "opencode-code-review",
  async setup(ctx) {
    // The V2 runtime context is richer than the published compat types.
    // `location` is where this plugin instance loaded; `session` resolves the
    // per-session location (a worktree is a different git dir from its project).
    const context = ctx as unknown as {
      location?: { directory?: string };
      session?: {
        get: (input: { sessionID: string }) => Promise<
          { directory?: string; location?: { directory?: string } } | undefined
        >;
      };
    };
    const pluginRoot = context.location?.directory || null;

    const resolveRoot = async (sessionID?: string): Promise<string | null> => {
      if (sessionID && context.session?.get) {
        try {
          const session = await context.session.get({ sessionID });
          // The session directory lives under `location` on the V2 schema and
          // directly on the session in some SDK builds; accept both.
          const directory = session?.location?.directory || session?.directory;
          if (directory) return directory;
        } catch {
          // Fall through to the plugin location; a failed lookup must not
          // silently disable the gate.
        }
      }
      return pluginRoot;
    };

    await ctx.agent.transform((draft) => {
      draft.update("code-review", (agent) => {
        agent.mode = "primary";
        agent.steps = 80;
        agent.color = "accent";
        agent.description =
          "Local code review gate: cross model reviewers, confidence gated, synced to the PR.";
        agent.system = AGENT_PROMPT;
      });
    });

    await ctx.command.transform((editor) => {
      editor.add({
        name: "code-review",
        description:
          "Run the local code review gate: cross model reviewers, confidence gated, synced to the PR.",
        agent: "code-review",
        template: COMMAND_TEMPLATE,
      });
    });

    await ctx.tool.transform((editor) => {
      editor.namespace({
        name: "code_review",
        description: "Inspect the local code review artifact for the current checkout",
      });

      editor.add({
        name: "status",
        description:
          "Return whether the current HEAD has a complete code review, its verdict, and the report path. Read only.",
        input: { type: "object", properties: {}, additionalProperties: false },
        async execute(_input, toolContext) {
          const root = await resolveRoot(
            readSessionID((toolContext ?? {}) as Record<string, unknown>),
          );
          if (!root) {
            return {
              content: JSON.stringify({ error: "cannot resolve the project directory for this session" }),
            };
          }
          const { path, state, head } = readState(root);
          if (!path) return { content: JSON.stringify({ error: "not a git repository" }) };
          if (!state) {
            return {
              content: JSON.stringify({
                reviewed: false,
                reason: "no review artifact",
                expected: path,
                head,
              }),
            };
          }
          return {
            content: JSON.stringify(
              {
                reviewed: true,
                head,
                reviewedHead: state.head,
                fresh: reviewCoversHead(state, head, root),
                via:
                  state.head && state.head === head
                    ? "head"
                    : reviewCoversHead(state, head, root)
                      ? "commit"
                      : "none",
                complete: state.complete !== false,
                verdict: state.verdict,
                counts: state.counts,
                reviewer: state.reviewer,
                author: state.author,
                report: state.reportRelative,
                summary: describe(state),
              },
              null,
              2,
            ),
          };
        },
      });
    });

    // The gate. A hook, not an instruction: `gh pr create` cannot run until a
    // complete review of the current HEAD passed.
    await ctx.tool.hook("execute.before", async (event) => {
      const ev = (event ?? {}) as Record<string, unknown>;
      const toolName = typeof ev.tool === "string" ? ev.tool : "";
      if (toolName !== "bash" && toolName !== "shell") return;

      const input = (ev.input ?? ev.args ?? {}) as Record<string, unknown>;
      const command = typeof input.command === "string" ? input.command : "";
      if (!command) return;

      // Read the raw command: the creation is located first, then only that
      // invocation's arguments are inspected. A literal `--draft` inside a
      // quoted title is a value, not a flag, so it cannot exempt a real
      // create; a nested `bash -lc "gh pr create --draft"` still counts.
      const verdict = prCreateVerdict(command);
      if (!verdict.gated) return;

      const root = await resolveRoot(readSessionID(ev));
      if (!root) {
        throw new Error(
          "Blocked: cannot resolve the project directory for this checkout. " +
            "The gate refuses to guess from the server working directory. " +
            "Drafts are allowed, and `enforce_pr_gate: false` in .opencode/review.json disables this gate.",
        );
      }

      const config = reviewConfig(root);
      if (config.enforce_pr_gate === false) return;

      const { path, state, head } = readState(root);
      const run = "Run `/code-review` (or the `code-review` skill) first.";

      if (!path) {
        throw new Error(
          `Blocked: cannot find a git repository at ${root}. The gate refuses to guess. ${run} ` +
            `Drafts are allowed, and \`enforce_pr_gate: false\` in .opencode/review.json disables this gate.`,
        );
      }
      if (!state) {
        throw new Error(
          `Blocked: this repository has no code review artifact for the current checkout. ${run} ` +
            `Drafts are allowed, and \`enforce_pr_gate: false\` in .opencode/review.json disables this gate.`,
        );
      }
      if (head && !reviewCoversHead(state, head, root)) {
        throw new Error(
          `Blocked: the last code review covers ${String(state.head).slice(0, 8)}, but HEAD is ${String(head).slice(0, 8)}. ` +
            `The review is stale. ${run}`,
        );
      }
      if (state.complete === false) {
        throw new Error(
          `Blocked: the last code review is incomplete (${(state.agents && state.agents.reported) || 0} of ` +
            `${(state.agents && state.agents.expected) || "?"} reviewer agents reported). ${run} ` +
            `An incomplete review is not a clean review.`,
        );
      }
      if (state.verdict === "blocked" || state.verdict === "changes-requested") {
        throw new Error(
          `Blocked: the code review returned "${state.verdict}" (${describe(state)}). ` +
            `Fix the findings in ${state.reportPath || "the review report"}, rerun /code-review, then open the PR.`,
        );
      }
    });
  },
});
