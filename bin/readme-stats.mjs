#!/usr/bin/env node
// Generate the stats block in the README from the repository itself.
//
//   node bin/readme-stats.mjs           # rewrite the block
//   node bin/readme-stats.mjs --check   # exit 1 when the block is stale
//
// The numbers are counted, never typed: the skills in skills/, the MCPs in
// config/opencode.jsonc, the plugins, the commands, the agents, the workflows
// and the version in package.json. A README that lies about its own contents
// is worse than no README.

import { existsSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";

const ROOT = resolve(join(import.meta.dirname, ".."));
const README = join(ROOT, "README.md");
const START = "<!-- stats:start -->";
const END = "<!-- stats:end -->";

const read = (p) => readFileSync(join(ROOT, p), "utf8");
const dirs = (p) =>
  existsSync(join(ROOT, p)) ? readdirSync(join(ROOT, p), { withFileTypes: true }).filter((d) => d.isDirectory()).length : 0;
const files = (p, ext) =>
  existsSync(join(ROOT, p))
    ? readdirSync(join(ROOT, p), { withFileTypes: true }).filter((f) => f.isFile() && (!ext || f.name.endsWith(ext))).length
    : 0;

// The MCP block is the only place the server list exists. Count its entries:
// a disabled server still ships.
function mcpCount() {
  const raw = read("config/opencode.jsonc");
  const start = raw.indexOf('"mcp"');
  if (start === -1) return 0;
  const body = raw.slice(start);
  const end = body.indexOf("\n  }", 1);
  const block = end === -1 ? body : body.slice(0, end);
  const entries = block.match(/^\s{4}"[a-z0-9-]+":\s*\{/gm);
  return entries ? entries.length : 0;
}

const pkg = JSON.parse(read("package.json"));

// The installer's skill sources: every repository it pulls from, and the
// skills it names inside them. A source installed whole has no name here.
function skillSources() {
  const raw = read("bin/setup.mjs");
  const start = raw.indexOf("const SKILLS = [");
  if (start === -1) return { sources: 0, named: 0 };
  const end = raw.indexOf("\n];", start);
  const body = raw.slice(start, end === -1 ? undefined : end);
  const lines = body.split("\n").filter((l) => l.trim().startsWith("["));
  const named = body.match(/"[a-z0-9-]+"/g) || [];
  // The first string on a line is the repository; the rest are skill names.
  let skillNames = 0;
  for (const line of lines) {
    const strings = line.match(/"[^"]+"/g) || [];
    skillNames += Math.max(0, strings.length - 1);
  }
  return { sources: lines.length, named: skillNames };
}

const sources = skillSources();
const templates = (function countFiles(dir) {
  if (!existsSync(join(ROOT, dir))) return 0;
  let n = 0;
  for (const entry of readdirSync(join(ROOT, dir), { withFileTypes: true })) {
    if (entry.isDirectory()) n += countFiles(join(dir, entry.name));
    else n++;
  }
  return n;
})("skills/repo-standards/templates");

const stats = [
  { label: "Vendored skills", value: dirs("skills"), note: "the workflow, the standards and the mind map" },
  { label: "Skill sources", value: sources.sources, note: `${sources.named} named skills, the rest whole repositories` },
  { label: "MCP servers", value: mcpCount(), note: "in the shipped config; the GCP remotes and kubernetes wait for credentials" },
  { label: "Plugins", value: dirs("config/plugins") + 1, note: "local plus the slim bundle" },
  { label: "Commands", value: files("config/commands", ".md"), note: "in config/commands; three more are registered by plugins" },
  { label: "Agents", value: files("config/agents", ".md"), note: "the orchestrator" },
  { label: "CI workflows", value: files(".github/workflows", ".yml"), note: "pinned to commit SHAs" },
  { label: "Repo templates", value: templates, note: "the baseline every repo gets" },
  { label: "Version", value: `v${pkg.version}`, note: "in package.json; published on release" },
];

const strip = [
  START,
  "",
  ...stats.map((s) => `- **${s.value}** ${s.label} — ${s.note}`),
  "",
  END,
].join("\n");

const raw = readFileSync(README, "utf8");
const start = raw.indexOf(START);
const end = raw.indexOf(END);
if (start === -1 || end === -1) {
  console.log(`  the README has no ${START} / ${END} markers`);
  process.exit(1);
}
const before = raw.slice(0, start);
const after = raw.slice(end + END.length);
const next = `${before}${strip}${after}`;

if (process.argv.includes("--check")) {
  if (next !== raw) {
    console.log("  the README stats are stale — run: node bin/readme-stats.mjs");
    process.exit(1);
  }
  console.log(`  OK: the README stats match the repository (${stats.length} figures).`);
  process.exit(0);
}

writeFileSync(README, next);
console.log(`  wrote ${stats.length} figures into README.md`);
