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
//   - worktree `node_modules` — a dev server or test run in a live session may
//     be executing out of it. It is reported, never removed.
//   - any repository file, branch, or worktree.
//
// `--apply` only removes package-manager caches (they re-download on demand)
// and review scratch directories older than a day. A cache written in the last
// ten minutes is treated as in use by a running install and skipped, so a
// concurrent `npm install` in another session is not corrupted.
//
// Usage:
//   node bin/clean.mjs            report
//   node bin/clean.mjs --apply    delete

import { existsSync, readdirSync, rmSync, statSync } from "node:fs";
import { homedir, tmpdir } from "node:os";
import { join } from "node:path";

const APPLY = process.argv.includes("--apply");

// A cache touched this recently is probably being written by a running install.
const IN_USE_WINDOW_MS = 10 * 60 * 1000;
// A review plan can still be open in a session. Only day-old scratch goes.
const SCRATCH_MAX_AGE_MS = 24 * 60 * 60 * 1000;

function measure(dir) {
  let bytes = 0;
  let newest = 0;
  const walk = (d) => {
    let entries;
    try {
      entries = readdirSync(d, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      const p = join(d, entry.name);
      if (entry.isDirectory()) walk(p);
      else {
        try {
          const stat = statSync(p);
          bytes += stat.size;
          if (stat.mtimeMs > newest) newest = stat.mtimeMs;
        } catch {
          /* raced with another process */
        }
      }
    }
  };
  walk(dir);
  return { bytes, newest };
}

function mb(bytes) {
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

const local = process.env.LOCALAPPDATA || join(homedir(), "AppData", "Local");
const roaming = process.env.APPDATA || join(homedir(), "AppData", "Roaming");
const worktreeRoot = process.env.OPENCODE_WORKTREE_ROOT || "F:\\worktrees";

// Only package-manager caches: rebuilt on the next install, and nothing a
// running OpenCode session reads from.
const caches = [
  ["npm cache", join(local, "npm-cache")],
  ["npm cache (roaming)", join(roaming, "npm-cache")],
  ["yarn cache", join(local, "Yarn", "Cache")],
  ["pnpm store", join(local, "pnpm", "store")],
  ["pip cache", join(local, "pip", "Cache")],
  ["uv cache", join(local, "uv", "cache")],
];

let total = 0;
const rows = [];
for (const [label, path] of caches) {
  if (!existsSync(path)) continue;
  const { bytes, newest } = measure(path);
  total += bytes;
  const inUse = Date.now() - newest < IN_USE_WINDOW_MS;
  rows.push({ label, path, bytes, inUse });
}

// Report review scratch, and delete only entries that are more than a day old.
const scratchRoot = join(tmpdir(), "opencode-code-review");
const scratch = [];
if (existsSync(scratchRoot)) {
  for (const entry of readdirSync(scratchRoot, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    const path = join(scratchRoot, entry.name);
    const { bytes, newest } = measure(path);
    let mtime = newest;
    try {
      mtime = Math.max(mtime, statSync(path).mtimeMs);
    } catch {
      continue;
    }
    const old = Date.now() - mtime > SCRATCH_MAX_AGE_MS;
    total += bytes;
    scratch.push({ label: `review scratch ${entry.name}`, path, bytes, inUse: !old });
  }
}
// The `post-` scratch dirs live beside it, as `<tmp>/opencode-code-review-post-*`.
for (const entry of readdirSync(tmpdir(), { withFileTypes: true })) {
  if (!entry.isDirectory() || !entry.name.startsWith("opencode-code-review-post-")) continue;
  const path = join(tmpdir(), entry.name);
  const { bytes, newest } = measure(path);
  let mtime = newest;
  try {
    mtime = Math.max(mtime, statSync(path).mtimeMs);
  } catch {
    continue;
  }
  const old = Date.now() - mtime > SCRATCH_MAX_AGE_MS;
  total += bytes;
  scratch.push({ label: `review scratch ${entry.name}`, path, bytes, inUse: !old });
}

// Worktree node_modules are reported only. A live session may be running a dev
// server or tests out of one, and there is no reliable way to tell from here.
const worktrees = [];
if (existsSync(worktreeRoot)) {
  for (const repo of readdirSync(worktreeRoot, { withFileTypes: true })) {
    if (!repo.isDirectory()) continue;
    const repoPath = join(worktreeRoot, repo.name);
    for (const wt of readdirSync(repoPath, { withFileTypes: true })) {
      if (!wt.isDirectory()) continue;
      const nm = join(repoPath, wt.name, "node_modules");
      if (!existsSync(nm)) continue;
      const { bytes } = measure(nm);
      total += bytes;
      worktrees.push({ label: `worktree node_modules ${repo.name}/${wt.name}`, path: nm, bytes });
    }
  }
}

const out = [...rows, ...scratch].sort((a, b) => b.bytes - a.bytes);
console.log(APPLY ? "Reclaiming:" : "Reclaimable (dry run — pass --apply to delete):");
for (const row of out) {
  const note = row.inUse ? "  (in use — skipped)" : "";
  console.log(`  ${mb(row.bytes).padStart(10)}  ${row.label}  ${row.path}${note}`);
}
for (const row of worktrees) {
  console.log(`  ${mb(row.bytes).padStart(10)}  ${row.label}  ${row.path}  (report only)`);
}
console.log(`  ${mb(total).padStart(10)}  total`);

if (!APPLY) {
  console.log("\nNothing was deleted.");
  process.exit(0);
}

// Never delete the plugin install tree. This is a correctness guard, not a
// missing feature: see the header.
const protectedRoots = [join(homedir(), ".cache", "opencode")];

let freed = 0;
for (const row of out) {
  if (row.inUse) {
    console.log(`  skipped ${row.path} (in use)`);
    continue;
  }
  if (protectedRoots.some((root) => row.path === root || row.path.startsWith(root + "\\") || row.path.startsWith(root + "/"))) {
    console.log(`  skipped ${row.path} (plugin install tree)`);
    continue;
  }
  try {
    rmSync(row.path, { recursive: true, force: true });
    freed += row.bytes;
  } catch (error) {
    console.error(`  could not remove ${row.path}: ${error.message}`);
  }
}
console.log(`\nFreed ${mb(freed)}. Caches rebuild on demand; the next install re-downloads.`);
console.log("Worktree node_modules were left alone; remove them yourself once no session uses them.");
