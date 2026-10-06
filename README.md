# OpenCode Blueprint

> One command. A complete, opinionated, production-grade [opencode](https://opencode.ai)
> environment — **21 MCPs, 10 plugins, 88 skills, a global agent workflow,**
> and **Kodus + PR-Agent** review loops. Built for teams shipping
> Apple-clean, award-worthy software.

```bash
npx opencode-blueprint
```

Restart opencode. Create any folder. Start coding.

---

## Why this exists

Setting up an AI coding environment used to mean weeks of trial and error:
which MCP servers, which plugins conflict, which skills are actually S-rank,
how to wire review loops so nothing sloppy ever merges. This repo is the
finished answer — researched, de-duplicated, and verified working together:

- **No conflicts.** Every orchestrator, memory, and design overlap was
  researched and resolved to a single best-of-breed pick.
- **Only proven pieces.** S-rank skills, official vendor integrations,
  high-traction community plugins.
- **A workflow with teeth.** Isolate → Build → Prove → Ship, with a Kodus
  loop gating every commit and PR-Agent gating every merge.

## What's inside

### MCPs (21) — live access

| Area | Servers |
|---|---|
| Project & code | `notion`, `github`, `figma`, `sentry` |
| Docs & design | `context7`, `lucide-animated`, `expo` |
| Data | `supabase`, `prisma`, `postgres`, `mongodb`, `redis` |
| Cloud & infra | `gcp-bigquery`, `gcp-compute`, `gcp-gke`, `gcp-run`, `gcp-storage`, `cloudflare`, `kubernetes` |
| Payments & analytics | `stripe`, `google-analytics` |

### Plugins (4) — runtime superpowers

| Plugin | Job |
|---|---|
| `oh-my-opencode-slim` | 7-agent orchestration (the one orchestrator — swarm/micode/OAC intentionally excluded) |
| `opencode-mem` | Automatic long-term memory with vector recall |
| `@tarquinen/opencode-dcp` | Context pruning (pairs with memory, not against it) |
| `opencode-review` | Auto code-review on idle + `/review` + auto-fix (local install — not on npm) |

> Removed 2026-10-06 until upstream migrates to the v2 `{ id, setup/effect }`
> plugin definition: `opencode-telemetry`, `opencode-ralph-wiggum`
> (`/ralph-loop`), `opencode-github-release`, `envsitter-guard` (`.env` guard),
> `opencode-log-sanitizer`, `opencode-command-inject`.

### Skills (88) — stack knowledge

| Stack | Skills |
|---|---|
| Next.js / React | `nextjs-best-practices`, `vercel-react-best-practices`, `nextjs-nestjs-integration` |
| NestJS | `nestjs-best-practices` |
| Prisma / Postgres | `prisma-database-setup`, `prisma-client-api`, `prisma-cli`, `prisma-postgres`, `prisma-postgres-setup`, `prisma-upgrade-v7`, `prisma-mongodb-upgrade` |
| Expo mobile | `expo-overview`, `expo-router`, `expo-upgrade`, `expo-native-ui`, `expo-data-fetching`, `eas-app-stores`, `eas-workflows`, `eas-update` |
| Tauri desktop | `tauri-v2` |
| Design (all S-rank) | `apple-design`, `animate`, `animate-expo`, `animation-vocabulary`, `emil-design-eng`, `review-animations`, `improve-animations`, `find-animation-opportunities`, `pick-ui-library`, `prototype`, `design-taste-frontend`, `impeccable`, `shadcn` |
| Workflow | `new-feature`, `code-structure`, `evidence-driven-testing`, `before-and-after`, `unslop`, `perf-debug`, `excalidraw-diagram` |
| API design / contract | `api-designer`, `graphql-architect` |
| Realtime / sockets | `websocket-engineer` |
| JS/TS | `javascript-pro`, `typescript-pro` |
| E2E / browser testing | `playwright-expert` |
| Security review / hardening | `secure-code-guardian`, `security-reviewer` |
| Legacy modernization | `legacy-modernizer` |
| Adversarial review | `the-fool` |
| NestJS deep work | `nestjs-expert` |
| Next.js deep work | `nextjs-developer` |
| React UI logic | `react-expert` |
| Postgres tuning | `postgres-pro`, `database-optimizer` |
| DevOps / pipeline | `devops-engineer` |
| Test strategy / suite | `test-master` |
| Gate inputs (commands own the gate) | `architecture-designer` → `/architect`, `feature-forge` → `/scope`, `spec-miner` → `/audit`, `debugging-wizard` → `/debug`, `code-reviewer` → review, `code-documenter` → `/document`, `fullstack-guardian` |
| Later (surface-gated) | `kubernetes-specialist`, `terraform-engineer`, `microservices-architect`, `mcp-developer`, `monitoring-expert` |

### The workflow (`AGENTS.md`, installed globally)

1. **Isolate** — fresh worktree per feature (established projects; skipped for new apps/migrations); `/scope` first for new builds/migrations, `/audit` human-only when context stale.
2. **Build** — `/develop` (+ `code-structure` + stack skills, `design-system` for UI); → `/architect` spec when a decision is owed; `/debug` anytime.
3. **Prove** — runtime evidence (before/after) + `/check verify` vs spec, `/test` owns the suite; then the **Kodus loop** to clean.
4. **Ship** — `/check review`, PR with evidence, `/document`, `/unslop` prose, **PR-Agent + Kodus at zero** (`/sync` human-only, never auto-chained).

Design bar: Apple-clean, invisible motion (`transform`/`opacity`, <300ms,
springs, reduced-motion honored), full UI states, dark mode from day one.

## Quickstart — new machine

```bash
npx opencode-blueprint
```

The installer: checks prerequisites → backs up your existing config →
copies `opencode.jsonc` + `AGENTS.md` + commands → installs the local
plugin's deps → installs all 88 skills globally → installs the Kodus CLI
and `redis-mcp-server` → prints your personal checklist.

Then:

1. `gh auth login` · `kodus auth login` (or `KODUS_TEAM_KEY`).
2. Set env vars (see `config/.env.example`).
3. Restart opencode — config loads once at startup.
4. Per repo, once: `/pr-agent-setup` (scaffolds the PR-Agent Action;
   key stored as GitHub secrets, never in files).

Preview first: `npx opencode-blueprint --dry-run`.

## Commands (global, work in any project)

| Command | Does |
|---|---|
| `/pr-agent-setup` | Scaffolds PR-Agent Action + `.pr_agent.toml`; asks for LLM endpoint, model, key; stores secrets |
| `/pr-agent <pr>` | `/review` → fix → re-review until clean |
| `/kodus-review` | Kodus review-fix loop until no high/critical findings |
| `/ralph-loop "<task>"` | Ralph iteration loop (from plugin) |
| `/review` | On-demand code review (from plugin) |

On the PR itself you can also comment `/review`, `/improve`, or
`/ask <question>` — PR-Agent answers inline.

## Kodus: Cloud vs self-hosted

- **Cloud (default):** CLI → `api.kodus.io`, models chosen in the dashboard.
- **Self-hosted** (`kodustech/kodus-ai`, Docker): point the CLI with
  `KODUS_API_URL`, and give the backend any OpenAI-compatible model via
  `API_OPEN_AI_API_KEY` + `API_OPENAI_FORCE_BASE_URL` +
  `API_LLM_PROVIDER_MODEL`. Heads-up: it grabs ports 3000/3001/5432/27017
  (collide with local dev DBs), containers can't see host `localhost`, and
  telemetry heartbeat is on unless disabled.

## Publishing your own fork to npx

`npx <name>` resolves from the **npm registry**, so the repo must be
published as a package (that's what `package.json` + `bin` are for):

```bash
npm login                    # once per machine
npm publish --access public  # from the repo root, on every release
```

Requirements: unique `name` in `package.json`, a `bin` entry pointing at an
executable script, `npm login` done. After publishing, anyone can run
`npx <your-name>` — npx downloads the tarball to a temp dir and executes
the bin, no install needed. Version with `npm version patch|minor|major`
before each publish. Prefer scoped names (`@your-org/blueprint`) to avoid
squatting collisions — the bin name stays whatever you declare.

Nothing secret is ever published: `.gitignore` + `files` hygiene keep
credentials out (keys live in GitHub secrets and shell env, see
`config/.env.example` for the list).

## Repo layout

| Path | What |
|---|---|
| `AGENTS.md` | Global workflow (source of truth) |
| `config/opencode.jsonc` | 21 MCPs · 9 plugins · instructions |
| `config/commands/` | `/pr-agent`, `/pr-agent-setup`, `/kodus-review` |
| `config/plugins/opencode-review/` | Local review plugin sources |
| `config/.env.example` | Required env vars (values never committed) |
| `bin/setup.mjs` | The installer |

## Contributing

Issues and PRs welcome. Ground rules: no second orchestrators, no duplicate
memory systems, S-rank (or official) skills only, every addition named with
its conflict analysis. Run the Kodus loop + PR-Agent to zero before pushing.

## License

MIT — see [LICENSE](LICENSE).

## Acknowledgments

Workflow adapted from [michaelshimeles/skills](https://github.com/michaelshimeles/skills/blob/main/AGENTS.md).
Design craft: [Emil Kowalski](https://github.com/emilkowalski/skills),
[Leonxlnx](https://github.com/Leonxlnx/taste-skill),
[Impeccable](https://impeccable.style), [shadcn](https://ui.shadcn.com).
Data: [Prisma](https://github.com/prisma/skills), [Expo](https://github.com/expo/skills).
Review: [Kodus](https://github.com/kodustech/cli), [PR-Agent](https://github.com/The-PR-Agent/pr-agent).
