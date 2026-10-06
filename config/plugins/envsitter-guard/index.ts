import { define } from "@opencode-ai/plugin/v2/promise";
import {
  EnvSitter,
  addEnvFileKey,
  annotateEnvFile,
  copyEnvFileKeys,
  deleteEnvFileKeys,
  formatEnvFile,
  setEnvFileKey,
  unsetEnvFileKey,
  validateEnvFile,
} from "envsitter";
import path from "node:path";

function normalizePath(input: string): string {
  return input.replace(/\\/g, "/");
}

function isDotEnvExamplePath(input: string): boolean {
  return /(^|\/)\.env\.example$/.test(normalizePath(input));
}

function isSensitiveDotEnvPath(input: string): boolean {
  const normalized = normalizePath(input);
  if (isDotEnvExamplePath(normalized)) return false;
  return /(^|\/)\.env($|\.)/.test(normalized);
}

function isDotEnvishPath(input: string): boolean {
  const normalized = normalizePath(input);
  return isDotEnvExamplePath(normalized) || isSensitiveDotEnvPath(normalized);
}

function isEnvSitterPepperPath(input: string): boolean {
  const normalized = normalizePath(input);
  return /(^|\/)\.envsitter\/pepper$/.test(normalized);
}

function stripAtPrefix(input: string): string {
  return input.trim().replace(/^@+/, "");
}

function parseUserRegExp(input: string): RegExp {
  const trimmed = input.trim();
  if (!trimmed.startsWith("/")) return new RegExp(trimmed);
  let lastSlashIndex = -1;
  for (let i = trimmed.length - 1; i >= 1; i -= 1) {
    if (trimmed[i] !== "/") continue;
    let backslashCount = 0;
    for (let j = i - 1; j >= 0 && trimmed[j] === "\\"; j -= 1) {
      backslashCount += 1;
    }
    const isEscaped = backslashCount % 2 === 1;
    if (!isEscaped) {
      lastSlashIndex = i;
      break;
    }
  }
  if (lastSlashIndex === -1) {
    throw new Error("Invalid regex literal; expected a closing `/`.");
  }
  const body = trimmed.slice(1, lastSlashIndex);
  const flags = trimmed.slice(lastSlashIndex + 1);
  if (!/^[a-z]*$/.test(flags)) {
    throw new Error("Invalid regex literal flags; expected only letters (e.g. `/abc/i`).");
  }
  return new RegExp(body, flags);
}

function resolveCandidate(params: { candidate?: string; candidateEnvVar?: string }): string {
  if (typeof params.candidate === "string" && params.candidate.length > 0) return params.candidate;
  if (typeof params.candidateEnvVar === "string" && params.candidateEnvVar.length > 0) {
    const value = process.env[params.candidateEnvVar];
    if (typeof value === "string" && value.length > 0) return value;
    throw new Error(`Env var \`${params.candidateEnvVar}\` was not set.`);
  }
  throw new Error("Candidate is required for this operation. Provide `candidate` or `candidateEnvVar`.");
}

function getFilePathFromArgs(args: unknown): string | undefined {
  if (!args || typeof args !== "object") return undefined;
  const record = args as Record<string, unknown>;
  const candidates = [record.filePath, record.path, record.file_path];
  const found = candidates.find((value) => typeof value === "string") as string | undefined;
  return found ? stripAtPrefix(found) : undefined;
}

function resolveDotEnvPath(
  base: { directory: string; worktree: string },
  filePath: string,
): { absolutePath: string; displayPath: string } {
  const normalized = normalizePath(filePath);
  if (isEnvSitterPepperPath(normalized)) {
    throw new Error("Access to `.envsitter/pepper` is blocked.");
  }
  if (!isDotEnvishPath(normalized)) {
    throw new Error("Only `.env`-style paths are allowed (e.g. `.env`, `.env.local`, `.env.example`).");
  }
  const absolutePath = path.resolve(base.directory, normalized);
  const relativeToWorktree = path.relative(base.worktree, absolutePath);
  if (relativeToWorktree.startsWith("..") || path.isAbsolute(relativeToWorktree)) {
    throw new Error("EnvSitter tools only operate on files inside the current project.");
  }
  return { absolutePath, displayPath: relativeToWorktree };
}

const matchOps = [
  "exists",
  "is_empty",
  "is_equal",
  "partial_match_prefix",
  "partial_match_suffix",
  "partial_match_regex",
  "is_number",
  "is_boolean",
  "is_string",
] as const;

const scanDetections = ["jwt", "url", "base64"] as const;

const helpTopics = ["overview", "reading", "matching", "mutations", "file_ops", "all"] as const;

const overview = `
## EnvSitter Tools Overview

EnvSitter provides safe .env file operations that NEVER expose secret values.
All tools return keys, booleans, line numbers, and operation plans only.

### Why Use EnvSitter?
- Direct reading of .env files is BLOCKED to prevent secret leaks
- These tools let you inspect, validate, and modify .env files safely
- File modifications are dry-run by default; use \`write: true\` to apply

### Tool Categories
- **Reading**: envsitter_keys, envsitter_fingerprint, envsitter_scan
- **Matching**: envsitter_match, envsitter_match_by_key
- **Mutations**: envsitter_add, envsitter_set, envsitter_unset, envsitter_delete
- **File Ops**: envsitter_validate, envsitter_copy, envsitter_format, envsitter_annotate
`;

const reading = `
## Reading Tools (never return values)

### envsitter_keys
List all keys in a .env file.
\`\`\`json
{ "filePath": ".env", "filterRegex": "/^API_/" }
\`\`\`
Returns: \`{ file, keys: string[] }\`

### envsitter_fingerprint
Get a deterministic fingerprint of a key's value (for comparison/auditing).
\`\`\`json
{ "filePath": ".env", "key": "DATABASE_URL" }
\`\`\`
Returns: \`{ file, key, result: { algorithm, fingerprint, length } }\`

### envsitter_scan
Detect value shapes (JWT, URL, base64) without revealing values.
\`\`\`json
{ "filePath": ".env", "detect": ["jwt", "url", "base64"], "keysFilterRegex": "/TOKEN/" }
\`\`\`
Returns: \`{ file, findings: [{ key, detections }] }\`
`;

const matching = `
## Matching Tools (return booleans only)

### envsitter_match
Check if a key's value matches criteria without seeing the value.

**Operations** (op parameter):
- \`exists\`: key is present
- \`is_empty\`: value is empty string
- \`is_equal\`: matches candidate exactly (provide \`candidate\` or \`candidateEnvVar\`)
- \`partial_match_prefix\`: value starts with candidate
- \`partial_match_suffix\`: value ends with candidate
- \`partial_match_regex\`: value matches regex pattern
- \`is_number\`: value is numeric
- \`is_boolean\`: value is true/false
- \`is_string\`: value is neither number nor boolean

**Selectors** (provide exactly one):
- \`key\`: single key
- \`keys\`: array of keys
- \`allKeys: true\`: all keys in file

\`\`\`json
{ "filePath": ".env", "key": "NODE_ENV", "op": "is_equal", "candidate": "production" }
{ "filePath": ".env", "keys": ["API_KEY", "SECRET"], "op": "exists" }
{ "filePath": ".env", "allKeys": true, "op": "is_empty" }
\`\`\`

### envsitter_match_by_key
Bulk match different candidates against different keys.
\`\`\`json
{ "filePath": ".env", "candidatesByKey": { "API_KEY": "sk-xxx", "DB_PASS": "secret123" } }
\`\`\`
Returns: \`{ file, matches: [{ key, match: boolean }] }\`
`;

const mutations = `
## Mutation Tools (modify .env files safely)

All mutation tools are DRY-RUN by default. Set \`write: true\` to apply changes.
Output includes operation plan with line numbers, never values.

### envsitter_add
Add a NEW key (fails if key already exists).
\`\`\`json
{ "filePath": ".env", "key": "NEW_KEY", "value": "some-value", "write": true }
\`\`\`
Returns: \`{ file, key, hasChanges, plan: { action: "added"|"key_exists" } }\`

### envsitter_set
Create or update a key (upsert behavior).
\`\`\`json
{ "filePath": ".env", "key": "API_KEY", "value": "new-value", "write": true }
\`\`\`
Returns: \`{ file, key, hasChanges, plan: { action: "added"|"updated"|"no_change" } }\`

### envsitter_unset
Set a key to empty string (keeps the key line).
\`\`\`json
{ "filePath": ".env", "key": "OLD_KEY", "write": true }
\`\`\`
Returns: \`{ file, key, hasChanges, plan: { action: "unset"|"not_found" } }\`

### envsitter_delete
Remove key(s) entirely from the file.
\`\`\`json
{ "filePath": ".env", "keys": ["OLD_KEY", "UNUSED_KEY"], "write": true }
\`\`\`
Returns: \`{ file, keys, hasChanges, plan: [{ key, action: "deleted"|"not_found" }] }\`
`;

const fileOps = `
## File Operation Tools

### envsitter_validate
Check .env file syntax for errors.
\`\`\`json
{ "filePath": ".env" }
\`\`\`
Returns: \`{ file, ok: boolean, issues: [{ line, column, message }] }\`

### envsitter_copy
Copy keys between .env files. Dry-run unless \`write: true\`.
\`\`\`json
{
  "from": ".env.production",
  "to": ".env.staging",
  "keys": ["API_URL", "REDIS_URL"],
  "onConflict": "overwrite",
  "write": true
}
\`\`\`
Options: \`includeRegex\`, \`excludeRegex\`, \`rename\` (e.g., "OLD=NEW,A=B")
Returns: \`{ from, to, hasChanges, plan: [{ fromKey, toKey, action }] }\`

### envsitter_format / envsitter_reorder
Format/reorder a .env file. Dry-run unless \`write: true\`.
\`\`\`json
{ "filePath": ".env", "mode": "sections", "sort": "alpha", "write": true }
\`\`\`
Modes: \`sections\` (preserve section groupings), \`global\` (treat as flat list)
Sort: \`alpha\` (alphabetical), \`none\` (preserve order within sections)

### envsitter_annotate
Add a comment above a key. Dry-run unless \`write: true\`.
\`\`\`json
{ "filePath": ".env", "key": "DATABASE_URL", "comment": "Production DB only", "write": true }
\`\`\`
Returns: \`{ file, key, hasChanges, plan: { action: "inserted"|"updated"|"not_found" } }\`
`;

export default define({
  id: "envsitter-guard",
  async setup(ctx) {
    // NOTE (v1 -> v2): v1 received { directory, worktree } from PluginContext;
    // v2 carries neither, so fall back to the server working directory
    // (same approach as the in-repo opencode-review v2 migration).
    const base = { directory: process.cwd(), worktree: process.cwd() };
    const dot = (filePath?: string) => resolveDotEnvPath(base, filePath ?? ".env");

    await ctx.tool.transform((editor) => {
      editor.namespace({
        name: "envsitter",
        description: "Safe .env inspection and mutation (never exposes secret values)",
      });

      editor.add({
        name: "keys",
        description: "List keys in a .env file (never returns values).",
        input: {
          type: "object",
          properties: {
            filePath: { type: "string" },
            filterRegex: { type: "string" },
          },
          additionalProperties: false,
        },
        async execute(raw: unknown) {
          const args = (raw ?? {}) as { filePath?: string; filterRegex?: string };
          const resolved = dot(args.filePath);
          const es = EnvSitter.fromDotenvFile(resolved.absolutePath);
          const keys = await es.listKeys(
            args.filterRegex ? { filter: parseUserRegExp(args.filterRegex) } : undefined,
          );
          return { content: JSON.stringify({ file: resolved.displayPath, keys }, null, 2) };
        },
      });

      editor.add({
        name: "fingerprint",
        description: "Compute a deterministic fingerprint for a single key (never returns the value).",
        input: {
          type: "object",
          properties: {
            filePath: { type: "string" },
            key: { type: "string" },
          },
          required: ["key"],
          additionalProperties: false,
        },
        async execute(raw: unknown) {
          const args = (raw ?? {}) as { filePath?: string; key: string };
          const resolved = dot(args.filePath);
          const es = EnvSitter.fromDotenvFile(resolved.absolutePath);
          const result = await es.fingerprintKey(args.key);
          return {
            content: JSON.stringify({ file: resolved.displayPath, key: args.key, result }, null, 2),
          };
        },
      });

      editor.add({
        name: "match",
        description:
          "Match key values without printing them. Supports existence/shape checks and outside-in candidate matching.",
        input: {
          type: "object",
          properties: {
            filePath: { type: "string" },
            op: { type: "string", enum: [...matchOps] },
            key: { type: "string" },
            keys: { type: "array", items: { type: "string" } },
            allKeys: { type: "boolean" },
            candidate: { type: "string" },
            candidateEnvVar: { type: "string" },
          },
          additionalProperties: false,
        },
        async execute(raw: unknown) {
          const args = (raw ?? {}) as {
            filePath?: string;
            op?: (typeof matchOps)[number];
            key?: string;
            keys?: string[];
            allKeys?: boolean;
            candidate?: string;
            candidateEnvVar?: string;
          };
          const resolved = dot(args.filePath);
          const op = args.op ?? "is_equal";
          const es = EnvSitter.fromDotenvFile(resolved.absolutePath);
          let isEqualCandidate: string | undefined;
          const matcher = ((): Record<string, unknown> => {
            if (op === "exists") return { op };
            if (op === "is_empty") return { op };
            if (op === "is_number") return { op };
            if (op === "is_boolean") return { op };
            if (op === "is_string") return { op };
            const candidate = resolveCandidate({
              candidate: args.candidate,
              candidateEnvVar: args.candidateEnvVar,
            });
            if (op === "is_equal") {
              isEqualCandidate = candidate;
              return { op, candidate };
            }
            if (op === "partial_match_prefix") return { op, prefix: candidate };
            if (op === "partial_match_suffix") return { op, suffix: candidate };
            if (op === "partial_match_regex") return { op, regex: parseUserRegExp(candidate) };
            throw new Error(`Unsupported op: ${op}`);
          })();
          const key = args.key;
          const keys = args.keys;
          const allKeys = args.allKeys === true;
          const selectorCount =
            Number(typeof key === "string") +
            Number(Array.isArray(keys) && keys.length > 0) +
            Number(allKeys);
          if (selectorCount !== 1) {
            throw new Error("Provide exactly one of: `key`, `keys`, or `allKeys: true`. ");
          }
          if (typeof key === "string") {
            const match =
              matcher.op === "is_equal" && typeof isEqualCandidate === "string"
                ? await es.matchCandidate(key, isEqualCandidate)
                : await es.matchKey(key, matcher as never);
            return {
              content: JSON.stringify(
                { file: resolved.displayPath, key, op: matcher.op, match },
                null,
                2,
              ),
            };
          }
          if (Array.isArray(keys) && keys.length > 0) {
            const matches =
              matcher.op === "is_equal" && typeof isEqualCandidate === "string"
                ? await es.matchCandidateBulk(keys, isEqualCandidate)
                : await es.matchKeyBulk(keys, matcher as never);
            return {
              content: JSON.stringify({ file: resolved.displayPath, op: matcher.op, matches }, null, 2),
            };
          }
          const matches =
            matcher.op === "is_equal" && typeof isEqualCandidate === "string"
              ? await es.matchCandidateAll(isEqualCandidate)
              : await es.matchKeyAll(matcher as never);
          return {
            content: JSON.stringify({ file: resolved.displayPath, op: matcher.op, matches }, null, 2),
          };
        },
      });

      editor.add({
        name: "match_by_key",
        description: "Bulk match candidates-by-key without printing values (returns booleans only).",
        input: {
          type: "object",
          properties: {
            filePath: { type: "string" },
            candidatesByKey: { type: "object", additionalProperties: { type: "string" } },
            candidatesByKeyJson: { type: "string" },
            candidatesByKeyEnvVar: { type: "string" },
          },
          additionalProperties: false,
        },
        async execute(raw: unknown) {
          const args = (raw ?? {}) as {
            filePath?: string;
            candidatesByKey?: Record<string, string>;
            candidatesByKeyJson?: string;
            candidatesByKeyEnvVar?: string;
          };
          const resolved = dot(args.filePath);
          const fromRecord = args.candidatesByKey;
          const fromJson = args.candidatesByKeyJson;
          const fromEnvVar = args.candidatesByKeyEnvVar;
          const selectorCount = Number(!!fromRecord) + Number(!!fromJson) + Number(!!fromEnvVar);
          if (selectorCount !== 1) {
            throw new Error(
              "Provide exactly one of: `candidatesByKey`, `candidatesByKeyJson`, or `candidatesByKeyEnvVar`.",
            );
          }
          let candidatesByKey: Record<string, string>;
          if (fromRecord) {
            candidatesByKey = fromRecord;
          } else {
            const json =
              typeof fromJson === "string"
                ? fromJson
                : (() => {
                    const value = process.env[fromEnvVar!];
                    if (typeof value !== "string") throw new Error(`Env var \`${fromEnvVar}\` was not set.`);
                    return value;
                  })();
            let parsed: unknown;
            try {
              parsed = JSON.parse(json);
            } catch {
              throw new Error("Invalid candidates JSON; expected an object mapping key -> candidate string.");
            }
            if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
              throw new Error("Invalid candidates JSON; expected an object mapping key -> candidate string.");
            }
            const normalized: Record<string, string> = {};
            for (const [key, value] of Object.entries(parsed as Record<string, unknown>)) {
              if (typeof value !== "string") {
                throw new Error("Invalid candidates JSON; expected every value to be a string.");
              }
              normalized[key] = value;
            }
            candidatesByKey = normalized;
          }
          const es = EnvSitter.fromDotenvFile(resolved.absolutePath);
          const matches = await es.matchCandidatesByKey(candidatesByKey);
          return { content: JSON.stringify({ file: resolved.displayPath, matches }, null, 2) };
        },
      });

      editor.add({
        name: "scan",
        description: "Scan value shapes (jwt/url/base64) without printing values.",
        input: {
          type: "object",
          properties: {
            filePath: { type: "string" },
            detect: { type: "array", items: { type: "string", enum: [...scanDetections] } },
            keysFilterRegex: { type: "string" },
          },
          additionalProperties: false,
        },
        async execute(raw: unknown) {
          const args = (raw ?? {}) as {
            filePath?: string;
            detect?: Array<(typeof scanDetections)[number]>;
            keysFilterRegex?: string;
          };
          const resolved = dot(args.filePath);
          const es = EnvSitter.fromDotenvFile(resolved.absolutePath);
          const findings = await es.scan({
            detect: args.detect,
            keysFilter: args.keysFilterRegex ? parseUserRegExp(args.keysFilterRegex) : undefined,
          });
          return { content: JSON.stringify({ file: resolved.displayPath, findings }, null, 2) };
        },
      });

      editor.add({
        name: "validate",
        description: "Validate dotenv syntax (never returns values).",
        input: {
          type: "object",
          properties: { filePath: { type: "string" } },
          additionalProperties: false,
        },
        async execute(raw: unknown) {
          const args = (raw ?? {}) as { filePath?: string };
          const resolved = dot(args.filePath);
          const result = await validateEnvFile(resolved.absolutePath);
          return {
            content: JSON.stringify(
              { file: resolved.displayPath, ok: result.ok, issues: result.issues },
              null,
              2,
            ),
          };
        },
      });

      editor.add({
        name: "copy",
        description: "Copy keys between dotenv files safely (no values in output). Dry-run unless `write: true`.",
        input: {
          type: "object",
          properties: {
            from: { type: "string" },
            to: { type: "string" },
            keys: { type: "array", items: { type: "string" } },
            includeRegex: { type: "string" },
            excludeRegex: { type: "string" },
            rename: { type: "string" },
            onConflict: { type: "string", enum: ["error", "skip", "overwrite"] },
            write: { type: "boolean" },
          },
          required: ["from", "to"],
          additionalProperties: false,
        },
        async execute(raw: unknown) {
          const args = (raw ?? {}) as {
            from: string;
            to: string;
            keys?: string[];
            includeRegex?: string;
            excludeRegex?: string;
            rename?: string;
            onConflict?: "error" | "skip" | "overwrite";
            write?: boolean;
          };
          const resolvedFrom = resolveDotEnvPath(base, args.from);
          const resolvedTo = resolveDotEnvPath(base, args.to);
          if (typeof args.rename === "string" && args.rename.trim().length === 0) {
            throw new Error("Invalid `rename`; expected a non-empty string like `A=B,C=D`. ");
          }
          const result = await copyEnvFileKeys({
            from: resolvedFrom.absolutePath,
            to: resolvedTo.absolutePath,
            keys: Array.isArray(args.keys) && args.keys.length > 0 ? args.keys : undefined,
            include: args.includeRegex ? parseUserRegExp(args.includeRegex) : undefined,
            exclude: args.excludeRegex ? parseUserRegExp(args.excludeRegex) : undefined,
            rename: args.rename,
            onConflict: args.onConflict,
            write: args.write === true,
          });
          return {
            content: JSON.stringify(
              {
                from: resolvedFrom.displayPath,
                to: resolvedTo.displayPath,
                onConflict: result.onConflict,
                willWrite: result.willWrite,
                wrote: result.wrote,
                hasChanges: result.hasChanges,
                issues: result.issues,
                plan: result.plan,
              },
              null,
              2,
            ),
          };
        },
      });

      editor.add({
        name: "format",
        description: "Format/reorder a dotenv file (no values in output). Dry-run unless `write: true`.",
        input: {
          type: "object",
          properties: {
            filePath: { type: "string" },
            mode: { type: "string", enum: ["sections", "global"] },
            sort: { type: "string", enum: ["alpha", "none"] },
            write: { type: "boolean" },
          },
          additionalProperties: false,
        },
        async execute(raw: unknown) {
          const args = (raw ?? {}) as {
            filePath?: string;
            mode?: "sections" | "global";
            sort?: "alpha" | "none";
            write?: boolean;
          };
          const resolved = dot(args.filePath);
          const result = await formatEnvFile({
            file: resolved.absolutePath,
            mode: args.mode,
            sort: args.sort,
            write: args.write === true,
          });
          return {
            content: JSON.stringify(
              {
                file: resolved.displayPath,
                mode: result.mode,
                sort: result.sort,
                willWrite: result.willWrite,
                wrote: result.wrote,
                hasChanges: result.hasChanges,
                issues: result.issues,
              },
              null,
              2,
            ),
          };
        },
      });

      editor.add({
        name: "reorder",
        description: "Alias for envsitter_format.",
        input: {
          type: "object",
          properties: {
            filePath: { type: "string" },
            mode: { type: "string", enum: ["sections", "global"] },
            sort: { type: "string", enum: ["alpha", "none"] },
            write: { type: "boolean" },
          },
          additionalProperties: false,
        },
        async execute(raw: unknown) {
          const args = (raw ?? {}) as {
            filePath?: string;
            mode?: "sections" | "global";
            sort?: "alpha" | "none";
            write?: boolean;
          };
          const resolved = dot(args.filePath);
          const result = await formatEnvFile({
            file: resolved.absolutePath,
            mode: args.mode,
            sort: args.sort,
            write: args.write === true,
          });
          return {
            content: JSON.stringify(
              {
                file: resolved.displayPath,
                mode: result.mode,
                sort: result.sort,
                willWrite: result.willWrite,
                wrote: result.wrote,
                hasChanges: result.hasChanges,
                issues: result.issues,
              },
              null,
              2,
            ),
          };
        },
      });

      editor.add({
        name: "annotate",
        description: "Annotate a dotenv key with a comment (no values in output). Dry-run unless `write: true`.",
        input: {
          type: "object",
          properties: {
            filePath: { type: "string" },
            key: { type: "string" },
            comment: { type: "string" },
            line: { type: "integer" },
            write: { type: "boolean" },
          },
          required: ["key", "comment"],
          additionalProperties: false,
        },
        async execute(raw: unknown) {
          const args = (raw ?? {}) as {
            filePath?: string;
            key: string;
            comment: string;
            line?: number;
            write?: boolean;
          };
          const resolved = dot(args.filePath);
          if (args.comment.trim().length === 0) {
            throw new Error("Comment must be a non-empty string.");
          }
          const result = await annotateEnvFile({
            file: resolved.absolutePath,
            key: args.key,
            comment: args.comment,
            line: args.line,
            write: args.write === true,
          });
          return {
            content: JSON.stringify(
              {
                file: resolved.displayPath,
                key: result.key,
                willWrite: result.willWrite,
                wrote: result.wrote,
                hasChanges: result.hasChanges,
                issues: result.issues,
                plan: result.plan,
              },
              null,
              2,
            ),
          };
        },
      });

      editor.add({
        name: "add",
        description: "Add a new key to a dotenv file (fails if key already exists). Dry-run unless `write: true`.",
        input: {
          type: "object",
          properties: {
            filePath: { type: "string" },
            key: { type: "string" },
            value: { type: "string" },
            write: { type: "boolean" },
          },
          required: ["key", "value"],
          additionalProperties: false,
        },
        async execute(raw: unknown) {
          const args = (raw ?? {}) as { filePath?: string; key: string; value: string; write?: boolean };
          const resolved = dot(args.filePath);
          const result = await addEnvFileKey({
            file: resolved.absolutePath,
            key: args.key,
            value: args.value,
            write: args.write === true,
          });
          return {
            content: JSON.stringify(
              {
                file: resolved.displayPath,
                key: result.key,
                willWrite: result.willWrite,
                wrote: result.wrote,
                hasChanges: result.hasChanges,
                issues: result.issues,
                plan: result.plan,
              },
              null,
              2,
            ),
          };
        },
      });

      editor.add({
        name: "set",
        description:
          "Set a key's value in a dotenv file (creates if missing, updates if exists). Dry-run unless `write: true`.",
        input: {
          type: "object",
          properties: {
            filePath: { type: "string" },
            key: { type: "string" },
            value: { type: "string" },
            write: { type: "boolean" },
          },
          required: ["key", "value"],
          additionalProperties: false,
        },
        async execute(raw: unknown) {
          const args = (raw ?? {}) as { filePath?: string; key: string; value: string; write?: boolean };
          const resolved = dot(args.filePath);
          const result = await setEnvFileKey({
            file: resolved.absolutePath,
            key: args.key,
            value: args.value,
            write: args.write === true,
          });
          return {
            content: JSON.stringify(
              {
                file: resolved.displayPath,
                key: result.key,
                willWrite: result.willWrite,
                wrote: result.wrote,
                hasChanges: result.hasChanges,
                issues: result.issues,
                plan: result.plan,
              },
              null,
              2,
            ),
          };
        },
      });

      editor.add({
        name: "unset",
        description:
          "Unset a key's value in a dotenv file (sets to empty string, keeps the key). Dry-run unless `write: true`.",
        input: {
          type: "object",
          properties: {
            filePath: { type: "string" },
            key: { type: "string" },
            write: { type: "boolean" },
          },
          required: ["key"],
          additionalProperties: false,
        },
        async execute(raw: unknown) {
          const args = (raw ?? {}) as { filePath?: string; key: string; write?: boolean };
          const resolved = dot(args.filePath);
          const result = await unsetEnvFileKey({
            file: resolved.absolutePath,
            key: args.key,
            write: args.write === true,
          });
          return {
            content: JSON.stringify(
              {
                file: resolved.displayPath,
                key: result.key,
                willWrite: result.willWrite,
                wrote: result.wrote,
                hasChanges: result.hasChanges,
                issues: result.issues,
                plan: result.plan,
              },
              null,
              2,
            ),
          };
        },
      });

      editor.add({
        name: "delete",
        description:
          "Delete key(s) from a dotenv file entirely (removes the line). Dry-run unless `write: true`.",
        input: {
          type: "object",
          properties: {
            filePath: { type: "string" },
            keys: { type: "array", items: { type: "string" } },
            write: { type: "boolean" },
          },
          required: ["keys"],
          additionalProperties: false,
        },
        async execute(raw: unknown) {
          const args = (raw ?? {}) as { filePath?: string; keys: string[]; write?: boolean };
          const resolved = dot(args.filePath);
          const result = await deleteEnvFileKeys({
            file: resolved.absolutePath,
            keys: args.keys,
            write: args.write === true,
          });
          return {
            content: JSON.stringify(
              {
                file: resolved.displayPath,
                keys: result.keys,
                willWrite: result.willWrite,
                wrote: result.wrote,
                hasChanges: result.hasChanges,
                issues: result.issues,
                plan: result.plan,
              },
              null,
              2,
            ),
          };
        },
      });

      editor.add({
        name: "help",
        description:
          "Get comprehensive help on all EnvSitter tools. Call this to understand how to safely work with .env files without exposing secrets.",
        input: {
          type: "object",
          properties: { topic: { type: "string", enum: [...helpTopics] } },
          additionalProperties: false,
        },
        async execute(raw: unknown) {
          const topic = ((raw ?? {}) as { topic?: string }).topic ?? "all";
          if (topic === "all") return { content: [overview, reading, matching, mutations, fileOps].join("\n---\n") };
          const sections: Record<string, string> = { overview, reading, matching, mutations, file_ops: fileOps };
          return { content: sections[topic] ?? overview };
        },
      });
    });

    // Guard: block direct read/edit of sensitive .env files (throw to block).
    await ctx.tool.hook("execute.before", (event: unknown) => {
      const ev = (event ?? {}) as Record<string, unknown>;
      const toolName = typeof ev.tool === "string" ? ev.tool : undefined;
      const input = (ev.input ?? ev.args) as unknown;
      const filePath = getFilePathFromArgs(input);
      if (!filePath) return;
      if (!isSensitiveDotEnvPath(filePath) && !isEnvSitterPepperPath(filePath)) return;
      if (toolName === "read") {
        throw new Error(
          "Reading `.env*` is blocked to prevent secret leaks. " +
            "Use EnvSitter tools instead (never prints values). " +
            "Call envsitter_help for comprehensive usage guide.",
        );
      }
      if (toolName === "edit" || toolName === "write" || toolName === "patch" || toolName === "multiedit") {
        throw new Error(
          "Editing `.env*` and `.envsitter/pepper` via standard tools is blocked. " +
            "Use EnvSitter mutation tools: envsitter_add, envsitter_set, envsitter_unset, envsitter_delete. " +
            "Call envsitter_help for comprehensive usage guide.",
        );
      }
    });
  },
});
