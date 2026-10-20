#!/usr/bin/env node
// Reclaim disk the development loop accumulates.
//
// Default is a report: it measures every known cache and says what is safe to
// delete. `--apply` deletes.
//
// What it will never delete:
//   - `~/.cache/opencode` — that is the installed plugin tree, not a cache.
//     Removing it forces every plugin to reinstall at the next start, and that
//     slow start widens the window in which restored sessions drain before
//     plugin-provided agents (`orchestrator`, `designer`) are registered. That
//     window is what produced `Agent not found`.
//   - `~/.local/share/opencode/storage` and `~/.local/share/opencode/cache` —
//     session state and plugin data, not logs.
//   - worktree `node_modules` — a dev server or test run in a live session may
//     be executing out of it. It is reported, never removed.
//   - any repository file, branch, or worktree.
//
// `--apply` removes package-manager caches (they re-download on demand), the
// old OpenCode log files (the newest five are kept), and stale entries under
// `%TEMP%`. A cache touched in the last ten minutes is treated as in use by a
// running install and skipped, so a concurrent `npm install` in another
// session is not corrupted.
//
// Temp cleanup is the sharpest edge, so it is narrow on purpose: only entries
// whose name starts with an allow-listed prefix are considered, and only when
// they are both older than the keep window (`--keep-hours`, default 48) and
// older than 30 minutes. That 30 minute floor plus the prefix whitelist is
// the guard against deleting a temp entry a running process still holds open;
// `%TEMP%` itself is never touched.
//
// The report is one line per target, never per file. Temp entries that would
// be deleted are listed by path; skipped temp entries smaller than a megabyte
// collapse into a single line so a hundred empty install folders do not bury
// the numbers that matter.
//
// Usage:
//   node bin/clean.mjs                 report
//   node bin/clean.mjs --apply         delete
//   node bin/clean.mjs --dry-run       report (explicit)
//   node bin/clean.mjs --keep-hours 72 age window for the temp cleanup
//   node bin/clean.mjs --skip-temp     leave `%TEMP%` alone

import { existsSync, lstatSync, readdirSync, rmSync } from "node:fs";
import { homedir, tmpdir } from "node:os";
import { join, parse, resolve, sep } from "node:path";

// ------------------------------------------------------------------ options --

const argv = process.argv.slice(2);

function usage(message) {
  if (message) console.error(`clean: ${message}`);
  console.error(
    "Usage: node bin/clean.mjs [--apply | --dry-run] [--keep-hours <n>] [--skip-temp]",
  );
  process.exit(1);
}

const wantsApply = argv.includes("--apply");
const wantsDryRun = argv.includes("--dry-run");
if (wantsApply && wantsDryRun) usage("--apply and --dry-run contradict each other");

const APPLY = wantsApply;
const SKIP_TEMP = argv.includes("--skip-temp");

const DEFAULT_KEEP_HOURS = 48;
let KEEP_HOURS = DEFAULT_KEEP_HOURS;
for (let i = 0; i < argv.length; i++) {
  const arg = argv[i];
  if (arg === "--keep-hours") {
    const raw = argv[++i];
    if (raw === undefined) usage("--keep-hours needs a number of hours");
    KEEP_HOURS = Number(raw);
  } else if (arg.startsWith("--keep-hours=")) {
    KEEP_HOURS = Number(arg.slice("--keep-hours=".length));
  } else if (arg !== "--apply" && arg !== "--dry-run" && arg !== "--skip-temp") {
    usage(`unknown option "${arg}"`);
  }
  if (!Number.isFinite(KEEP_HOURS) || KEEP_HOURS < 0) {
    usage("--keep-hours needs a non-negative number of hours");
  }
}

// ------------------------------------------------------------------- limits --

// A cache touched this recently is probably being written by a running install.
const IN_USE_WINDOW_MS = 10 * 60 * 1000;
// How long a temp entry has to be idle before it is fair game.
const KEEP_WINDOW_MS = KEEP_HOURS * 60 * 60 * 1000;
// Floor for temp cleanup: a running process may still hold an entry open, so
// nothing under this age is removed no matter what `--keep-hours` says.
const TEMP_FLOOR_MS = 30 * 60 * 1000;
// Log files kept, newest first.
const LOG_KEEP_NEWEST = 5;
// Skipped temp entries below this size are summarised into a single line, so a
// report stays readable when `%TEMP%` holds a hundred empty install folders.
const TEMP_SUMMARY_MIN_BYTES = 1024 * 1024;

// ------------------------------------------------------------------ helpers --

function mb(bytes) {
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

function norm(path) {
  const resolved = resolve(path);
  return process.platform === "win32" ? resolved.toLowerCase() : resolved;
}

// True when `child` is `root` or lives inside it.
function isInside(child, root) {
  const c = norm(child);
  const r = norm(root);
  return c === r || c.startsWith(r.endsWith(sep) ? r : r + sep);
}

// Size and newest modification time of a file or tree.
//
// Symlinks and junctions are skipped: following one would count bytes outside
// the tree, and a delete that reached through a link would remove something
// that was never part of the cache.
function measure(target) {
  let root;
  try {
    root = lstatSync(target);
  } catch {
    return { bytes: 0, newest: 0 };
  }
  if (root.isSymbolicLink()) return { bytes: 0, newest: 0 };
  if (root.isFile()) return { bytes: root.size, newest: root.mtimeMs };
  if (!root.isDirectory()) return { bytes: 0, newest: 0 };

  let bytes = 0;
  let newest = root.mtimeMs;
  const walk = (dir) => {
    let entries;
    try {
      entries = readdirSync(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      const path = join(dir, entry.name);
      if (entry.isSymbolicLink()) continue;
      let stat;
      try {
        stat = lstatSync(path);
      } catch {
        continue; // raced with another process
      }
      if (stat.mtimeMs > newest) newest = stat.mtimeMs;
      if (stat.isDirectory()) walk(path);
      else if (stat.isFile()) bytes += stat.size;
    }
  };
  walk(target);
  return { bytes, newest };
}

// Every regular file in a tree, newest first.
function listFiles(target) {
  const files = [];
  const walk = (dir) => {
    let entries;
    try {
      entries = readdirSync(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      const path = join(dir, entry.name);
      if (entry.isSymbolicLink()) continue;
      let stat;
      try {
        stat = lstatSync(path);
      } catch {
        continue;
      }
      if (stat.isDirectory()) walk(path);
      else if (stat.isFile()) files.push({ path, bytes: stat.size, mtime: stat.mtimeMs });
    }
  };
  walk(target);
  return files;
}

// -------------------------------------------------------------------- paths --

const home = homedir();
const local = process.env.LOCALAPPDATA || join(home, "AppData", "Local");
const roaming = process.env.APPDATA || join(home, "AppData", "Roaming");
const profile = process.env.USERPROFILE || home;
// `resolve` strips the trailing separator Windows sometimes leaves on TEMP and
// gives us one absolute path to compare against.
const tempRoot = resolve(process.env.TEMP || tmpdir());
// Worktrees live on the same drive as their repository (AGENTS.md), so the
// hygiene report has to look there and not only at one fixed letter. The
// repository's own drive is the first candidate; the rest are extra roots.
const worktreeRoots = [
  ...new Set(
    [
      process.env.OPENCODE_WORKTREE_ROOT,
      join(parse(process.cwd()).root, "Work", "worktrees"),
      "F:\\worktrees",
    ].filter(Boolean),
  ),
];

// Never measured as reclaimable, never deleted. The plugin install tree is
// the one that matters: it is a cache directory by name only.
const protectedRoots = [
  join(home, ".cache", "opencode"), // plugin install tree
  join(home, ".local", "share", "opencode", "storage"), // session + plugin storage
  join(home, ".local", "share", "opencode", "cache"), // plugin cache
];

const isProtected = (path) => protectedRoots.some((root) => isInside(path, root));

// ------------------------------------------------------------------ targets --

// Only package-manager caches: rebuilt on the next install, and nothing a
// running OpenCode session reads from.
const cacheTargets = [
  ["npm cache", join(local, "npm-cache")],
  ["npm cache (roaming)", join(roaming, "npm-cache")],
  ["yarn cache", join(local, "Yarn", "Cache")],
  ["pnpm store", join(local, "pnpm", "store")],
  ["bun install cache", join(profile, ".bun", "install", "cache")],
  ["bun cache", join(home, ".cache", "bun")],
  ["pip cache", join(local, "pip", "Cache")],
  ["uv cache", join(local, "uv", "cache")],
];

// Temp entries are matched by name prefix only. Anything else in `%TEMP%` is
// none of our business.
const TEMP_PREFIXES = [
  "opencode-code-review-post-",
  "opencode-code-review",
  "opencode",
  "npm-",
  "yarn-",
  "bun-",
  "tmp",
  "hsperfdata",
];

const rows = [];
const now = Date.now();

for (const [label, path] of cacheTargets) {
  if (!existsSync(path)) continue;
  if (isProtected(path)) continue;
  const { bytes, newest } = measure(path);
  const inUse = now - newest < IN_USE_WINDOW_MS;
  rows.push({
    label,
    path,
    bytes,
    reclaimable: !inUse,
    notes: inUse ? ["in use — skipped"] : [],
    kind: "cache",
  });
}

// OpenCode writes one log file per session and rotates. The newest five stay
// (that is the live session plus its recent history); older ones are noise.
// A file touched in the last ten minutes is still being written and stays too.
const logDir = join(home, ".local", "share", "opencode", "log");
let logDeletable = [];
if (existsSync(logDir) && !isProtected(logDir)) {
  const files = listFiles(logDir).sort((a, b) => b.mtime - a.mtime);
  const keep = new Set(files.slice(0, LOG_KEEP_NEWEST).map((file) => file.path));
  let held = 0;
  for (const file of files) {
    if (!keep.has(file.path) && now - file.mtime < IN_USE_WINDOW_MS) {
      keep.add(file.path);
      held += 1;
    }
  }
  logDeletable = files.filter((file) => !keep.has(file.path));
  const notes = [];
  if (files.length > LOG_KEEP_NEWEST) notes.push(`kept ${LOG_KEEP_NEWEST} newest`);
  if (held > 0) notes.push("in use — recent file kept");
  rows.push({
    label: "opencode logs",
    path: logDir,
    bytes: logDeletable.reduce((sum, file) => sum + file.bytes, 0),
    reclaimable: true,
    notes,
    kind: "logs",
  });
}

// Temp cleanup. The prefix whitelist plus the 30 minute floor is the guard
// against removing an entry a running process still holds open: anything we
// do not recognise by name, and anything younger than the floor, is left be.
if (!SKIP_TEMP && existsSync(tempRoot)) {
  let entries;
  try {
    entries = readdirSync(tempRoot, { withFileTypes: true });
  } catch {
    entries = [];
  }
  for (const entry of entries) {
    if (!TEMP_PREFIXES.some((prefix) => entry.name.startsWith(prefix))) continue;
    const path = join(tempRoot, entry.name);
    if (isProtected(path)) continue;
    if (entry.isSymbolicLink()) continue;
    const { bytes, newest } = measure(path);
    const age = now - newest;
    const eligible = age > KEEP_WINDOW_MS && age > TEMP_FLOOR_MS;
    rows.push({
      label: `temp ${entry.name}`,
      path,
      bytes,
      reclaimable: eligible,
      notes: eligible ? [] : ["in use — too recent"],
      kind: "temp",
    });
  }
}

// Worktree node_modules are reported only. A live session may be running a dev
// server or tests out of one, and there is no reliable way to tell from here.
const worktreeRows = [];
for (const worktreeRoot of worktreeRoots) {
  if (!existsSync(worktreeRoot)) continue;
  for (const repo of readdirSync(worktreeRoot, { withFileTypes: true })) {
    if (!repo.isDirectory() || repo.isSymbolicLink()) continue;
    const repoPath = join(worktreeRoot, repo.name);
    for (const wt of readdirSync(repoPath, { withFileTypes: true })) {
      if (!wt.isDirectory() || wt.isSymbolicLink()) continue;
      const nm = join(repoPath, wt.name, "node_modules");
      if (!existsSync(nm)) continue;
      const { bytes } = measure(nm);
      worktreeRows.push({
        label: `worktree node_modules ${repo.name}/${wt.name}`,
        path: nm,
        bytes,
      });
    }
  }
}

// One target per tree. A path that lives inside another target is the same
// bytes counted twice, and printing it would print a path inside a tree we are
// about to delete.
function outermost(list) {
  const byPath = new Map();
  for (const row of list) {
    const key = norm(row.path);
    if (!byPath.has(key)) byPath.set(key, row);
  }
  const unique = [...byPath.values()];
  return unique.filter(
    (row) => !unique.some((other) => other !== row && isInside(row.path, other.path)),
  );
}

const targets = outermost(rows);
const reportOnly = outermost(worktreeRows);

// Skipped temp entries that are too small to matter are summarised into one
// line: the report says how much is sitting there, not every empty folder.
const listed = [];
const summarized = [];
for (const row of targets) {
  if (row.kind === "temp" && !row.reclaimable && row.bytes < TEMP_SUMMARY_MIN_BYTES) {
    summarized.push(row);
  } else {
    listed.push(row);
  }
}
if (summarized.length) {
  listed.push({
    label: `temp (${summarized.length} entries)`,
    path: tempRoot,
    bytes: summarized.reduce((sum, row) => sum + row.bytes, 0),
    reclaimable: false,
    notes: ["in use — too recent"],
    kind: "temp-summary",
  });
}
const total = listed
  .filter((row) => row.reclaimable)
  .reduce((sum, row) => sum + row.bytes, 0);

// ------------------------------------------------------------------- output --

console.log(APPLY ? "Reclaiming:" : "Reclaimable (dry run — pass --apply to delete):");
for (const row of [...listed].sort((a, b) => b.bytes - a.bytes)) {
  const note = row.notes.length ? `  (${row.notes.join("; ")})` : "";
  console.log(`  ${mb(row.bytes).padStart(10)}  ${row.label}  ${row.path}${note}`);
}

if (reportOnly.length) {
  console.log("\nReport only (never deleted):");
  let reportTotal = 0;
  for (const row of [...reportOnly].sort((a, b) => b.bytes - a.bytes)) {
    reportTotal += row.bytes;
    console.log(`  ${mb(row.bytes).padStart(10)}  ${row.label}  ${row.path}`);
  }
  console.log(`  ${mb(reportTotal).padStart(10)}  worktree node_modules total`);
}

console.log(`  ${mb(total).padStart(10)}  total reclaimable`);
console.log("  (protected)  the opencode plugin install tree is never reclaimed");

if (!APPLY) {
  console.log("\nNothing was deleted.");
  process.exit(0);
}

// -------------------------------------------------------------------- apply --

let freed = 0;
for (const row of listed) {
  if (!row.reclaimable) continue;
  if (isProtected(row.path)) continue; // belt and braces
  if (norm(row.path) === norm(tempRoot)) continue; // never delete `%TEMP%` itself
  if (row.kind === "logs") {
    for (const file of logDeletable) {
      try {
        rmSync(file.path, { force: true });
        freed += file.bytes;
      } catch (error) {
        console.error(`  could not remove ${file.path}: ${error.message}`);
      }
    }
    continue;
  }
  try {
    rmSync(row.path, { recursive: true, force: true });
    // What is left is what we did not actually free.
    freed += Math.max(0, row.bytes - measure(row.path).bytes);
  } catch (error) {
    console.error(`  could not remove ${row.path}: ${error.message}`);
  }
}

console.log(`\nFreed ${mb(freed)}. Caches rebuild on demand; the next install re-downloads.`);
console.log("Worktree node_modules were left alone; remove them yourself once no session uses them.");
