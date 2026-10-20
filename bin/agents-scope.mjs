#!/usr/bin/env node
// Check a parallel dispatch plan before any agent is spawned, and verify after
// the lanes that they stayed in the scope they claimed.
//
//   node bin/agents-scope.mjs --write .agents/lanes.json      # write a template
//   node bin/agents-scope.mjs --check .agents/lanes.json       # exit 1 on a conflict
//   node bin/agents-scope.mjs --verify .agents/lanes.json --changed a.js,b.js
//
// The manifest is the orchestrator's ledger:
//
//   {
//     "lanes": [
//       { "id": "contract", "role": "shared", "paths": ["src/types.ts"] },
//       { "id": "api",      "role": "write",  "paths": ["src/server/api"], "after": ["contract"] },
//       { "id": "ui",       "role": "write",  "paths": ["src/app/ui"],    "after": ["contract"] },
//       { "id": "recon",    "role": "read",   "paths": ["src"] }
//     ]
//   }
//
// The rules it enforces:
//   - Two lanes that write the same path conflict. Read-only lanes may
//     overlap: they never write.
//   - A `shared` lane owns the artifact everybody else depends on (a shared
//     type, a schema, a generated file). Land it first; the lanes that
//     declare it in `after` run in the next wave.
//   - A path outside the repository is a mistake, not a lane.
//   - A writing lane with no scope is a mistake, not a lane.
//   - The changed files of a run must fall inside the scope of a lane.
//
// The practices behind it: Anthropic's multi-agent research system (detailed
// briefs, measured parallelism), Anthropic's and LangChain's warnings that
// most coding tasks have fewer truly parallel units than research and cost
// far more tokens, and the contract-first guidance that gives lockfiles,
// generated files, schemas and migrations a single writer.

import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { dirname, isAbsolute, join, relative, resolve, sep } from "node:path";

const args = process.argv.slice(2);
const arg = (name) => {
  const i = args.indexOf(name);
  return i === -1 ? null : args[i + 1];
};
const flag = (name) => args.includes(name);
// Every value that follows a `--changed`, in every occurrence of it. A single
// value would silently drop the rest and turn a scope violation into a clean
// result.
const allArgs = (name) => {
  const values = [];
  for (let i = 0; i < args.length; i++) {
    if (args[i] === name && i + 1 < args.length) values.push(args[i + 1]);
  }
  return values;
};
// A bare word that is not a flag or a value belongs to a flag: a mistyped
// invocation must never look like a clean check.
const strayArgs = (known) => {
  const stray = [];
  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (a.startsWith("--")) {
      if (known.includes(a) && i + 1 < args.length) i++;
      continue;
    }
    stray.push(a);
  }
  return stray;
};

const write = arg("--write");
const check = arg("--check");
const verify = arg("--verify");
const changed = arg("--changed");
void changed;

if (!write && !check && !verify) {
  console.log(`Usage:
  node bin/agents-scope.mjs --write <manifest.json>            write a template
  node bin/agents-scope.mjs --check <manifest.json>            report conflicts
  node bin/agents-scope.mjs --verify <manifest.json> --changed <file>,<file>
                                                               check the changed files`);
  process.exit(2);
}

const root = resolve(process.cwd());
const norm = (p) => resolve(root, p).toLowerCase();
const isInside = (child, parent) => {
  const c = norm(child);
  const p = norm(parent);
  return c === p || c.startsWith(p + sep);
};

const TEMPLATE = {
  lanes: [
    { id: "contract", role: "shared", paths: ["src/types.ts"], outputs: ["the shared type"] },
    { id: "writer-a", role: "write", paths: ["src/area-a"], after: ["contract"], outputs: ["the files under src/area-a"] },
    { id: "writer-b", role: "write", paths: ["src/area-b"], after: ["contract"], outputs: ["the files under src/area-b"] },
    { id: "reader", role: "read", paths: ["src"] },
  ],
};

if (write) {
  const target = resolve(root, write);
  if (existsSync(target)) {
    console.log(`  keep ${target} (it exists; a dispatch plan is not overwritten)`);
    process.exit(1);
  }
  mkdirSync(dirname(target), { recursive: true });
  writeFileSync(target, `${JSON.stringify(TEMPLATE, null, 2)}\n`);
  console.log(`  wrote ${target}`);
  process.exit(0);
}

const manifestPath = resolve(root, check || verify);
if (!existsSync(manifestPath)) {
  console.log(`  no dispatch plan at ${manifestPath}`);
  process.exit(1);
}

let manifest;
try {
  manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
} catch (error) {
  console.log(`  ${manifestPath} is not valid JSON: ${error.message}`);
  process.exit(1);
}

const lanes = Array.isArray(manifest.lanes) ? manifest.lanes : null;
if (lanes === null) {
  console.log(`  ${manifestPath} has no "lanes" array`);
  process.exit(1);
}
if (lanes.length === 0) {
  console.log(`  ${manifestPath} has no lanes: there is nothing to check`);
  process.exit(1);
}
const problems = [];
const warnings = [];
const writers = [];
const ids = new Set();

for (const lane of lanes) {
  const id = lane && typeof lane.id === "string" ? lane.id : "(unnamed)";
  if (ids.has(id)) problems.push(`two lanes share the id "${id}"`);
  ids.add(id);
  const role = lane && (lane.role === "read" || lane.role === "shared") ? lane.role : "write";
  const paths = lane && Array.isArray(lane.paths) ? lane.paths : [];
  if (role !== "read" && paths.length === 0) {
    problems.push(`lane "${id}" (${role}) has no scope`);
  }
  if (role === "read" && paths.length === 0) {
    warnings.push(`read-only lane "${id}" has no scope; it may read anything`);
  }
  if (role !== "read") writers.push({ id, role, paths });
  for (const p of paths) {
    if (typeof p !== "string" || p.trim() === "") {
      problems.push(`lane "${id}" has an empty path`);
      continue;
    }
    if (isAbsolute(p)) {
      problems.push(`lane "${id}" claims an absolute path (${p}); use a path inside the repository`);
      continue;
    }
    const rel = relative(root, resolve(root, p));
    if (rel === ".." || rel.startsWith(".." + sep) || isAbsolute(rel)) {
      problems.push(`lane "${id}" claims a path outside the repository (${p})`);
    }
  }
}

// Two lanes that write the same path, or one that claims a path inside
// another lane's path, would edit the same file. A shared lane owns its
// artifact alone: the lanes that depend on it never claim it.
for (let i = 0; i < writers.length; i++) {
  for (let j = i + 1; j < writers.length; j++) {
    for (const a of writers[i].paths) {
      for (const b of writers[j].paths) {
        if (typeof a === "string" && typeof b === "string" && (isInside(a, b) || isInside(b, a))) {
          problems.push(`lanes "${writers[i].id}" and "${writers[j].id}" both claim ${a} / ${b}`);
        }
      }
    }
  }
}

// Dependencies must exist and must not cycle.
const deps = new Map();
for (const lane of lanes) {
  const id = lane && typeof lane.id === "string" ? lane.id : "(unnamed)";
  const after = lane && Array.isArray(lane.after) ? lane.after : [];
  deps.set(id, after);
  for (const d of after) {
    if (!ids.has(d)) problems.push(`lane "${id}" depends on "${d}", which is not a lane`);
  }
}
const state = new Map();
const visit = (id, stack = []) => {
  if (state.get(id) === "done") return;
  if (state.get(id) === "open") {
    problems.push(`dependency cycle: ${[...stack, id].join(" -> ")}`);
    return;
  }
  state.set(id, "open");
  for (const d of deps.get(id) || []) visit(d, [...stack, id]);
  state.set(id, "done");
};
for (const id of ids) visit(id);

// The practical ceiling is review capacity, not compute.
const MAX_WRITERS = 5;
if (writers.length > MAX_WRITERS) {
  warnings.push(`${writers.length} writing lanes; the guidance is 3-5, and a change with no independent units belongs in one lane`);
}

// The waves, in order: a lane runs after everything it depends on.
const waves = [];
const placed = new Set();
while (placed.size < ids.size) {
  const wave = [...ids].filter((id) => !placed.has(id) && (deps.get(id) || []).every((d) => placed.has(d)));
  if (wave.length === 0) break;
  for (const id of wave) placed.add(id);
  waves.push(wave);
}

if (verify) {
  const files = allArgs("--changed")
    .flatMap((v) => v.split(","))
    .map((f) => f.trim())
    .filter(Boolean);
  if (files.length === 0) {
    console.log("  no changed files given - pass --changed <file>,<file>");
    process.exit(2);
  }
  const stray = strayArgs(["--verify", "--changed"]);
  if (stray.length > 0) {
    console.log(`  unexpected argument(s): ${stray.join(" ")}`);
    console.log("  Every changed file must be listed: --changed <file>,<file>");
    process.exit(2);
  }
  for (const f of files) {
    const owners = writers.filter((w) => w.paths.some((p) => typeof p === "string" && isInside(f, p)));
    if (owners.length === 0) {
      problems.push(`changed file "${f}" is outside every lane's scope`);
    } else if (owners.length > 1) {
      problems.push(`changed file "${f}" is claimed by ${owners.map((o) => `"${o.id}"`).join(" and ")}`);
    }
  }
  if (problems.length > 0) {
    console.log(`  ${problems.length} problem(s):`);
    for (const p of problems) console.log(`   - ${p}`);
    process.exit(1);
  }
  for (const w of warnings) console.log(`  note: ${w}`);
  console.log(`  OK: ${files.length} changed file(s) inside the declared scope.`);
  process.exit(0);
}

if (problems.length > 0) {
  console.log(`  ${problems.length} conflict(s) in ${manifestPath}:`);
  for (const p of problems) console.log(`   - ${p}`);
  console.log("  Fix the plan: one owner per path, or run the lanes in sequence.");
  process.exit(1);
}
for (const w of warnings) console.log(`  note: ${w}`);
console.log(
  `  OK: ${lanes.length} lane(s), ${writers.length} writing, ${lanes.length - writers.length} read-only, no overlapping scope.`,
);
for (const [i, wave] of waves.entries()) {
  console.log(`  wave ${i + 1}: ${wave.join(", ")}`);
}
process.exit(0);
