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

log("== 3/6 local plugin deps (opencode-review) ==");
run("npm", ["install", "--prefix", join(TARGET, "plugins", "opencode-review"), "@opencode-ai/plugin"]);

log("== 4/6 skills (global, agent=opencode) ==");
mkdirSync(SKILLS_DIR, { recursive: true });
for (const [repo, skills] of SKILLS) {
  const args = ["-y", "skills", "add", repo];
  for (const s of skills) args.push("-s", s);
  args.push("-a", "opencode", "-g", "-y");
  run("npx", args);
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
  2. Env (see config/.env.example): CONTEXT7_API_KEY, SENTRY_ACCESS_TOKEN,
     GOOGLE_APPLICATION_CREDENTIALS, GOOGLE_PROJECT_ID, DATABASE_URL,
     MDB_MCP_CONNECTION_STRING, REDIS_URL
  3. Cluster: configure kubeconfig for the kubernetes MCP.
  4. Restart opencode (config is loaded once at startup).
  5. Per repo: run /pr-agent-setup once (adds PR-Agent Action; set OPENAI_KEY secret).
`);
log(DRY ? "DRY RUN — nothing executed." : "Done.");
