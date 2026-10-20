#!/usr/bin/env node
// Launch a local MCP server with the config .env loaded.
//
// OpenCode expands `{env:VAR}` from its own process environment. The values in
// `<config>/.env` are not part of that environment, so a placeholder in an MCP
// `command` arrives as an empty string and servers fail on startup — the
// Postgres server threw "Invalid URL" for exactly this reason, and Redis and
// MongoDB quietly connected to their localhost defaults instead of the
// configured instance.
//
// This wrapper reads the file, expands `{env:VAR}` in its own arguments, and
// spawns the real command with the merged environment.
//
// Usage in opencode.jsonc:
//   "command": ["node", "<config>/tools/mcp-env.mjs", "<real command>", "...args"]

import { readFileSync } from "node:fs";
import { spawn } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const envPath = join(here, "..", ".env");

const fileEnv = {};
try {
  for (const line of readFileSync(envPath, "utf8").split(/\r?\n/)) {
    const match = /^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/.exec(line);
    if (!match) continue;
    let value = match[2].trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    fileEnv[match[1]] = value;
  }
} catch {
  // No .env: fall back to the inherited environment.
}

// The file wins over an inherited empty value: the host passes "" for a
// placeholder it could not expand.
const env = { ...process.env, ...fileEnv };
const expand = (arg) =>
  arg
    // `@NAME@` is the form used in opencode.jsonc: OpenCode rewrites
    // `{env:NAME}` from its own process environment and turns it into an
    // empty string before this process starts, which would lose the key.
    .replace(/@([A-Za-z_][A-Za-z0-9_]*)@/g, (_, key) => env[key] ?? "")
    .replace(/\{env:([A-Za-z_][A-Za-z0-9_]*)\}/g, (_, key) => env[key] ?? "");

const [command, ...args] = process.argv.slice(2).map(expand);
if (!command) {
  console.error("mcp-env: no command given");
  process.exit(2);
}

const child = spawn(command, args, { stdio: "inherit", env, windowsHide: true });
child.on("error", (error) => {
  console.error(`mcp-env: ${error.message}`);
  process.exit(1);
});
child.on("exit", (code, signal) => {
  process.exit(code ?? (signal ? 1 : 0));
});
