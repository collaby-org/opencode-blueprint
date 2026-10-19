# System Diagram

How the system is put together and where the data moves. Paths are the real
ones from `bin/setup.mjs` and `config/opencode.jsonc`.

Two directories matter after an install:

- config home: `OPENCODE_CONFIG_HOME`, otherwise `~/.config/opencode`
  (on Windows `%USERPROFILE%\.config\opencode`)
- skills home: `~/.agents/skills`

## Install flow

```
   this repository                      npm registry
   (collaby-org/opencode-blueprint)     opencode-blueprint@1.2.6
   bin/setup.mjs  <--------------------- tarball, downloaded by npx
        |
        |  npx opencode-blueprint          (--dry-run prints only)
        v
   +---------------------------------------------------------------+
   |  bin/setup.mjs                                                 |
   |                                                               |
   |  1/6 prerequisites   node, npx, git  (gh, python, pipx warn)  |
   |  2/6 config files    backup + copy                            |
   |  3/6 plugin deps     npm install per plugin tree               |
   |  4/6 skills          skills add + vendored copies             |
   |  5/6 CLIs and tools  kodus cli, redis, pinned local MCPs      |
   |  6/6 manual steps    printed, not automated                   |
   +---------------------------------------------------------------+
        |                        |                       |
        | copy                   | npm install            | npx skills add
        v                        v                       v
   config home              config home/tools        skills home
   opencode.jsonc           rea-agents/               <skill>/
   AGENTS.md                prisma/                  (18 registry sources
   commands/                postgres-mcp/             + 16 vendored copies)
   plugins/ (8 trees)       mongodb-mcp/
   .env.example             kubernetes-mcp/
   package.json             analytics-mcp/.venv/
        |
        | "command": [...] arrays rewritten in place, per machine
        v
   config home/opencode.jsonc now points every local MCP at a path
   that exists on this machine
```

Details of what lands where:

```
   config home
   |
   +-- opencode.jsonc          copied from config/opencode.jsonc, then the
   |                           "command" array of each local MCP entry is
   |                           rewritten. The rewrite only touches that array,
   |                           so the comments in the file survive.
   +-- AGENTS.md               copied from the repo root. The global workflow.
   +-- commands/               kodus-review.md, pr-agent-setup.md, pr-agent.md
   +-- plugins/                opencode-review, opencode-dcp,
   |                           opencode-github-release, opencode-telemetry,
   |                           opencode-ralph-wiggum, envsitter-guard,
   |                           opencode-log-sanitizer, opencode-command-inject
   +-- tools/                  rea-agents, prisma, postgres-mcp, mongodb-mcp,
   |                           kubernetes-mcp, analytics-mcp (.venv)
   +-- package.json            gets "@opencode-ai/plugin": "^1.19.1" merged in
   +-- .env.example            copied only when missing, never overwritten
   +-- .bak-<timestamp>        backup of opencode.jsonc and AGENTS.md
```

## Runtime

```
   opencode host (2.0.24) starts
        |
        | reads config home/opencode.jsonc once, at startup
        v
   +---------------------------------------------------------------+
   | provider        tokenharbor https://tokenharbor.ai/v1         |
   |                 omnirouter http://localhost:20128/v1          |
   |                 opencode   Zen, key from OPENCODE_ZEN_API_KEY |
   | default model   opencode/muse-spark-1.3-contributor-free      |
   | instructions    AGENTS.md                                     |
   +---------------------------------------------------------------+
        |
        +--> plugins (2 from npm, 8 from the local plugins/ folder)
        |      opencode-mem            long term memory, vector recall
        |      oh-my-opencode-slim     7 agent orchestration
        |      opencode-dcp            context pruning, vendored 3.2.0
        |      opencode-review         /review, review and review:fixer agents
        |      opencode-telemetry      /telemetry-report, /telemetry-inspect
        |      opencode-ralph-wiggum   /ralph-loop, /ralph-continue, /cancel-ralph
        |      opencode-github-release version bump, tag and publish
        |      envsitter-guard         .env inspection that never prints secrets
        |      opencode-log-sanitizer  redacts secrets at the prompt boundary
        |      opencode-command-inject discovers project commands
        |
        +--> MCP clients
               |
               +--> 15 remote servers over HTTPS
               |      notion, github, context7, cloudflare, supabase, stripe,
               |      figma, sentry, expo, lucide-animated
               |      gcp-bigquery, gcp-compute, gcp-gke, gcp-run, gcp-storage
               |      (disabled until an OAuth client is configured)
               |
               +--> 7 local servers, started as child processes
                      rea             -> tools/rea-agents/.../rea.mjs mcp
                      prisma          -> tools/prisma/.../prisma/build/index.js mcp
                      postgres        -> tools/postgres-mcp/.../server-postgres/dist/index.js
                      mongodb         -> tools/mongodb-mcp/.../dist/esm/index.js --readOnly
                      kubernetes      -> tools/kubernetes-mcp/.../kubernetes-mcp-server-<platform>
                      google-analytics-> tools/analytics-mcp/.venv/.../analytics-mcp
                      redis           -> <python scripts dir>/redis-mcp-server --url
```

The local servers read their connection details from the environment, so the
session looks like this:

```
   user session
        |
        |  agent reads instructions from AGENTS.md
        |  skills loaded from ~/.agents/skills
        v
   plugin hooks  --->  context pruning, memory, telemetry, sanitizing
        |
        |  tool calls
        v
   MCP client  --->  remote HTTPS endpoint  --->  vendor service
             |
             +------>  local child process  --->  Postgres, MongoDB, Redis,
                                                    Google Analytics, Kubernetes
```

Credentials never travel through the config file: `opencode.jsonc` only holds
`{env:VAR_NAME}` placeholders, and the values live in `.env` in the config
home or in the shell environment.

## Review loops

```
   local worktree
        |
        | /kodus-review  ->  kodus review --prompt-only --fail-on error
        v
   Kodus CLI (@kodus/cli)
        |
        +--> cloud:  api.kodus.io            (models chosen in the dashboard)
        |
        +--> self hosted: kodustech/kodus-ai in Docker
              KODUS_API_URL=http://localhost:3001
              API_OPEN_AI_API_KEY, API_OPENAI_FORCE_BASE_URL,
              API_LLM_PROVIDER_MODEL
              uses ports 3000, 3001, 5432, 27017, 5672
        |
        v
   findings -> agent fixes them -> re-run until the loop exits 0
        |
        v
   pull request in the user's own repository
        |
        | /pr-agent  ->  gh pr comment "<PR>" --body "/review"
        v
   PR-Agent Action (.github/workflows/pr-agent.yml, scaffolded by
   /pr-agent-setup in that repository, key stored as a GitHub secret)
        |
        +--> LLM endpoint, default https://tokenharbor.ai/v1
              model muse-spark-1-3
```

The blueprint repository itself has no `.github` directory and no workflow
files, in its history or on `origin/main`. The PR-Agent Action belongs to the
repositories that use the blueprint.

## Windows GUI installer

```
   node installer/build.mjs
        |
        | reads package.json version, runs ISCC with /DAppVersion=<version>
        v
   installer/opencode-blueprint.iss   (Inno Setup 6)
        |
        v
   installer/Output/opencode-blueprint-setup-<version>.exe
        |
        | not committed, distributed through GitHub Releases
        v
   on the target machine
        |
        | deploys AGENTS.md, opencode.jsonc, commands\, plugins\,
        | .env.example into the config home, with .bak-<timestamp> backups
        | then runs, hidden:
        |     npx -y opencode-blueprint@<version>
        | output goes to {tmp}\obp-setup.log, tailed by the progress page
        v
   same config home and skills home as the terminal installer
```

The GUI installer never deletes the live opencode config: its files carry the
`uninsneveruninstall` flag, and the uninstall step removes nothing from the
config home.

## Node runtime selection

```
   bin/setup.mjs probes, in order, and sorts by version descending
        |
        +-- %LOCALAPPDATA%\nvm\v<major>.<minor>.<patch>\node.exe
        +-- C:\Program Files\nodejs\node.exe
        +-- the node running the installer (process.execPath)
        |
        +-- skills step      needs >= 22.20, wins PATH for that step
        +-- local MCP step   needs >= 20.19, writes that path into the config
        +-- rea MCP step     needs >= 20.12, writes that path into the config
```
