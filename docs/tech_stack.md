# Tech Stack

Versions read from the manifests in this repository, not from memory. Where a
version is not pinned anywhere in the repository, that is stated.

## Package

| Item | Value | Source |
|---|---|---|
| npm name | `opencode-blueprint` | `package.json` |
| Version | 1.2.6 | `package.json` |
| Module type | `module` | `package.json` |
| Bin entry | `opencode-blueprint` -> `bin/setup.mjs` | `package.json` |
| License | MIT | `package.json` |
| Author | Collaby Labs | `package.json` |
| Repository | `github.com/collaby-org/opencode-blueprint` | `package.json` |
| Node engines field | not declared | `package.json` has no `engines` |
| `scripts` | none | `package.json` has no `scripts` |
| `files` allowlist | none | `package.json` has no `files` |

The package is on npm as `opencode-blueprint`, with 1.2.6 as the latest
published version. The published versions are 1.0.0, 1.0.1, 1.0.2, 1.1.0,
1.1.1, 1.2.0, 1.2.1, 1.2.2, 1.2.3, 1.2.4, 1.2.5 and 1.2.6. Git holds a tag
for every one of them except 1.0.0, which was published from the commit
`e43469a` with no tag. Verified against the npm registry on 2026-10-20.

## Runtimes

| Runtime | Requirement | Where it comes from |
|---|---|---|
| Node.js | >= 22.20 for the skills step | `NODE_MIN_SKILLS` in `bin/setup.mjs`; the skills CLI (>= 1.7) imports `fs/promises.glob` |
| Node.js | >= 20.19 for the local MCP servers | `NODE_MIN_MCP` in `bin/setup.mjs`; Prisma 7 and mongodb-mcp-server 3 engines |
| Node.js | >= 20.12 for the `rea` MCP | `NODE_MIN` in `bin/setup.mjs`; rea-agents 6.5.0 needs `node:util` `styleText` |
| Python | 3 for `redis-mcp-server` and the analytics venv | `bin/setup.mjs` step 5/6; a missing Python only warns and skips |
| Git | required | `bin/setup.mjs` step 1/6 |
| npm and npx | required | `bin/setup.mjs` step 1/6 |
| `gh` | optional | `bin/setup.mjs` step 1/6 warns when missing |
| Inno Setup 6 | only to build the Windows GUI installer | `installer/build.mjs`, `ISCC` env var overrides the compiler path |

The installer picks a Node runtime itself: nvm-for-windows directories under
`%LOCALAPPDATA%\nvm`, then `C:\Program Files\nodejs\node.exe`, then the
runtime running the installer. The skills step puts the chosen runtime's
directory first on `PATH` for the duration of the install loop.

The opencode host is not installed by this repository. The vendored plugins and
the README were verified against opencode **2.0.24**.

## Plugin runtime

| Item | Version | Source |
|---|---|---|
| `@opencode-ai/plugin` central fallback | `^1.19.1` | written into the config home `package.json` by `bin/setup.mjs` |
| `@opencode-ai/plugin` per ported plugin | `^1.19.1` | `config/plugins/*/package.json`, the 8 ported trees |
| `@opencode-ai/plugin` in the vendored DCP copy | `^1.18.32` (runtime), `>=1.18.29` (peer), `^1.18.29` (dev) | `config/plugins/opencode-dcp/package.json` |
| `opencode-mem` | `2.32.0` | `<config>/package.json` dependencies (the Bun loader resolves bare imports from `<config>/node_modules`); `config/plugins/opencode-mem` is the path wrapper that re-exports `opencode-mem/v2` |
| `oh-my-opencode-slim` | not pinned | `config/opencode.jsonc` lists the bare npm name |

The eight ported plugin trees export the plugin through `define` from the
resolvable `@opencode-ai/plugin/v2/promise` subpath. The vendored DCP copy
keeps the upstream entry points and imports the bare `@opencode-ai/plugin`
root, at its own `^1.18.32` pin. The `code-review` skill's scripts are plain
ESM (`node:child_process` only) and run on Node 18 or newer, which keeps them
usable under the host runtime.

## Vendored DCP copy

Vendored from `@tarquinen/opencode-dcp` **3.2.0** (AGPL-3.0-or-later), with
`LICENSE`, `README.md`, `lib/` and `dist/` in the repository.

| Dependency | Version |
|---|---|
| `@opencode-ai/sdk` | `^1.4.3` |
| `@opentui/core` | `^0.4.5` |
| `@opentui/solid` | `^0.4.5` |
| `solid-js` | `^1.9.12` |
| `@anthropic-ai/tokenizer` | `^0.0.4` |
| `jsonc-parser` | `^3.3.1` |
| dev `@opencode/plugin` | `^2.0.4` |
| dev `@opencode/theme` | `^2.0.4` |
| dev `typescript` | `^6.0.2` |
| dev `tsup` | `^8.5.1` |
| dev `tsx` | `^4.21.0` |
| dev `prettier` | `^3.8.1` |
| dev `@types/node` | `^25.5.0` |
| override `@babel/core` | `7.29.7` |
| override `esbuild` | `0.28.1` |

The installer runs `npm install --omit=dev --legacy-peer-deps` for this tree, so
the runtime keeps the 0.4.x `@opentui/core` the TUI entry was built against.

## MCP servers

22 entries in `config/opencode.jsonc`: 15 remote and 7 local. 17 are enabled,
the 5 Google remote servers are disabled.

Remote endpoints:

| Key | URL |
|---|---|
| `notion` | `https://mcp.notion.com/mcp` |
| `github` | `https://api.githubcopilot.com/mcp/` |
| `context7` | `https://mcp.context7.com/mcp` |
| `gcp-bigquery` | `https://bigquery.googleapis.com/mcp` (disabled) |
| `gcp-compute` | `https://compute.googleapis.com/mcp` (disabled) |
| `gcp-gke` | `https://container.googleapis.com/mcp` (disabled) |
| `gcp-run` | `https://run.googleapis.com/mcp` (disabled) |
| `gcp-storage` | `https://storage.googleapis.com/storage/mcp` (disabled) |
| `cloudflare` | `https://mcp.cloudflare.com/mcp` |
| `supabase` | `https://mcp.supabase.com/mcp` |
| `stripe` | `https://mcp.stripe.com` |
| `figma` | `https://mcp.figma.com/mcp` |
| `sentry` | `https://mcp.sentry.dev/mcp` |
| `expo` | `https://mcp.expo.dev/mcp` |
| `lucide-animated` | `https://lucide-animated.com/mcp` |

Local servers, with the package the installer puts in the config home
`tools/` directory:

| Key | Package | Version |
|---|---|---|
| `rea` | `rea-agents` | `6.5.0` |
| `prisma` | `prisma` | `7.10.1` |
| `postgres` | `@modelcontextprotocol/server-postgres` | `0.6.2` |
| `mongodb` | `mongodb-mcp-server` | `3.1.0` |
| `kubernetes` | `kubernetes-mcp-server` | `0.0.67` (platform package for the installing machine) |
| `google-analytics` | `analytics-mcp` (PyPI, in a venv) | `0.7.0` |
| `redis` | `redis-mcp-server` (pip, unpinned) | not pinned |

The released 1.2.6 installer only pinned `rea` this way and left `prisma`,
`postgres`, `mongodb`, `kubernetes` and `google-analytics` on `npx` and
`pipx run`. The pinned installs for those five are working tree changes, see
the Unreleased section of the changelog.

## CLIs

| Tool | Install | Version |
|---|---|---|
| Kodus CLI | `npm install -g @kodus/cli` | not pinned |
| skills CLI | `npx -y skills add ...` | not pinned; the code assumes >= 1.7 |
| redis-mcp-server | `python -m pip install redis-mcp-server` | not pinned |

## Providers and models

Configured in `config/opencode.jsonc`, all through
`@ai-sdk/openai-compatible` except the `opencode` provider.

| Provider | Base URL | Models |
|---|---|---|
| `tokenharbor` | `https://tokenharbor.ai/v1` | `th-orchestra`, `muse-spark-1-3`, `deepseek-v4.1-flash:free`, `deepseek-v4-flash:free`, `mimo-v2.5:free` |
| `omnirouter` | `http://localhost:20128/v1` | `auto` |
| `opencode` | opencode Zen, key from `{env:OPENCODE_ZEN_API_KEY}` | `muse-spark-1.3-contributor-free` |

Default model: `opencode/muse-spark-1.3-contributor-free`.

### Stream compatibility (opencode 2.x)

`opencode.jsonc` carries a second provider block, `providers` (plural), which
is the v2-native key. It holds only compatibility overrides, because an entry
there patches the provider the host already knows instead of replacing it — the
`nvidia` entry applies whether nvidia was added through the desktop settings or
by the installer, and the catalog is left untouched (verified through
`GET /api/model`: 23 nvidia models after the override).

```jsonc
"providers": {
  "nvidia": {
    "compatibility": { "requireFinishReason": false },
    "settings": { "chunkTimeout": 600000 }
  }
}
```

`requireFinishReason` defaults to `true` and only v2 reads it. With `true`, a
streamed OpenAI-compatible response that ends without a terminal
`finish_reason` frame fails the turn with
`OpenAI Chat stream ended without finish_reason`, classification
`incomplete-stream`, and is retried. The frame is missing after a bare EOF, a
`[DONE]` with no reason-bearing chunk, only `finish_reason: null` chunks, or a
`choices: []` usage-only tail. Reasoning models and long generations are the
usual trigger, and a compaction summary is the largest request a session makes.

`chunkTimeout` is the inter-chunk timeout, 300000 ms by default; a reasoning
model that thinks for longer than that is aborted into the same error.

Trade-off: `requireFinishReason: false` accepts the stream and synthesizes
`stop`, so a genuinely truncated reply is reported as complete. opencode's own
compaction still catches a summary that hits the output cap (`length`), but a
hard cut is silent. The stricter alternative is to pin compaction to a model
that always sends the frame, with `agents.compaction.model`.

The singular `provider` block above is deprecated in v2. Its schema is
`additionalProperties: false` without `compatibility`, so an override written
there is dropped silently; it stays only because the three
`@ai-sdk/openai-compatible` entries still declare `npm` and `options`.

## Skills

| Item | Count | Source |
|---|---|---|
| Registry sources | 18 | `SKILLS` in `bin/setup.mjs` |
| Individually named skills | 85 | counted from the same list |
| Whole repository installs | 5 | `coleam00/excalidraw-diagram-skill`, `pbakaus/impeccable`, `emilkowalski/skills`, `Leonxlnx/taste-skill@design-taste-frontend`, `shadcn-ui/ui@shadcn` |
| Vendored workflow skills | 16 | `skills/` in this repository |
| Total | 119 | stated in `README.md` |

The 5 whole repository installs are not enumerated in the repository, so the
total of 119 cannot be derived from the source alone. 85 named plus 16
vendored is 101, and the remainder comes from those 5 repositories. The
`package.json` description says 94 skills in the released 1.2.6 and 119 in
the working tree.

## Target operating systems

| Platform | Status |
|---|---|
| Windows | the verified target: nvm-for-windows discovery, `.exe` handling for the redis, analytics and kubernetes servers, and the Inno Setup GUI installer |
| macOS and Linux | the installer carries branches for the darwin and linux packages of `kubernetes-mcp-server` and for the POSIX venv layout, but no run on those platforms is recorded in this repository |

## Databases and storage

None in this repository. The blueprint installs client side MCP servers and
the credentials for the databases they talk to: Postgres, MongoDB, Redis,
Google Analytics and Kubernetes.

## Secrets handling

`config/.env.example` holds placeholders only. `config/opencode.jsonc` reads
values through `{env:VAR_NAME}`. The `.gitignore` excludes `.env` and
`.env.local`.

Two machine specific absolute paths are committed in the tracked config, for
the author's own machine: the local MCP server paths under
`C:\Users\horgh\.config\opencode\tools\...` and `C:\Program Files\nodejs\node.exe`.
The installer rewrites the `command` array of every local MCP entry on the
installing machine, so these are placeholders that get replaced, not
universal values. `installer/build.mjs` also carries a default compiler path
under `C:\Users\horgh\AppData\Local\Programs\Inno Setup 6\ISCC.exe`, which the
`ISCC` environment variable overrides.

One credential shaped value was committed and has been removed from the
working tree: `skills/kodus-review/SKILL.md` line 31 held a Kodus team key.
It is still in git history, so it has to be rotated, not just deleted. The
value is not reproduced here.
