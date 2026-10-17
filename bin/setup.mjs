#!/usr/bin/env node
// One-command opencode setup: MCPs, plugins, skills, AGENTS.md, commands, CLIs.
// Usage on a fresh machine (after `npm publish`, or via git):
//   npx development-base            # full install
//   npx development-base --dry-run  # print what would happen
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, copyFileSync, cpSync, rmSync, readFileSync, writeFileSync, readdirSync } from "node:fs";
import { homedir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const DRY = process.argv.includes("--dry-run");
const REPO = join(dirname(fileURLToPath(import.meta.url)), "..");
const TARGET =
  process.env.OPENCODE_CONFIG_HOME ||
  join(homedir(), ".config", "opencode");
const SKILLS_DIR = join(homedir(), ".agents", "skills");

const log = (m) => console.log(m);
// Windows .cmd/.ps1 shims (npx, npm, kodus) need a shell to spawn.
const SHELL = process.platform === "win32";
const run = (cmd, args, opts = {}) => {
  log(`$ ${cmd} ${args.join(" ")}`);
  if (!DRY) execFileSync(cmd, args, { stdio: "inherit", shell: SHELL, ...opts });
};
const has = (cmd) => {
  try {
    execFileSync(cmd, ["--version"], { stdio: "ignore", shell: SHELL });
    return true;
  } catch {
    return false;
  }
};

// ------------------------------------------------------- node runtime probe
// The repo config pins an absolute Node exe + absolute CLI script for `rea`,
// because `npx` resolves whatever `node` is first on PATH and a machine-wide
// downgrade (e.g. to Node 18) crashes rea-agents with "does not provide an
// export named 'styleText'" (needs Node >= 20.12). So resolve at install
// time: newest nvm runtime, else the system-wide install, else this
// process's own runtime. Anything below the floor is rejected outright — a
// Node 18 path must never be written to the config.
const NODE_MIN = [20, 12, 0];
const verParts = (v) => String(v).trim().replace(/^v/, "").split(/[.+-]/).map((n) => Number.parseInt(n, 10) || 0);
const verCmp = (a, b) => {
  const x = typeof a === "string" ? verParts(a) : a;
  const y = typeof b === "string" ? verParts(b) : b;
  for (let i = 0; i < Math.max(x.length, y.length); i++) {
    const d = (x[i] || 0) - (y[i] || 0);
    if (d) return d;
  }
  return 0;
};
const nodeCandidates = () => {
  const found = [];
  const add = (exe) => {
    if (!exe || !existsSync(exe) || found.some((c) => c.exe === exe)) return;
    try {
      // --version on the exe itself: a node that cannot report its version
      // is not a runtime we can trust to spawn.
      const ver = execFileSync(exe, ["--version"], { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }).trim();
      if (ver) found.push({ exe, ver });
    } catch {
      // not a working node — ignore
    }
  };
  // nvm-for-windows: %LOCALAPPDATA%\nvm\v<major>.<minor>.<patch>\node.exe
  const localAppData = process.env.LOCALAPPDATA || join(homedir(), "AppData", "Local");
  const nvmRoot = join(localAppData, "nvm");
  if (existsSync(nvmRoot)) {
    for (const entry of readdirSync(nvmRoot, { withFileTypes: true })) {
      if (entry.isDirectory()) add(join(nvmRoot, entry.name, "node.exe"));
    }
  }
  // System-wide install, then the runtime running this installer.
  add(join(process.env.ProgramFiles || "C:\\Program Files", "nodejs", "node.exe"));
  add(process.execPath);
  return found.sort((a, b) => verCmp(b.ver, a.ver));
};
// ----------------------------------------------------------- jsonc tolerant
// config/opencode.jsonc is JSONC (block/line comments, trailing commas), so
// JSON.parse throws on the copy this script just installed. Strip comments
// and trailing commas outside of strings, then parse.
const parseJsonc = (text) => {
  let out = "";
  let inStr = false;
  let esc = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    const next = text[i + 1];
    if (esc) {
      out += c;
      esc = false;
      continue;
    }
    if (c === "\\" && inStr) {
      out += c;
      esc = true;
      continue;
    }
    if (c === '"') {
      inStr = !inStr;
      out += c;
      continue;
    }
    if (!inStr && c === "/" && next === "/") {
      while (i < text.length && text[i] !== "\n") i++;
      out += "\n";
      continue;
    }
    if (!inStr && c === "/" && next === "*") {
      i += 2;
      while (i < text.length && !(text[i] === "*" && text[i + 1] === "/")) i++;
      i++;
      continue;
    }
    if (!inStr && c === ",") {
      // drop a comma that only precedes a closing bracket
      let j = i + 1;
      while (j < text.length && /\s/.test(text[j])) j++;
      if (text[j] === "}" || text[j] === "]") continue;
    }
    out += c;
  }
  return JSON.parse(out);
};

// --------------------------------------------------- jsonc surgical rewrite
// opencode.jsonc is JSONC, so the two MCP repoints below must never round-trip
// it through JSON.parse/JSON.stringify: JSON.parse throws on its comments (the
// repoint silently no-ops behind a `warn`), and a stringify rewrite deletes
// every comment the user wrote — including the `rea` entry's rationale. So
// rewrite ONLY the `"command": [ ... ]` array text, leaving the rest of the
// bytes (comments, blank lines, indentation, EOL style) untouched.
const escRe = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const replaceMcpCommand = (cfgPath, key, nextArgs) => {
  const raw = readFileSync(cfgPath, "utf8");
  // Anchor on the exact quoted key first (`"key"\s*:\s*\{`) so a key that is a
  // prefix of another (`rea` vs `rea-agents`) or a mention in prose cannot
  // match. `[^{}]*?` then walks to the entry's own `"command": [...]` — safe
  // because MCP entries are flat (no nested braces), and requiring the command
  // array before the closing `}` keeps the match on the right block even if the
  // key also appears in a comment.
  const re = new RegExp(`("${escRe(key)}"\\s*:\\s*\\{[^{}]*?"command"\\s*:\\s*)\\[[^\\]]*\\]`);
  if (!re.test(raw)) throw new Error(`no "${key}.command" array found in ${cfgPath}`);
  // Function replacement (not a "$1..." string) so a `$&`/`$'`-looking segment
  // in a Windows path is copied through verbatim.
  const next = raw.replace(re, (_full, head) => `${head}[${nextArgs.map((a) => JSON.stringify(String(a))).join(", ")}]`);
  // Validate in memory BEFORE writing: the result must still parse, and the
  // entry must carry exactly the array we meant to write. A regex that landed
  // on the wrong block fails here and leaves the file untouched.
  const parsed = parseJsonc(next);
  const cmd = parsed?.mcp?.[key]?.command;
  if (!Array.isArray(cmd) || JSON.stringify(cmd) !== JSON.stringify(nextArgs)) {
    throw new Error(`refusing to write ${cfgPath}: "${key}.command" would be ${JSON.stringify(cmd)}, expected ${JSON.stringify(nextArgs)}`);
  }
  writeFileSync(cfgPath, next);
  return cmd;
};

// ---------------------------------------------------------------- skills
// [repo, skill names] — empty array = whole repo
const SKILLS = [
  ["xirothedev/skills", ["nestjs-best-practices", "nextjs-best-practices", "nextjs-nestjs-integration"]],
  ["prisma/skills", ["prisma-database-setup", "prisma-client-api", "prisma-cli", "prisma-postgres", "prisma-postgres-setup", "prisma-upgrade-v7", "prisma-mongodb-upgrade"]],
  ["Jeffallan/claude-skills", ["api-designer", "architecture-designer", "code-documenter", "code-reviewer", "database-optimizer", "debugging-wizard", "devops-engineer", "feature-forge", "fullstack-guardian", "graphql-architect", "javascript-pro", "kubernetes-specialist", "legacy-modernizer", "mcp-developer", "microservices-architect", "monitoring-expert", "nestjs-expert", "nextjs-developer", "playwright-expert", "postgres-pro", "react-expert", "secure-code-guardian", "security-reviewer", "spec-miner", "terraform-engineer", "test-master", "the-fool", "typescript-pro", "websocket-engineer"]],
  ["microsoft/azure-skills", ["microsoft-foundry"]],
  ["vercel-labs/agent-skills", ["vercel-react-best-practices"]],
  ["michaelshimeles/skills", ["before-and-after", "code-structure", "evidence-driven-testing", "new-feature", "unslop"]],
  ["kodustech/kodus-ai", ["perf-debug"]],
  ["coleam00/excalidraw-diagram-skill", []],
  ["pbakaus/impeccable", []],
  ["emilkowalski/skills", []],
  ["Leonxlnx/taste-skill@design-taste-frontend", []],
  ["shadcn-ui/ui@shadcn", []],
  ["expo/skills", ["expo-overview", "expo-router", "expo-upgrade", "expo-native-ui", "expo-data-fetching", "eas-app-stores", "eas-workflows", "eas-update"]],
  ["nodnarbnitram/claude-code-extensions", ["tauri-v2"]],
  ["morluto/rea", ["reverse-engineer-anything", "rea-changelog-update", "rea-ci-tests-audit", "rea-tool-design"]],
];

// ---------------------------------------------------------------- main
log("== 1/6 prerequisites ==");
const need = ["node", "npx", "git"];
const missing = need.filter((c) => !has(c));
if (missing.length) throw new Error(`Missing required tools: ${missing.join(", ")}`);
for (const c of ["gh", "python", "pipx"]) if (!has(c)) log(`  warn: ${c} not found (some steps will be skipped or need manual install)`);
log("  ok");

log("== 2/6 config files ==");
mkdirSync(TARGET, { recursive: true });
mkdirSync(join(TARGET, "commands"), { recursive: true });
mkdirSync(join(TARGET, "plugins"), { recursive: true });
const backup = (p) => {
  if (existsSync(p) && !DRY) copyFileSync(p, `${p}.bak-${Date.now()}`);
};
backup(join(TARGET, "opencode.jsonc"));
backup(join(TARGET, "AGENTS.md"));
const cp = (src, dest) => {
  log(`  copy ${src} -> ${dest}`);
  if (!DRY) {
    if (existsSync(dest)) rmSync(dest, { recursive: true, force: true });
    cpSync(src, dest, { recursive: true });
  }
};
cp(join(REPO, "config", "opencode.jsonc"), join(TARGET, "opencode.jsonc"));
cp(join(REPO, "AGENTS.md"), join(TARGET, "AGENTS.md"));
cp(join(REPO, "config", "commands"), join(TARGET, "commands"));
cp(join(REPO, "config", "plugins", "opencode-review"), join(TARGET, "plugins", "opencode-review"));
cp(join(REPO, "config", "plugins", "opencode-dcp"), join(TARGET, "plugins", "opencode-dcp"));
cp(join(REPO, "config", "plugins", "opencode-github-release"), join(TARGET, "plugins", "opencode-github-release"));
cp(join(REPO, "config", "plugins", "opencode-telemetry"), join(TARGET, "plugins", "opencode-telemetry"));
cp(join(REPO, "config", "plugins", "envsitter-guard"), join(TARGET, "plugins", "envsitter-guard"));
cp(join(REPO, "config", "plugins", "opencode-log-sanitizer"), join(TARGET, "plugins", "opencode-log-sanitizer"));
cp(join(REPO, "config", "plugins", "opencode-command-inject"), join(TARGET, "plugins", "opencode-command-inject"));
cp(join(REPO, "config", "plugins", "opencode-ralph-wiggum"), join(TARGET, "plugins", "opencode-ralph-wiggum"));
// Copy .env.example as a starter template only — never overwrite an existing
// (possibly filled-in) .env.example in TARGET.
const envExampleDest = join(TARGET, ".env.example");
if (!existsSync(envExampleDest)) {
  cp(join(REPO, "config", ".env.example"), envExampleDest);
} else {
  log(`  skip ${envExampleDest} (already exists — not overwriting filled template)`);
}
// Slim plugin config: setDefaultAgent=false so sessions keep the native
// default agent. Slim otherwise stamps orchestrator as default, and during
// multi-project restore sessions drain before the per-directory agent draft
// is ready and die with `Agent not found: "orchestrator"`. Copy-if-missing
// only — never overwrite a user-tuned config.
const slimCfgDest = join(TARGET, "oh-my-opencode-slim.jsonc");
if (!existsSync(slimCfgDest)) {
  cp(join(REPO, "config", "oh-my-opencode-slim.jsonc"), slimCfgDest);
} else {
  log(`  skip ${slimCfgDest} (already exists — not overwriting user config)`);
}

log("== 3/6 local plugin deps (review, dcp + 6 ports) ==");
run("npm", ["install", "--prefix", join(TARGET, "plugins", "opencode-review"), "@opencode-ai/plugin"]);
// opencode-dcp is a vendored npm tree (deps pinned in its package.json):
// production-only install. --legacy-peer-deps works around an upstream
// dev-tree conflict (dev @opencode/plugin wants @opentui/core >=0.5.14
// while the package pins ^0.4.5); --omit=dev keeps the 0.4.x runtime the
// TUI entry was built against. No version upgrades beyond the pins.
run("npm", ["install", "--prefix", join(TARGET, "plugins", "opencode-dcp"), "--omit=dev", "--legacy-peer-deps", "--no-audit", "--no-fund"]);
// Ported plugins (deps pinned in each package.json) — same production flags.
for (const name of ["opencode-github-release", "opencode-telemetry", "envsitter-guard", "opencode-log-sanitizer", "opencode-command-inject", "opencode-ralph-wiggum"]) {
  run("npm", ["install", "--prefix", join(TARGET, "plugins", name), "--omit=dev", "--legacy-peer-deps", "--no-audit", "--no-fund"]);
}
// Central fallback dep: the Bun loader walks bare imports up to
// TARGET/node_modules, so the central copy must expose ./v2/promise
// (>=1.18.29). Merge into TARGET/package.json (never overwrite other keys),
// then install. Without this, path plugins fall back to a stale central
// copy and fail with "Cannot find package".
const centralPkgPath = join(TARGET, "package.json");
let centralPkg = {};
if (existsSync(centralPkgPath)) {
  centralPkg = JSON.parse(readFileSync(centralPkgPath, "utf8"));
}
centralPkg.dependencies = { ...(centralPkg.dependencies || {}), "@opencode-ai/plugin": "^1.19.1" };
if (!DRY) writeFileSync(centralPkgPath, JSON.stringify(centralPkg, null, 2) + "\n");
else log(`  write ${centralPkgPath} (merge @opencode-ai/plugin into dependencies)`);
run("npm", ["install", "--prefix", TARGET, "--no-audit", "--no-fund"]);

log("== 4/6 skills (global, agent=opencode) ==");
mkdirSync(SKILLS_DIR, { recursive: true });
for (const [repo, skills] of SKILLS) {
  const args = ["-y", "skills", "add", repo];
  for (const s of skills) args.push("-s", s);
  args.push("-a", "opencode", "-g", "-y");
  run("npx", args);
}
// Vendored local/workflow skills (skills/ in this repo) — cannot be installed
// via `skills add`, copied verbatim. Overwrite is correct (versioned content,
// unlike .env.example above).
const VENDORED_SKILLS = ["architect", "audit", "check", "debug", "design-system", "develop", "document", "kodus-review", "living-docs", "opencode-github", "pr-agent", "scope", "ship", "sync", "test", "write-swift"];
for (const name of VENDORED_SKILLS) {
  const src = join(REPO, "skills", name);
  const dest = join(SKILLS_DIR, name);
  if (!existsSync(src)) {
    log(`  skip skills/${name} (not in repo skills/)`);
    continue;
  }
  log(`  copy skills/${name} -> ${dest}`);
  if (!DRY) {
    if (existsSync(dest)) rmSync(dest, { recursive: true, force: true });
    cpSync(src, dest, { recursive: true });
  }
}

log("== 5/6 CLIs ==");
run("npm", ["install", "-g", "@kodus/cli"]);
if (has("python")) {
  run("python", ["-m", "pip", "install", "redis-mcp-server"]);
  // The repo's redis MCP entry points at the author's exe path — repoint it
  // at this machine's install (pip Scripts dir differs per user/machine).
  if (!DRY) {
    try {
      const scripts = execFileSync("python", ["-c", "import sysconfig; print(sysconfig.get_path('scripts'))"], { encoding: "utf8" }).trim();
      const exe = join(scripts, "redis-mcp-server.exe");
      const cfgPath = join(TARGET, "opencode.jsonc");
      // JSONC-aware: JSON.parse throws on this file's comments, and a
      // JSON.stringify round-trip would strip them.
      replaceMcpCommand(cfgPath, "redis", [exe, "--url", "{env:REDIS_URL}"]);
      log(`  redis MCP -> ${exe}`);
    } catch (e) {
      log(`  warn: could not repoint redis MCP (${e.message})`);
    }
  } else {
    log("  [dry-run] would repoint redis MCP at this machine's pip Scripts dir");
  }
} else log("  skip: redis-mcp-server (no python)");

// The repo's rea entry points at the author's nvm dir + CLI script — repoint
// it at this machine's install (both are absolute, neither is portable). Same
// pattern as the redis repoint above; the version is pinned, and both repoints
// rewrite only the `"command": [...]` array in place, so the user's comments
// (and this entry's own rationale) survive the install.
const REA_PKG = "rea-agents@6.5.0";
const REA_DIR = join(TARGET, "tools", "rea-agents");
const REA_CLI = join(REA_DIR, "node_modules", "rea-agents", "scripts", "rea.mjs");
run("npm", ["install", "--prefix", REA_DIR, "--no-audit", "--no-fund", REA_PKG]);
if (DRY) {
  log("  [dry-run] would repoint rea MCP at this machine's newest Node >= 20.12 + the installed rea.mjs");
} else if (!existsSync(REA_CLI)) {
  log(`  warn: ${REA_CLI} missing after install — rea MCP left at the repo's absolute paths`);
} else {
  try {
    const cfgPath = join(TARGET, "opencode.jsonc");
    const cfg = parseJsonc(readFileSync(cfgPath, "utf8"));
    const cands = nodeCandidates();
    const picked = cands.find((c) => verCmp(c.ver, NODE_MIN) >= 0);
    if (!cfg?.mcp?.rea) throw new Error(`no mcp.rea entry in ${cfgPath}`);
    // Never write a too-old runtime: a Node 18 exe makes rea-agents@6.5.0
    // crash on `styleText`, which is worse than an unrepointed entry.
    if (!picked) {
      throw new Error(`no Node >= ${NODE_MIN.join(".")} found (candidates: ${cands.map((c) => `${c.exe} -> ${c.ver}`).join(", ") || "none"}) — install Node >= ${NODE_MIN.join(".")} and rerun, rea MCP left untouched`);
    }
    replaceMcpCommand(cfgPath, "rea", [picked.exe, REA_CLI, "mcp"]);
    log(`  rea MCP -> ${picked.exe} (${picked.ver}) + ${REA_CLI}`);
  } catch (e) {
    log(`  warn: could not repoint rea MCP (${e.message})`);
  }
}

log("== 6/6 manual steps (cannot be automated) ==");
log(`
  1. Auth:  kodus auth login   (or export KODUS_TEAM_KEY)
            gh auth login
  2. Env (copy config/.env.example to .env in the opencode config dir, then fill values):
      CONTEXT7_API_KEY, SENTRY_ACCESS_TOKEN,
      GOOGLE_APPLICATION_CREDENTIALS, GOOGLE_PROJECT_ID, DATABASE_URL,
      MDB_MCP_CONNECTION_STRING, REDIS_URL, OPENCODE_ZEN_API_KEY,
      KODUS_TEAM_KEY (or: kodus auth login)
  3. Cluster: configure kubeconfig for the kubernetes MCP.
  4. Restart opencode (config is loaded once at startup).
  5. Per repo: run /pr-agent-setup once (adds PR-Agent Action; set OPENAI_KEY secret).
`);
log(DRY ? "DRY RUN — nothing executed." : "Done.");
