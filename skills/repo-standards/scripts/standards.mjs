#!/usr/bin/env node
// Repo standards: check and scaffold the files every repository needs.
// Zero dependencies, Node 20+, Windows and POSIX paths.
//
//   node standards.mjs --check [dir]
//   node standards.mjs --apply [dir] [--with-agents] [options]
//   node standards.mjs --force <relative-path> [dir] [options]
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { basename, dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const TEMPLATES = resolve(HERE, "..", "templates");
const CONFIG_DIR = process.env.OPENCODE_CONFIG_DIR || join(homedir(), ".config", "opencode");
const GLOBAL_AGENTS = join(CONFIG_DIR, "AGENTS.md");

// The required set. AGENTS.md is copied from the global config, never from
// templates: a scaffolded copy would drift from the source of truth.
const REQUIRED = [
  "AGENTS.md",
  "CONTRIBUTING.md",
  "CLAUDE.md",
  ".github/pull_request_template.md",
  ".github/ISSUE_TEMPLATE/bug_report.yml",
  ".github/ISSUE_TEMPLATE/feature_request.yml",
  ".github/ISSUE_TEMPLATE/documentation.yml",
  ".github/ISSUE_TEMPLATE/config.yml",
  ".github/CODEOWNERS",
  ".github/dependabot.yml",
  ".github/SECURITY.md",
  ".github/workflows/ci.yml",
  ".github/workflows/secret-scan.yml",
];

const TEMPLATE_FILES = [
  "CONTRIBUTING.md",
  "CLAUDE.md",
  ".github/pull_request_template.md",
  ".github/ISSUE_TEMPLATE/bug_report.yml",
  ".github/ISSUE_TEMPLATE/feature_request.yml",
  ".github/ISSUE_TEMPLATE/documentation.yml",
  ".github/ISSUE_TEMPLATE/config.yml",
  ".github/CODEOWNERS",
  ".github/dependabot.yml",
  ".github/SECURITY.md",
  ".github/WORKFLOWS.md",
  ".github/workflows/secret-scan.yml",
];

const PLACEHOLDERS = [
  "PROJECT_NAME",
  "OWNER",
  "DEFAULT_BRANCH",
  "STACK",
  "NODE_VERSION",
  "INSTALL_CMD",
  "LINT_CMD",
  "TEST_CMD",
  "BUILD_CMD",
  "SECURITY_CONTACT",
  "VERSION_FILE",
];

const USAGE = `repo-standards: check and scaffold the baseline every repository needs.

Usage:
  standards.mjs --check [dir]
  standards.mjs --apply [dir] [options]
  standards.mjs --force <relative-path> [dir] [options]

Commands:
  --check              Verify every required file. Exit 1 when one is missing or invalid.
  --apply              Copy only missing files from templates, then run --check.
  --force <path>       Overwrite one scaffolded file explicitly (relative to the repo).
                       Implies --apply for that file only.

Options:
  --dry-run            Print what would change. Write nothing.
  --stack <stack>      node (default), php, or generic. Picks the CI template.
  --name <name>        Project name. Detected from package.json, composer.json, or git.
  --owner <owner>      GitHub user or org. Detected from the package scope or git remote.
  --branch <branch>    Default branch. Default: main.
  --security-contact <value>  Private disclosure contact. Detected from manifests.
  --with-agents        Copy the global AGENTS.md when missing. Use it only after the
                       user explicitly authorizes that copy in the same task.
  -h, --help           Show this message.
`;

const log = (line = "") => console.log(line);

function fail(message, code = 1) {
  console.error(`error: ${message}`);
  process.exit(code);
}

function parseArgs(argv) {
  const opts = {
    mode: null,
    dir: null,
    dryRun: false,
    stack: "node",
    force: null,
    withAgents: false,
    name: "",
    owner: "",
    branch: "main",
    securityContact: "",
  };
  let forceOnly = false;
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === "--check" || arg === "--apply") {
      const mode = arg.slice(2);
      if (opts.mode && opts.mode !== mode) fail("choose either --check or --apply, not both", 2);
      opts.mode = mode;
    } else if (arg === "--dry-run") {
      opts.dryRun = true;
    } else if (arg === "--with-agents") {
      opts.withAgents = true;
    } else if (arg === "--help" || arg === "-h") {
      log(USAGE);
      process.exit(0);
    } else if (["--stack", "--name", "--owner", "--branch", "--security-contact", "--force"].includes(arg)) {
      const value = argv[++i];
      if (!value || value.startsWith("--")) fail(`${arg} needs a value`, 2);
      if (arg === "--stack") {
        if (!["node", "php", "generic"].includes(value)) fail("--stack must be node, php, or generic", 2);
        opts.stack = value;
      } else if (arg === "--force") {
        opts.force = value.replace(/\\/g, "/").replace(/^\.\//, "");
        forceOnly = true;
      } else if (arg === "--name") opts.name = value;
      else if (arg === "--owner") opts.owner = value.replace(/^@/, "");
      else if (arg === "--branch") opts.branch = value;
      else opts.securityContact = value;
    } else if (arg.startsWith("--")) {
      fail(`unknown option ${arg}`, 2);
    } else {
      if (opts.dir) fail("only one directory may be given", 2);
      opts.dir = arg;
    }
  }
  if (!opts.mode && !forceOnly) fail("choose --check or --apply (or --force <path>)", 2);
  if (forceOnly && opts.mode === "check") fail("--force cannot be combined with --check", 2);
  if (forceOnly) {
    opts.mode = "apply";
    opts.forceOnly = true;
  }
  if (opts.withAgents && opts.mode !== "apply") fail("--with-agents only applies to --apply", 2);
  return opts;
}

function readJson(path) {
  try {
    return JSON.parse(readFileSync(path, "utf8"));
  } catch {
    return null;
  }
}

function readText(path) {
  return readFileSync(path, "utf8");
}

function sha256(path) {
  return createHash("sha256").update(readFileSync(path)).digest("hex");
}

function sha256Normalized(path) {
  return createHash("sha256").update(readFileSync(path, "utf8").replace(/\r\n/g, "\n")).digest("hex");
}

function git(dir, args) {
  try {
    return execFileSync("git", ["-C", dir, ...args], {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    }).trim();
  } catch {
    return "";
  }
}

function remoteUrl(dir) {
  return git(dir, ["remote", "get-url", "origin"]);
}

function splitRemote(url) {
  const cleaned = url.replace(/\.git$/, "").replace(/\/+$/, "");
  const match =
    cleaned.match(/^[^@]+@[^:]+:(.+)$/) ||
    cleaned.match(/^ssh:\/\/[^/]+\/(.+)$/) ||
    cleaned.match(/^https?:\/\/[^/]+\/(.+)$/);
  if (!match) return { owner: "", repo: "" };
  const parts = match[1].split("/").filter(Boolean);
  if (parts.length < 2) return { owner: "", repo: "" };
  return { owner: parts[parts.length - 2], repo: parts[parts.length - 1] };
}

function firstEmail(...groups) {
  for (const group of groups) {
    for (const entry of group) {
      if (!entry) continue;
      const text = typeof entry === "string" ? entry : entry.email || "";
      const match = text.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i);
      if (match) return match[0];
    }
  }
  return "";
}

function detect(dir, opts) {
  const pkg = readJson(join(dir, "package.json"));
  const composer = readJson(join(dir, "composer.json"));
  const remote = splitRemote(remoteUrl(dir));
  const manifestName = String(pkg?.name || composer?.name || "");
  const fallbackName = remote.repo || basename(resolve(dir));
  const name = (opts.name || manifestName.replace(/^@[^/]+\//, "") || fallbackName).trim();

  const scopeOwner = manifestName.startsWith("@") ? manifestName.slice(1).split("/")[0] : "";
  const owner = opts.owner || scopeOwner || remote.owner || "TODO: owner";

  const securityContact =
    opts.securityContact ||
    firstEmail(
      pkg?.author ? [pkg.author] : [],
      Array.isArray(pkg?.maintainers) ? pkg.maintainers : [],
      Array.isArray(pkg?.contributors) ? pkg.contributors : [],
      Array.isArray(composer?.authors) ? composer.authors : [],
    ) ||
    "TODO: security contact";

  let nodeVersion = "";
  if (opts.stack === "node") {
    nodeVersion = "22";
    const nvmrc = join(dir, ".nvmrc");
    const fromNvmrc = existsSync(nvmrc) ? readText(nvmrc).trim().replace(/^v/, "") : "";
    if (/^\d+(\.\d+)*$/.test(fromNvmrc)) {
      nodeVersion = fromNvmrc;
    } else {
      const engine = String(pkg?.engines?.node || "");
      const match = engine.match(/(\d+)(?:\.(\d+))?/);
      if (match) nodeVersion = match[2] ? `${match[1]}.${match[2]}` : match[1];
    }
  }

  let install = "";
  let lint = "";
  let test = "";
  let build = "";
  if (opts.stack === "node") {
    const pm = existsSync(join(dir, "pnpm-lock.yaml"))
      ? "pnpm"
      : existsSync(join(dir, "yarn.lock"))
        ? "yarn"
        : existsSync(join(dir, "bun.lockb")) || existsSync(join(dir, "bun.lock"))
          ? "bun"
          : /^pnpm@/.test(String(pkg?.packageManager))
            ? "pnpm"
            : /^yarn@/.test(String(pkg?.packageManager))
              ? "yarn"
              : /^bun@/.test(String(pkg?.packageManager))
                ? "bun"
                : "npm";
    const lock = existsSync(join(dir, "package-lock.json"));
    install =
      pm === "npm"
        ? lock
          ? "npm ci"
          : "npm install"
        : pm === "bun"
          ? "bun install --frozen-lockfile"
          : `${pm} install --frozen-lockfile`;
    const scripts = pkg?.scripts || {};
    if (scripts.lint) lint = pm === "npm" ? "npm run lint" : `${pm} run lint`;
    if (scripts.test && !/no test specified/i.test(String(scripts.test))) {
      test = pm === "npm" ? "npm test" : `${pm} run test`;
    }
    if (scripts.build) build = pm === "npm" ? "npm run build" : `${pm} run build`;
  } else if (opts.stack === "php") {
    const scripts = composer?.scripts || {};
    install = "composer install --no-interaction --prefer-dist";
    if (scripts.lint) lint = "composer lint";
    if (scripts.test) test = "composer test";
    if (scripts.build) build = "composer build";
  } else {
    install = "TODO: install command";
    lint = "TODO: lint command";
    test = "TODO: test command";
    build = "TODO: build command";
  }

  const versionCandidates = ["package.json", "composer.json", "pyproject.toml", "Cargo.toml", "docs/VERSION", "VERSION"];
  let versionFile = versionCandidates.find((candidate) => existsSync(join(dir, candidate))) || "";
  if (!versionFile && existsSync(dir)) {
    versionFile = readdirSync(dir).find((entry) => entry.endsWith(".csproj")) || "";
  }
  if (!versionFile) versionFile = "TODO: version file";

  return {
    PROJECT_NAME: name,
    OWNER: owner,
    DEFAULT_BRANCH: opts.branch,
    STACK: opts.stack,
    NODE_VERSION: nodeVersion,
    INSTALL_CMD: install,
    LINT_CMD: lint,
    TEST_CMD: test,
    BUILD_CMD: build,
    SECURITY_CONTACT: securityContact,
    VERSION_FILE: versionFile,
  };
}

function substitute(text, values) {
  return text
    .replace(/\r\n/g, "\n")
    .replace(/\{\{([A-Z_]+)\}\}/g, (whole, key) => (Object.hasOwn(values, key) ? values[key] : whole));
}

function planFor(stack) {
  const ciSource = stack === "node" ? ".github/workflows/ci.node.yml" : ".github/workflows/ci.generic.yml";
  return [
    ...TEMPLATE_FILES.map((file) => ({ source: file, target: file })),
    { source: ciSource, target: ".github/workflows/ci.yml" },
  ];
}

function checkRepo(dir) {
  const problems = [];
  const notes = [];
  if (!existsSync(dir)) {
    log(`repo standards: ${dir}`);
    log(`  MISSING directory: ${dir} does not exist`);
    log("FAIL: directory not found");
    return false;
  }

  log(`repo standards: ${dir}`);

  for (const rel of REQUIRED) {
    if (!existsSync(join(dir, rel))) problems.push(`MISSING ${rel}`);
  }

  const claude = join(dir, "CLAUDE.md");
  if (existsSync(claude)) {
    const text = readText(claude).replace(/\r\n/g, "\n");
    if (text !== "@AGENTS.md\n") {
      problems.push("INVALID CLAUDE.md: must contain exactly @AGENTS.md and one newline");
    }
  }

  const codeowners = join(dir, ".github/CODEOWNERS");
  if (existsSync(codeowners)) {
    const active = readText(codeowners)
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter((line) => line && !line.startsWith("#"));
    if (active.length === 0) {
      problems.push("INVALID .github/CODEOWNERS: needs at least one active rule line");
    }
  }

  const prTemplate = join(dir, ".github/pull_request_template.md");
  if (existsSync(prTemplate)) {
    const text = readText(prTemplate);
    if (!text.includes("Verification")) {
      problems.push("INVALID .github/pull_request_template.md: missing a Verification section");
    }
    if (!text.includes("version:")) {
      problems.push("INVALID .github/pull_request_template.md: missing a version: line");
    }
  }

  const workflows = join(dir, ".github/workflows");
  if (existsSync(workflows)) {
    for (const name of readdirSync(workflows).filter((entry) => /\.ya?ml$/i.test(entry)).sort()) {
      const lines = readText(join(workflows, name)).split(/\r?\n/);
      lines.forEach((line, index) => {
        const match = line.match(/^\s*(?:-\s*)?uses:\s*["']?([^"'\s#]+)["']?/);
        if (!match) return;
        const ref = match[1];
        if (ref.startsWith("./")) return;
        if (!/@[0-9a-f]{40}$/.test(ref)) {
          problems.push(`INVALID .github/workflows/${name}:${index + 1}: ${ref} is not pinned to a 40 character SHA`);
        }
      });
    }
  }

  const repoAgents = join(dir, "AGENTS.md");
  if (existsSync(GLOBAL_AGENTS)) {
    if (existsSync(repoAgents)) {
      if (sha256(repoAgents) === sha256(GLOBAL_AGENTS)) {
        notes.push(`AGENTS.md sha256 matches ${GLOBAL_AGENTS}`);
      } else if (sha256Normalized(repoAgents) === sha256Normalized(GLOBAL_AGENTS)) {
        notes.push(`AGENTS.md matches ${GLOBAL_AGENTS} (only line endings differ)`);
      } else {
        problems.push(`INVALID AGENTS.md: differs from ${GLOBAL_AGENTS}`);
      }
    }
  } else {
    notes.push(`AGENTS.md hash not checked (no ${GLOBAL_AGENTS})`);
  }

  for (const note of notes) log(`  note: ${note}`);
  for (const problem of problems) log(`  ${problem}`);
  if (problems.length) {
    log(`FAIL: ${problems.length} problem(s) across ${REQUIRED.length} required files`);
    return false;
  }
  log(`OK: all ${REQUIRED.length} required files present and valid`);
  return true;
}

function todoValues(values) {
  return PLACEHOLDERS.filter((key) => String(values[key]).startsWith("TODO:")).map((key) => ({
    key,
    value: values[key],
  }));
}

function applyScaffold(dir, opts) {
  const plan = planFor(opts.stack);
  const values = detect(dir, opts);
  const targets = plan.map((entry) => entry.target);
  const forcePath = opts.force || "";
  if (forcePath && !targets.includes(forcePath)) {
    fail(`--force path is not a scaffolded file: ${forcePath}\nallowed: ${targets.join(", ")}`, 2);
  }

  if (!opts.dryRun) mkdirSync(dir, { recursive: true });
  const created = [];
  const overwritten = [];
  const skipped = [];
  const todos = todoValues(values);

  const entries = opts.forceOnly ? plan.filter((entry) => entry.target === forcePath) : plan;

  for (const entry of entries) {
    const target = join(dir, entry.target);
    const exists = existsSync(target);
    if (exists && entry.target !== forcePath) {
      log(`  skip ${entry.target} (exists)`);
      skipped.push(entry.target);
      continue;
    }
    const source = readFileSync(join(TEMPLATES, entry.source), "utf8");
    const output = substitute(source, values);
    if (opts.dryRun) {
      log(`  would ${exists ? "overwrite" : "create"} ${entry.target}`);
    } else {
      mkdirSync(dirname(target), { recursive: true });
      writeFileSync(target, output, "utf8");
      log(`  ${exists ? "overwrite" : "create"} ${entry.target}`);
    }
    (exists ? overwritten : created).push(entry.target);
  }

  if (!opts.forceOnly) {
    if (existsSync(join(dir, "AGENTS.md"))) {
      log("  skip AGENTS.md (exists, never overwritten)");
      skipped.push("AGENTS.md");
    } else if (opts.withAgents) {
      if (!existsSync(GLOBAL_AGENTS)) {
        fail(`--with-agents was given but ${GLOBAL_AGENTS} does not exist`);
      }
      if (opts.dryRun) {
        log("  would copy AGENTS.md from the global config");
      } else {
        writeFileSync(join(dir, "AGENTS.md"), readFileSync(GLOBAL_AGENTS));
        log("  create AGENTS.md (copied byte for byte from the global config)");
      }
      created.push("AGENTS.md");
    } else {
      log("  skip AGENTS.md (missing; rerun with --with-agents only after explicit user authorization)");
      skipped.push("AGENTS.md");
    }
  }

  if (!opts.dryRun) {
    const filesWithTodo = new Set();
    for (const entry of entries) {
      const target = join(dir, entry.target);
      if (existsSync(target) && readText(target).includes("TODO:")) filesWithTodo.add(entry.target);
    }
    if (existsSync(join(dir, "AGENTS.md")) && readText(join(dir, "AGENTS.md")).includes("TODO:")) {
      filesWithTodo.add("AGENTS.md");
    }
    log("");
    log(`created ${created.length}, overwritten ${overwritten.length}, skipped ${skipped.length}`);
    if (todos.length) {
      log("unresolved values left as TODO:");
      for (const item of todos) log(`  {{${item.key}}} = ${item.value}`);
      if (filesWithTodo.size) log(`TODO appears in: ${[...filesWithTodo].sort().join(", ")}`);
    } else {
      log("unresolved values left as TODO: none");
    }
  } else {
    log("");
    log(`dry run: would create ${created.length}, overwrite ${overwritten.length}, skip ${skipped.length}; nothing written`);
    if (todos.length) {
      log("unresolved values that would stay as TODO:");
      for (const item of todos) log(`  {{${item.key}}} = ${item.value}`);
    }
    log("dry run: --check not run");
    return true;
  }

  log("");
  log("check after apply:");
  const ok = checkRepo(dir);
  if (!ok) {
    log("");
    log("AGENTS.md is the usual reason a fresh scaffold fails: it is copied only with --with-agents.");
  }
  return ok;
}

function main() {
  const opts = parseArgs(process.argv.slice(2));
  const dir = resolve(opts.dir || ".");

  if (opts.mode === "check") {
    process.exitCode = checkRepo(dir) ? 0 : 1;
    return;
  }
  process.exitCode = applyScaffold(dir, opts) ? 0 : 1;
}

main();
