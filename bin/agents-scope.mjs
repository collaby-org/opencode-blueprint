#!/usr/bin/env node
// Check a parallel dispatch plan before any agent is spawned.
//
//   node bin/agents-scope.mjs --write .agents/lanes.json   # write a template
//   node bin/agents-scope.mjs --check .agents/lanes.json    # exit 1 on a conflict
//
// The manifest is the orchestrator's ledger:
//
//   {
//     "lanes": [
//       { "id": "api",   "role": "write", "paths": ["src/server/api"] },
//       { "id": "ui",    "role": "write", "paths": ["src/app/ui"] },
//       { "id": "recon", "role": "read",  "paths": ["src"] }
//     ]
//   }
//
// Two write lanes that claim the same path conflict: they would edit the same
// file. Read-only lanes may overlap - they never write. The check also refuses
// a path that leaves the repository, and a write lane with no scope.

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, isAbsolute, join, relative, resolve, sep } from "node:path";

const args = process.argv.slice(2);
const arg = (name) => {
  const i = args.indexOf(name);
  return i === -1 ? null : args[i + 1];
};

const write = arg("--write");
const check = arg("--check");
if (!write && !check) {
  console.log(`Usage:
  node ${process.argv[1].split(sep).join("/")} --write <manifest.json>   write a template
  node ${process.argv[1].split(sep).join("/")} --check <manifest.json>   report conflicts`);
  process.exit(2);
}

const root = resolve(process.cwd());

const TEMPLATE = {
  lanes: [
    { id: "example-writer", role: "write", paths: ["src/area"] },
    { id: "example-reader", role: "read", paths: ["src"] },
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

const manifestPath = resolve(root, check);
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

const lanes = Array.isArray(manifest.lanes) ? manifest.lanes : [];
const problems = [];
const writers = [];

for (const lane of lanes) {
  const id = lane && typeof lane.id === "string" ? lane.id : "(unnamed)";
  const role = lane && lane.role === "read" ? "read" : "write";
  const paths = lane && Array.isArray(lane.paths) ? lane.paths : [];
  if (role === "write") {
    if (paths.length === 0) problems.push(`write lane "${id}" has no scope`);
    writers.push({ id, paths });
  }
  for (const p of paths) {
    if (typeof p !== "string" || p.trim() === "") {
      problems.push(`lane "${id}" has an empty path`);
      continue;
    }
    if (isAbsolute(p)) {
      problems.push(`lane "${id}" claims an absolute path (${p}); use a path inside the repository`);
      continue;
    }
    const target = resolve(root, p);
    const rel = relative(root, target);
    if (rel === ".." || rel.startsWith(".." + sep) || isAbsolute(rel)) {
      problems.push(`lane "${id}" claims a path outside the repository (${p})`);
    }
  }
}

// Two write lanes that claim the same path, or one that claims a path inside
// another lane's path, would edit the same file.
const overlaps = (a, b) => {
  const norm = (p) => resolve(root, p).toLowerCase();
  return norm(a) === norm(b) || norm(a).startsWith(norm(b) + sep) || norm(b).startsWith(norm(a) + sep);
};

for (let i = 0; i < writers.length; i++) {
  for (let j = i + 1; j < writers.length; j++) {
    for (const a of writers[i].paths) {
      for (const b of writers[j].paths) {
        if (typeof a === "string" && typeof b === "string" && overlaps(a, b)) {
          problems.push(`write lanes "${writers[i].id}" and "${writers[j].id}" both claim ${a} / ${b}`);
        }
      }
    }
  }
}

if (problems.length > 0) {
  console.log(`  ${problems.length} conflict(s) in ${manifestPath}:`);
  for (const p of problems) console.log(`   - ${p}`);
  console.log("  Fix the plan: one owner per path, or run the lanes in sequence.");
  process.exit(1);
}

const writeLanes = writers.length;
const readLanes = lanes.length - writeLanes;
console.log(`  OK: ${lanes.length} lane(s), ${writeLanes} writing, ${readLanes} read-only, no overlapping write scope.`);
process.exit(0);
