# Global Agent Workflow

Every task moves through the same four beats. Adapted from
[michaelshimeles/skills AGENTS.md](https://github.com/michaelshimeles/skills/blob/main/AGENTS.md)
for this setup (Kodus, not Greptile) and the globally installed skills,
plugins, and MCPs below. Drop project-specific commands, checks, and
invariants into the repo's own `AGENTS.md`; this file governs everywhere.

## Workflow

1. **Isolate — `new-feature`.** Established projects only: every feature
   starts in a fresh Git worktree branched from `origin/main` so agents work
   in parallel without conflicts. Never build on `main`. Skip this for new
   apps (no branches needed) and for platform/technology migrations.
2. **Build — `code-structure` + stack skills.** Actions/boundaries own the
   why/when, a service layer owns the reusable how (explicit inputs,
   structured returns). Load the stack skills for the target (see
   [Skill routing](#skill-routing)). Reusable components always — check
   existing code and the shadcn registry before writing new UI.
3. **Prove — `evidence-driven-testing`.** Repo checks plus runtime evidence.
   Capture **before** while reproducing (cheapest moment), **after** once it
   works. UI proof via `before-and-after`; numbers/output pairs otherwise.
   Then the **Kodus loop** (see below) — nothing commits until it is clean.
4. **Ship — proof, polish, review.** PR body carries before/after evidence,
   `/unslop` cleans all human-read text, `opencode-review` (`/review`)
   auto-fixes code findings, PR-Agent (`/pr-agent`) and Kodus review comments
   go to zero. Present the PR URL. Do not merge unless told to. Keep the
   worktree until merge/close. Every repo gets the PR-Agent Action once via
   `/pr-agent-setup` (see [PR-Agent preset](#pr-agent-preset)).

## Kodus loop

After implementing, before committing — every time:

1. Run `kodus review --prompt-only` (or `/kodus-review`).
2. Analyse every finding.
3. Fix all valid findings.
4. Run the repo's tests.
5. Re-run the review. Repeat until no high/critical issues remain
   (`--fail-on error` exits 0).
6. Only then commit/push.

Requires the Kodus CLI (`npm install -g @kodus/cli`) and auth
(`kodus auth login` or `KODUS_TEAM_KEY` env with a team key from
app.kodus.io/organization/cli-keys). Skipped only when the CLI is missing
— then say so and continue without it, never fake the review.

Two backends (default is Cloud):

- **Cloud (default):** CLI talks to `api.kodus.io`; models are chosen in
  the Kodus dashboard.
- **Self-hosted local orchestrator** (`kodustech/kodus-ai` via Docker):
  point the CLI at it with `KODUS_API_URL=http://localhost:3001`, and give
  the backend its model via `.env`:
  `API_OPEN_AI_API_KEY=<key>` + `API_OPENAI_FORCE_BASE_URL=<public or
  `host.docker.internal` URL — containers can't see host `localhost`> +
  `API_LLM_PROVIDER_MODEL=<exact model id>`.
  Warnings: needs Docker + pnpm; grabs ports 3000/3001/5432/27017/5672
  (collide with local dev databases — remap or stop them first);
  anonymous telemetry heartbeat is on unless
  `KODUS_TELEMETRY_DISABLED=true`; local quickstart is dev-mode, production
  follows the generic-vm guide.

## Skill routing

Load the skills matching the target. Nothing else.

| Building | Load |
|---|---|
| Next.js frontend | `nextjs-best-practices`, `vercel-react-best-practices`, `shadcn`, `impeccable`, `apple-design`, `animate` |
| Landing / marketing page | `design-taste-frontend`, `impeccable`, `shadcn` |
| Animations / motion | `animate` (web), `animate-expo` (Expo), `animation-vocabulary` to name effects, `review-animations` / `improve-animations` / `find-animation-opportunities` for QA |
| Component work | `emil-design-eng`, `shadcn`, `pick-ui-library`, `prototype` (variants picker) |
| NestJS API | `nestjs-best-practices`, `nextjs-nestjs-integration` |
| Prisma / Postgres | `prisma-database-setup`, `prisma-client-api`, `prisma-cli`, `prisma-postgres`, `prisma-postgres-setup`, `prisma-upgrade-v7`, `prisma-mongodb-upgrade` (+ `postgres`, `prisma` MCPs) |
| MongoDB / Redis | `mongodb`, `redis` MCPs (+ `prisma-mongodb-upgrade` where Prisma is involved) |
| Kubernetes | `kubernetes` MCP (needs kubeconfig) |
| Expo mobile | `expo-overview` first, then `expo-router`, `expo-native-ui`, `expo-data-fetching`, `expo-upgrade`, `eas-app-stores`, `eas-workflows`, `eas-update`, `animate-expo` (+ `expo` MCP) |
| Tauri desktop | `tauri-v2` |
| Diagrams / architecture | `excalidraw-diagram` |
| Slow screen / perf issue | `perf-debug` |
| New DB, console, API keys | `prisma-postgres-setup`, `prisma-postgres` |

## UI rules (always)

- **Icons: Lucide only.** Static: `lucide-react`. Animated: lucide-animated
  via shadcn registry —
  `npx shadcn@latest add "https://lucide-animated.com/r/<icon>.json"`
  (kebab-case, drops into `components/icons/`). Browse via the
  `lucide-animated` MCP (`search_icons`, `get_icon`) or
  https://lucide-animated.com/icons/llms.txt. Never hand-roll SVGs, never
  emoji, one icon family per project.
- **Components: shadcn first.** Compose existing components and variants
  (`npx shadcn@latest search` before building custom). Magic UI and
  Aceternity UI are allowed — both are shadcn-compatible registries. Never
  ship default-state shadcn; theme with semantic tokens, no raw colors,
  no `space-x/y` (use `gap`), `size-*` for squares.
- **Motion is invisible or it ships without.** Animate `transform` and
  `opacity` only, UI stays under 300ms, ease-out for enter, custom curves,
  springs for gestures, `prefers-reduced-motion` honored. Purpose every
  animation or drop it. Match motion to mood (crisp dashboard, playful
  marketing).
- **Bar:** Apple-clean, user-first, every button and step feels inevitable.
  Full UI states (loading skeletons matching layout, empty, error, active
  press feedback), WCAG AA contrast, dark mode from the start, hero fits
  viewport, one accent color, one radius scale, mobile collapse explicit.

## Design system (always)

Every codebase with UI must carry a `/design-system` folder. Adapt its
contents to the stack in `tech_stack.md` — the shape below assumes
Next.js + Tailwind + shadcn; an Expo app gets native tokens/components
instead. Never force the example onto a mismatched stack.

- **Check first.** At the start of every UI task, check `/design-system`
  exists and read `DESIGN_SYSTEM.md` + the `ai/` registry before designing.
- **Create if missing — ask first.** If absent, ask the user which source
  to build from: analyse the existing codebase, images / links / live
  previews they provide, or both — then create it. Be very, very accurate
  to the chosen source.
- **Follow it.** New components must reuse existing ones, use design tokens
  exclusively (semantic tokens per UI rules — never raw colors or hardcoded
  palettes), and load the task-matching skills from Skill routing
  (`shadcn`, `apple-design`, `animate`, `impeccable`, …).
- **Shape (adapt per stack):** `README.md`, `DESIGN_SYSTEM.md`,
  `tokens/` (colors, typography, spacing, radius, shadows, motion + index),
  `components/<Name>/` (component, types, stories, docs, index),
  `patterns/` (forms, dashboards, navigation, tables, empty-states,
  responsive-layouts), `pages/`, `ai/` (`RULES.md`, `COMPONENT_MAP.json`,
  `DESIGN_TOKENS.json`, `PAGE_PATTERNS.json`, `VALIDATION.md`),
  `components.json`.
- **Build protocol.** Inspect the page → search the registry → reuse
  components → apply page patterns → tokens only → responsive check →
  validate → fix → re-validate. Do not create a new component unless
  necessary; when one is, document it, register it, add stories + tests.
- **Document composition, not just components** (page → sections →
  components with assembly rules), give real examples, and keep validation
  deterministic — never make the AI decide what the system already defines.

## Data & backend rules

- Prisma: migrations via `prisma` MCP (`migrate-dev`), never hand-edit
  applied migrations; `$transaction` for multi-writes; raw SQL only when
  Prisma can't express it or changes complexity class.
- Parameterized queries always. No destructive SQL without confirmation.
- `.env*` is blocked by `envsitter-guard` — use its tools, never paste
  secrets. Pasted logs are auto-sanitized (JWT/bcrypt/base64 redacted).

## PR-Agent preset

PR-Agent (Qodo community edition) reviews every PR automatically once the
repo carries `.github/workflows/pr-agent.yml` + `.pr_agent.toml`.

- New repo? Run `/pr-agent-setup` first: it asks for the LLM base URL +
  exact model ID + key, scaffolds both files, and stores the key as
  `LLM_API_BASE` / `LLM_API_KEY` GitHub secrets (repo or org scope).
  Secrets are secret-references only — the key NEVER lands in a file.
  The endpoint must be publicly reachable (GitHub runners can't see
  localhost); default is official OpenAI.
- Every PR: `/pr-agent <url-or-number>` — post `/review`, fix actionable
  findings, re-trigger until clean. `/improve` and `/ask` available as PR
  comments for targeted help.
- You can also comment directly on the PR: `/review`, `/improve`, or
  `/ask <question>` (e.g. `/ask Could this introduce a race condition?`).
  PR-Agent answers in GitHub comments; fold its findings into the same
  fix loop.
- PR-Agent findings and Kodus comments share one bar: zero unresolved
  before presenting the PR URL.

## Multi-agent rules

- One worktree + one branch per task/agent. Never touch another agent's
  worktree, branch, or uncommitted work.
- Scope check first: `gh pr list`, `gh pr diff <n> --name-only`.
- Never commit to `main`. Never plain `--force`; `--force-with-lease` on
  your own branch only. Regenerate lockfiles, never hand-merge.
- Worktrees don't isolate ports or databases — confirm the dev-server port
  answers your process; no schema experiments on shared DBs.
- Memory (`opencode-mem`) captures durable facts automatically; don't
  re-derive decided conventions. Costs roll into `opencode-telemetry`.
- Conflicts you can't resolve confidently: stop and report.

## Global AGENTS.md (always)

The repo's `AGENTS.md` must always match the global one
(`~/.config/opencode/AGENTS.md`, sourced from this blueprint).

- **Check first.** At the start of every task, check the repo has `AGENTS.md`.
- **Copy if missing.** If it does not exist, copy the global file in as-is.
- **Replace if different.** If it exists, compare it with the global file —
  if not identical, replace it with the global version. Never leave a
  diverged `AGENTS.md` behind.

## Living docs (always)

Every repo must carry these five files at its root (or per app, if monorepo):
`changelog.md`, `system_diagram.md`, `targets.md`, `roadmap.md`, `tech_stack.md`.

- **Check first.** At the start of every task, check whether each file exists
  and read every one that does — before planning, not after.
- **Create if missing.** If any file is absent, create it by analysing the
  actual codebase (code, configs, manifests, migrations — never guess).
  Be very, very accurate: every entry must reflect what is really there.
- **Update after each task.** After every individual task, update all five:
  what changed, what is now true, what is next. Keep them tight, clean,
  and very accurate — short factual lines, no filler, no aspirational claims.
  Stale docs are a bug: never leave them behind the code.
- **Contents:** `changelog.md` = dated entries per change (with app scope in
  multi-app repos); `system_diagram.md` = real architecture and data flow
  (mermaid ok); `targets.md` = current acceptance criteria and their status;
  `roadmap.md` = sequenced next steps, checked off as done; `tech_stack.md` =
  actual runtimes, frameworks, DBs, and versions in use.
- **Versions.** Bump the app version when the change warrants it (fix →
  patch `0.1.0` to `0.1.1`, feature → minor, breaking → major). In a
  multi-app codebase (e.g. 3 apps), version and changelog each app
  independently — bump only the app(s) that changed, when you judge it is
  time, and record the bump in that app's `changelog.md`.

## Completing a task

1. Stay scoped to the task. Small Ralph loops (`/ralph-loop`) for
   well-defined, verifiable work.
2. Run the repo's checks.
3. Before/after evidence assembled.
4. Kodus loop to clean (no high/critical), then commit (conventional
   commits — feeds the release plugin), rebase on `origin/main`, rerun
   checks.
5. Push, open PR: what changed, how tested (every claim evidenced),
   before/after proof, risks/follow-ups. `/unslop` on title + body.
6. `/review` + `/pr-agent` + Kodus to zero comments. Present the PR URL.
