// Shared helpers for the code-review scripts.
// Node 18+. No dependencies. Cross platform: every git call is execFileSync
// with an argument array, never a shell string.

import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join, resolve } from "node:path";

export function run(cmd, args, cwd, opts = {}) {
  return execFileSync(cmd, args, {
    cwd,
    encoding: "utf8",
    maxBuffer: 256 * 1024 * 1024,
    stdio: ["ignore", "pipe", "pipe"],
    ...opts,
  });
}

export function git(args, cwd, opts = {}) {
  return run("git", args, cwd, opts);
}

export function tryGit(args, cwd) {
  try {
    return git(args, cwd).trim();
  } catch {
    return null;
  }
}

export function readJson(path, fallback = null) {
  try {
    // Strip a UTF-8 BOM: PowerShell and some editors add one and JSON.parse
    // rejects it.
    return JSON.parse(readFileSync(path, "utf8").replace(/^\uFEFF/, ""));
  } catch {
    return fallback;
  }
}

// Merge the global and project review config, project wins. Only the keys the
// code-review skill understands are read; the same file configures the
// opencode-review plugin, so unknown keys are left alone.
export function loadReviewConfig(projectDir) {
  const globalPath = join(homedir(), ".config", "opencode", "review.json");
  const projectPath = join(projectDir, ".opencode", "review.json");
  const merged = {
    ...(readJson(globalPath, {}) || {}),
    ...(readJson(projectPath, {}) || {}),
  };
  return merged;
}

export function gitDir(cwd) {
  const abs = tryGit(["rev-parse", "--absolute-git-dir"], cwd);
  return abs ? resolve(abs) : null;
}

// Token estimate that is deliberately pessimistic. A 40k-token chunk that is
// really 30k leaves room for the rubric, the file reads, and the output.
export function estimateDiffTokens(added, removed) {
  return Math.ceil((added + removed) * 9 + 120);
}

export function estimateTextTokens(text) {
  return Math.ceil(text.length / 4);
}

const SKIP = [
  { reason: "lockfile", re: /(^|\/)(package-lock\.json|npm-shrinkwrap\.json|pnpm-lock\.yaml|yarn\.lock|bun\.lockb?|Cargo\.lock|poetry\.lock|Pipfile\.lock|composer\.lock|go\.sum|Gemfile\.lock|uv\.lock|mix\.lock)$/i },
  { reason: "generated", re: /(^|\/)(dist|build|out|coverage|\.next|\.nuxt|\.svelte-kit|\.turbo|\.vercel|vendor|node_modules|\.cache|__pycache__)\//i },
  { reason: "generated", re: /\.(min\.js|min\.css|map)$/i },
  { reason: "snapshot", re: /(^|\/)(__snapshots__\/|.*\.snap$)/i },
  { reason: "binary", re: /\.(png|jpe?g|gif|webp|avif|ico|bmp|tiff?|woff2?|ttf|otf|eot|pdf|zip|gz|tgz|7z|rar|mp4|mov|avi|webm|mp3|wav|flac|exe|dll|so|dylib|wasm|bin|pyc|class|jar|jar\.sha1)$/i },
  { reason: "vendored", re: /(^|\/)(third_party|third-party|extern|external)\//i },
];

// Decode a git C-quoted path (for example `"caf\303\251.md"`) into the real
// path. git quotes a path when it contains a byte outside printable ASCII, a
// control character, a double quote, or a backslash; the escaping is C style
// (`\nnn` octal bytes plus the usual one-letter escapes). A path that is not
// quoted -- or a raw name that merely starts and ends with a quote -- is
// returned unchanged.
export function decodeGitQuotedPath(path) {
  const text = String(path ?? "");
  if (text.length < 2 || !text.startsWith('"') || !text.endsWith('"')) return text;
  const inner = text.slice(1, -1);
  // git only quotes when quoting is needed, so a quoted path always carries at
  // least one escape. Without one this is a raw name with literal quotes.
  if (!inner.includes("\\")) return text;
  const bytes = [];
  const simple = { a: 0x07, b: 0x08, f: 0x0c, n: 0x0a, r: 0x0d, t: 0x09, v: 0x0b, "\\": 0x5c, '"': 0x22 };
  for (let i = 0; i < inner.length; i += 1) {
    const ch = inner[i];
    if (ch !== "\\") {
      bytes.push(...Buffer.from(ch, "utf8"));
      continue;
    }
    const next = inner[i + 1];
    if (next === undefined) {
      bytes.push(0x5c);
      break;
    }
    const octal = inner.slice(i + 1, i + 4);
    if (/^[0-7]{3}$/.test(octal)) {
      bytes.push(Number.parseInt(octal, 8));
      i += 3;
      continue;
    }
    if (simple[next] !== undefined) {
      bytes.push(simple[next]);
      i += 1;
      continue;
    }
    bytes.push(0x5c);
  }
  return Buffer.from(bytes).toString("utf8");
}

export function classify(path) {
  const normalized = path.replace(/\\/g, "/");
  for (const rule of SKIP) {
    if (rule.re.test(normalized)) return { skip: true, reason: rule.reason };
  }
  if (/(^|\/)(docs?|documentation)\//i.test(normalized) || /\.(md|mdx|txt|adoc)$/i.test(normalized)) {
    return { skip: false, kind: "docs" };
  }
  if (/(^|\/)(test|tests|__tests__|spec|specs)\//i.test(normalized) || /\.(test|spec)\.[a-z0-9]+$/i.test(normalized)) {
    return { skip: false, kind: "test" };
  }
  if (/(^|\/)(\.github\/workflows|\.gitlab-ci|Dockerfile|docker-compose)/i.test(normalized)) {
    return { skip: false, kind: "infra" };
  }
  return { skip: false, kind: "source" };
}

// Parse a unified diff into the set of added line numbers per file, plus
// per-file counts. Handles new files, renames, and binary stubs.
export function parseDiff(text) {
  const files = new Map();
  let current = null;
  let newLine = 0;
  const lines = text.split("\n");
  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i];
    if (line.startsWith("diff --git ")) {
      current = null;
      newLine = 0;
      continue;
    }
    if (line.startsWith("+++ ")) {
      const raw = decodeGitQuotedPath(line.slice(4).trim());
      if (raw === "/dev/null") {
        current = null;
        continue;
      }
      const file = raw.replace(/^b\//, "");
      if (!files.has(file)) files.set(file, { added: new Set(), removed: 0 });
      current = files.get(file);
      continue;
    }
    if (line.startsWith("@@")) {
      const m = /^@@ -\d+(?:,\d+)? \+(\d+)(?:,(\d+))? @@/.exec(line);
      if (m) newLine = Number.parseInt(m[1], 10) || 1;
      continue;
    }
    if (!current) continue;
    if (line.startsWith("+")) {
      current.added.add(newLine);
      newLine += 1;
    } else if (line.startsWith("-")) {
      current.removed += 1;
    } else if (line.startsWith(" ")) {
      newLine += 1;
    }
  }
  return files;
}

export function isBinaryPath(path) {
  return /\.(png|jpe?g|gif|webp|avif|ico|bmp|tiff?|woff2?|ttf|otf|eot|pdf|zip|gz|tgz|7z|rar|mp4|mov|avi|webm|mp3|wav|flac|exe|dll|so|dylib|wasm|bin|pyc|class|jar)$/i.test(path);
}

export function exists(path) {
  return existsSync(path);
}

export function isoDay(date = new Date()) {
  return date.toISOString().slice(0, 10);
}

export function shortSha(sha) {
  return String(sha || "").slice(0, 8);
}

// Remove secrets from free text. Applied by reconcile-review.mjs before the
// report is written to disk and by post-review.mjs before anything is posted
// to a pull request, so no secret quoted in a finding leaves the machine.
export function redact(text) {
  return text
    .replace(/-----BEGIN [A-Z ]*PRIVATE KEY-----[\s\S]*?-----END [A-Z ]*PRIVATE KEY-----/g, "[redacted private key]")
    .replace(/\b(sk-[A-Za-z0-9_-]{16,}|ghp_[A-Za-z0-9]{20,}|github_pat_[A-Za-z0-9_]{20,}|xox[baprs]-[A-Za-z0-9-]{10,}|AKIA[0-9A-Z]{16})\b/g, "[redacted token]")
    .replace(/\beyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\b/g, "[redacted jwt]")
    .replace(/(KODUS_TEAM_KEY\s*=\s*)\S+/g, "$1[redacted]")
    .replace(/((?:api[_-]?key|secret|password|token)\s*[:=]\s*["']?)[^\s"']{12,}/gi, "$1[redacted]");
}

export const SEVERITY_RANK = { blocker: 0, major: 1, minor: 2, nit: 3 };

export function normalizeSeverity(value) {
  const v = String(value || "").toLowerCase();
  if (v === "critical" || v === "blocker" || v === "high") return "blocker";
  if (v === "major" || v === "error" || v === "medium") return "major";
  if (v === "minor" || v === "warning" || v === "low") return "minor";
  if (v === "nit" || v === "info" || v === "style") return "nit";
  return "major";
}
