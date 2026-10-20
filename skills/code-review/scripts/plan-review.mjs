#!/usr/bin/env node
// Plan a code review for a small-context reviewer.
//
// Resolves the change set, classifies files, estimates tokens, splits the diff
// into chunks that fit a 200k window with room to read the changed files, and
// writes one unified diff per chunk plus plan.json.
//
// Usage:
//   node plan-review.mjs [--base <ref>] [--chunk-tokens <n>] [--max-context <n>]
//                        [--out <dir>] [--level quick|standard|deep]
//
// Exit 0 with {"empty":true} when there is nothing to review.
// Exit 2 with {"error":"..."} on a git or filesystem error.

import { mkdirSync, readFileSync, writeFileSync, statSync } from "node:fs";
import { join, resolve, sep } from "node:path";
import { tmpdir } from "node:os";
import {
  classify,
  decodeGitQuotedPath,
  estimateDiffTokens,
  estimateTextTokens,
  git,
  gitDir,
  loadReviewConfig,
  tryGit,
} from "./lib.mjs";

function parseArgs(argv) {
  const out = { level: "standard" };
  for (let i = 0; i < argv.length; i += 1) {
    const a = argv[i];
    if (a === "--base") out.base = argv[++i];
    else if (a === "--chunk-tokens") out.chunkTokens = Number(argv[++i]);
    else if (a === "--max-context") out.maxContext = Number(argv[++i]);
    else if (a === "--out") out.out = argv[++i];
    else if (a === "--level") out.level = argv[++i];
    else if (a === "--no-untracked") out.untracked = false;
  }
  return out;
}

function detectBase(cwd, explicit) {
  if (explicit) return explicit;
  const candidates = ["origin/main", "origin/master", "main", "master"];
  for (const ref of candidates) {
    if (tryGit(["rev-parse", "--verify", "--quiet", ref], cwd)) return ref;
  }
  return null;
}

// Parse `git diff --numstat -z` output. Records are NUL separated and paths
// are never C-quoted: `added<TAB>deleted<TAB>path\0`, and for a rename
// `added<TAB>deleted<TAB>\0old-path\0new-path\0`.
function splitNumstatZ(out) {
  const records = String(out).split("\0");
  const entries = [];
  for (let i = 0; i < records.length; i += 1) {
    const record = records[i];
    if (!record) continue;
    const parts = record.split("\t");
    if (parts.length < 3) continue;
    const added = parts[0] === "-" ? 0 : Number.parseInt(parts[0], 10) || 0;
    const removed = parts[1] === "-" ? 0 : Number.parseInt(parts[1], 10) || 0;
    let path = parts.slice(2).join("\t");
    if (!path) {
      // Rename record: the two pathnames follow as separate NUL fields.
      path = records[i + 2] || records[i + 1] || "";
      i += 2;
    }
    if (!path) continue;
    entries.push({ path, added, removed });
  }
  return entries;
}

// Decode a path from git. Only a quoted path whose escaped bytes are not
// valid UTF-8 is genuinely undecodable. A real filename that contains -- or
// even starts with -- a quote comes back unchanged (git escapes a quoted path,
// so a quoted-looking name with no escape is a literal name), and it must be
// reviewed like any other file.
function decodedPath(raw) {
  const path = decodeGitQuotedPath(raw);
  return path.includes("\uFFFD") ? null : path;
}

function syntheticUntracked(cwd, path, maxBytes) {
  let text;
  try {
    const buf = readFileSync(join(cwd, path));
    if (buf.length > maxBytes) {
      text = buf.subarray(0, maxBytes).toString("utf8");
      const lines = text.split("\n");
      lines.push("", `[truncated: file is ${buf.length} bytes, only the first ${maxBytes} were reviewed]`);
      text = lines.join("\n");
    } else {
      text = buf.toString("utf8");
    }
  } catch {
    return "";
  }
  const lines = text.split("\n");
  const body = lines.map((l) => `+${l}`).join("\n");
  return [
    `diff --git a/${path} b/${path}`,
    "new file mode 100644",
    "index 0000000..0000000",
    "--- /dev/null",
    `+++ b/${path}`,
    `@@ -0,0 +1,${lines.length} @@`,
    body,
    "",
  ].join("\n");
}

// Split one rendered diff into self-contained hunks. Every `diff --git` line
// starts a new file preamble, and each hunk array carries a copy of its own
// file's preamble. A part that starts with a bare `@@` would lose its file
// context and parseDiff would bind its added lines to the previous file.
function splitHunks(diffText) {
  const lines = diffText.split("\n");
  const hunks = [];
  let preamble = [];
  let cur = null;

  const flush = () => {
    if (!cur) return;
    hunks.push([...preamble, ...cur]);
    cur = null;
  };

  for (const line of lines) {
    if (line.startsWith("diff --git ")) {
      flush();
      preamble = [line];
    } else if (line.startsWith("@@")) {
      flush();
      cur = [line];
    } else if (cur) {
      cur.push(line);
    } else {
      preamble.push(line);
    }
  }
  flush();
  return hunks;
}

function packHunks(hunks, budgetTokens) {
  const parts = [];
  let current = null;
  for (const hunk of hunks) {
    const text = hunk.join("\n");
    const tokens = estimateTextTokens(text);
    if (tokens > budgetTokens) {
      if (current) {
        parts.push(current);
        current = null;
      }
      const maxChars = Math.max(2000, budgetTokens * 4);
      const truncatedText = text.slice(0, maxChars) + "\n[truncated: one hunk exceeded the chunk budget]\n";
      parts.push({ text: truncatedText, truncated: true, omittedHunks: 0 });
      continue;
    }
    if (current && current.tokens + tokens > budgetTokens) {
      parts.push(current);
      current = null;
    }
    if (!current) current = { text, tokens, truncated: false, omittedHunks: 0 };
    else {
      current.text += "\n" + text;
      current.tokens += tokens;
    }
  }
  if (current) parts.push(current);
  return parts;
}

function safeStamp(date = new Date()) {
  return date.toISOString().replace(/[:.]/g, "-");
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  const cwd = resolve(process.cwd());
  const config = loadReviewConfig(cwd);

  const maxContext = args.maxContext || Number(config.max_context_tokens) || 200000;
  const chunkTokens =
    args.chunkTokens || Number(config.chunk_tokens) || Math.min(40000, Math.floor(maxContext / 5));

  const gd = gitDir(cwd);
  if (!gd) {
    console.error(JSON.stringify({ error: "not a git repository", cwd }));
    process.exit(2);
  }

  const head = tryGit(["rev-parse", "HEAD"], cwd);
  if (!head) {
    console.error(JSON.stringify({ error: "no commits yet; make one commit before reviewing", cwd }));
    process.exit(2);
  }

  const branch = tryGit(["rev-parse", "--abbrev-ref", "HEAD"], cwd) || "HEAD";
  const base = detectBase(cwd, args.base || config.base);
  if (!base) {
    console.error(JSON.stringify({ error: "no base branch found (tried origin/main, origin/master, main, master); pass --base", cwd }));
    process.exit(2);
  }

  const shortBase = base.replace(/^origin\//, "");
  const mode = branch === shortBase ? "uncommitted" : "branch";
  const mergeBase = mode === "branch" ? tryGit(["merge-base", base, "HEAD"], cwd) : null;
  if (mode === "branch" && !mergeBase) {
    console.error(JSON.stringify({ error: `no merge base between ${base} and HEAD`, cwd, base }));
    process.exit(2);
  }
  const range = mode === "branch" ? mergeBase : "HEAD";

  const numstat = git(["diff", "--numstat", "-z", "--find-renames", range], cwd);
  const entries = new Map();
  const skipped = [];
  for (const item of splitNumstatZ(numstat)) {
    const path = decodedPath(item.path);
    if (path === null) {
      skipped.push({ path: item.path, reason: "undecodable path", added: item.added, removed: item.removed });
      continue;
    }
    entries.set(path, { path, added: item.added, removed: item.removed, untracked: false });
  }

  if (args.untracked !== false) {
    const others = (tryGit(["ls-files", "--others", "--exclude-standard", "-z"], cwd) || "")
      .split("\0")
      .filter(Boolean);
    for (const raw of others) {
      const path = decodedPath(raw);
      if (path === null) {
        skipped.push({ path: raw, reason: "undecodable path", added: 0, removed: 0 });
        continue;
      }
      if (entries.has(path)) continue;
      let bytes = 0;
      try {
        bytes = statSync(join(cwd, path)).size;
      } catch {
        skipped.push({ path, reason: "unreadable", added: 0, removed: 0 });
        continue;
      }
      entries.set(path, { path, added: Math.ceil(bytes / 40), removed: 0, untracked: true, bytes });
    }
  }

  const files = [];
  for (const entry of entries.values()) {
    const cls = classify(entry.path);
    if (cls.skip) {
      skipped.push({ path: entry.path, reason: cls.reason, added: entry.added, removed: entry.removed });
      continue;
    }
    if (!entry.untracked && entry.added + entry.removed === 0) continue;
    files.push({
      ...entry,
      kind: cls.kind,
      tokens: entry.untracked ? Math.ceil(entry.bytes / 4) + 120 : estimateDiffTokens(entry.added, entry.removed),
    });
  }

  const totalTokens = files.reduce((n, f) => n + f.tokens, 0);
  const planDir =
    args.out ||
    join(tmpdir(), "opencode-code-review", `${safeStamp()}-${head.slice(0, 8)}`);

  if (files.length === 0) {
    const empty = {
      empty: true,
      mode,
      base,
      mergeBase,
      head,
      branch,
      cwd,
      gitDir: gd,
      planDir,
      totals: { files: 0, skipped: skipped.length, diffTokens: 0, chunks: 0 },
      skipped,
      checkedAt: new Date().toISOString(),
    };
    mkdirSync(planDir, { recursive: true });
    writeFileSync(join(planDir, "plan.json"), JSON.stringify(empty, null, 2));
    console.log(JSON.stringify(empty, null, 2));
    return;
  }

  // Greedy pack in path order. A file that alone exceeds the budget gets its
  // own chunk and is split by hunk.
  const rawChunks = [];
  let current = { files: [], tokens: 0 };
  for (const file of files) {
    if (file.tokens > chunkTokens) {
      if (current.files.length) rawChunks.push(current);
      rawChunks.push({ files: [file], tokens: file.tokens });
      current = { files: [], tokens: 0 };
      continue;
    }
    if (current.files.length && current.tokens + file.tokens > chunkTokens) {
      rawChunks.push(current);
      current = { files: [], tokens: 0 };
    }
    current.files.push(file);
    current.tokens += file.tokens;
  }
  if (current.files.length) rawChunks.push(current);

  mkdirSync(planDir, { recursive: true });

  const chunks = [];
  let chunkId = 0;
  for (const raw of rawChunks) {
    const tracked = raw.files.filter((f) => !f.untracked).map((f) => f.path);
    const untracked = raw.files.filter((f) => f.untracked).map((f) => f.path);

    let diffText = "";
    if (tracked.length) {
      diffText = git(
        ["diff", "--no-color", "--no-ext-diff", "-U3", "--find-renames", range, "--", ...tracked],
        cwd,
      );
    }
    const unreadable = new Set();
    for (const path of untracked) {
      const synthetic = syntheticUntracked(cwd, path, chunkTokens * 2);
      if (!synthetic) {
        unreadable.add(path);
        skipped.push({ path, reason: "unreadable", added: 0, removed: 0 });
        continue;
      }
      diffText += (diffText ? "\n" : "") + synthetic;
    }
    const chunkFiles = raw.files.filter((f) => !unreadable.has(f.path));
    const chunkUntracked = untracked.filter((path) => !unreadable.has(path));

    if (!diffText.trim()) continue;

    if (estimateTextTokens(diffText) <= chunkTokens) {
      chunkId += 1;
      const file = join(planDir, `chunk-${chunkId}.diff`);
      writeFileSync(file, diffText);
      chunks.push({
        id: chunkId,
        files: chunkFiles.map((f) => f.path),
        kinds: chunkFiles.map((f) => f.kind),
        untracked: chunkUntracked,
        diffFile: file,
        tokens: estimateTextTokens(diffText),
        estimatedTokens: raw.tokens,
        truncated: false,
      });
      continue;
    }

    const hunks = splitHunks(diffText);
    const parts = packHunks(hunks, chunkTokens);
    for (const part of parts) {
      chunkId += 1;
      const file = join(planDir, `chunk-${chunkId}.diff`);
      writeFileSync(file, part.text);
      chunks.push({
        id: chunkId,
        files: chunkFiles.map((f) => f.path),
        kinds: chunkFiles.map((f) => f.kind),
        untracked: chunkUntracked,
        diffFile: file,
        tokens: estimateTextTokens(part.text),
        estimatedTokens: raw.tokens,
        truncated: part.truncated,
      });
    }
  }

  // Mirror the skill's dispatch rule (SKILL.md: "Passes" x "Agent budget"):
  // one agent per chunk and pass while that fits the budget, otherwise one
  // agent per chunk capped at the budget. reconcile-review defaults to this
  // count, so a missing report must not pass as complete.
  const passes = { quick: 1, standard: 3, deep: 5 }[args.level] ?? 3;
  const agentBudget = { quick: 2, standard: 4, deep: 8 }[args.level] ?? 4;
  const agents =
    chunks.length * passes <= agentBudget
      ? chunks.length * passes
      : Math.min(chunks.length, agentBudget);
  // More chunks than the budget can give an agent: the tail chunk gets no
  // reviewer, so its content would never be read. The count above cannot
  // express that, so the overshoot is recorded and the reconciler refuses to
  // call such a review complete. Rerun the planner with a larger
  // --chunk-tokens to bring the chunks inside the budget.
  const chunksExceedBudget = chunks.length > agentBudget;

  const plan = {
    empty: chunks.length === 0,
    mode,
    base,
    mergeBase,
    head,
    branch,
    cwd,
    gitDir: gd,
    planDir,
    level: args.level,
    agents,
    chunksExceedBudget,
    budget: { maxContextTokens: maxContext, chunkTokens },
    totals: {
      files: files.length,
      skipped: skipped.length,
      added: files.reduce((n, f) => n + f.added, 0),
      removed: files.reduce((n, f) => n + f.removed, 0),
      diffTokens: totalTokens,
      chunks: chunks.length,
      truncatedChunks: chunks.filter((c) => c.truncated).length,
    },
    chunks,
    skipped,
    checkedAt: new Date().toISOString(),
  };

  writeFileSync(join(planDir, "plan.json"), JSON.stringify(plan, null, 2));
  const stateDir = join(gd, "code-review");
  mkdirSync(stateDir, { recursive: true });
  writeFileSync(join(stateDir, "last-plan.json"), JSON.stringify(plan, null, 2));

  console.log(JSON.stringify(plan, null, 2));
}

try {
  main();
} catch (error) {
  console.error(
    JSON.stringify({
      error: String(error && error.message ? error.message : error),
      stderr: error && error.stderr ? String(error.stderr).slice(0, 2000) : undefined,
    }),
  );
  process.exit(2);
}
