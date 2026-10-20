#!/usr/bin/env node
// Thin wrapper. The implementation lives in the skill so the globally
// installed copy and this repository can never drift apart.
import { spawnSync } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const script = join(dirname(fileURLToPath(import.meta.url)), "..", "skills", "repo-standards", "scripts", "standards.mjs");
const result = spawnSync(process.execPath, [script, ...process.argv.slice(2)], { stdio: "inherit" });

if (result.error) {
  console.error(`error: could not start ${script}: ${result.error.message}`);
  process.exit(1);
}
process.exit(result.status ?? 1);
