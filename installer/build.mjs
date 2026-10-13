#!/usr/bin/env node
// Builds the Windows GUI installer with Inno Setup (ISCC.exe).
// Usage from repo root: node installer/build.mjs
// Reads package.json version, compiles installer/opencode-blueprint.iss with
// /DAppVersion=<version>, prints the output exe path.
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { join, dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = resolve(HERE, "..");
const pkg = JSON.parse(readFileSync(join(REPO, "package.json"), "utf8"));
const version = pkg.version;
if (!version) throw new Error("package.json has no version");

const ISCC =
  process.env.ISCC ||
  "C:\\Users\\horgh\\AppData\\Local\\Programs\\Inno Setup 6\\ISCC.exe";
const iss = join(HERE, "opencode-blueprint.iss");
if (!existsSync(iss)) throw new Error(`Inno script not found: ${iss}`);
if (!existsSync(ISCC))
  throw new Error(`ISCC.exe not found at ${ISCC} (set the ISCC env var to override)`);

execFileSync(ISCC, [`/DAppVersion=${version}`, iss], { stdio: "inherit" });

const exe = join(HERE, "Output", `opencode-blueprint-setup-${version}.exe`);
if (!existsSync(exe)) throw new Error(`Expected output not found: ${exe}`);
console.log(exe);
