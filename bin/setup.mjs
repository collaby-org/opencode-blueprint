#!/usr/bin/env node
// One-command opencode setup: MCPs, plugins, skills, AGENTS.md, commands, CLIs.
// Usage on a fresh machine (after `npm publish`, or via git):
//   npx development-base            # full install
//   npx development-base --dry-run  # print what would happen
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, copyFileSync, cpSync, rmSync, readFileSync, writeFileSync } from "node:fs";
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
      const cfg = JSON.parse(readFileSync(cfgPath, "utf8"));
      if (cfg?.mcp?.redis) {
        cfg.mcp.redis.command = [exe, "--url", "{env:REDIS_URL}"];
        writeFileSync(cfgPath, JSON.stringify(cfg, null, 2));
        log(`  redis MCP -> ${exe}`);
      }
    } catch (e) {
      log(`  warn: could not repoint redis MCP (${e.message})`);
    }
  } else {
    log("  [dry-run] would repoint redis MCP at this machine's pip Scripts dir");
  }
} else log("  skip: redis-mcp-server (no python)");

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
