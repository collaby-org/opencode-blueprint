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
   New builds and migrations start at `/scope` first — new build →
   `/scope` then `/new-feature` worktree following the scope plan;
   migration → `/scope` then follow the scope plan. `/scope` seeds WHAT,
   not HOW. When project context is missing or stale, run `/audit` first
   (ties to the Global AGENTS.md check) to bootstrap/fill `AGENTS.md`
   before planning.
   `/audit` is HUMAN-ONLY: agents must NEVER invoke
   `/audit` on their own — only when the user explicitly authorizes it in
   that same task. Never auto-chained, never assumed — ask first.
2. **Build — `code-structure` + stack skills.** Actions/boundaries own the
   why/when, a service layer owns the reusable how (explicit inputs,
   structured returns). Load the stack skills for the target (see
   [Skill routing](#skill-routing)). Reusable components always — check
   existing code and the shadcn registry before writing new UI.
   `/develop` is the build step here, alongside `code-structure` + stack
   skills. Any load-bearing decision unmade → `/architect` first: build the
   spec in `docs/specs/` before code (`/develop` gates to `/architect`
   when a decision is owed, otherwise builds from spec + `AGENTS.md`).
   At the start of any UI work, load the `design-system` skill (full rule
   in [Design system](#design-system-always)). `/debug` anytime — failing
   test, failing `/check verify`, wrong behavior; minimal fix, hands the
   regression test to `/test`.
3. **Prove — `evidence-driven-testing`.** Repo checks plus runtime evidence.
   Capture **before** while reproducing (cheapest moment), **after** once it
   works. UI proof via `before-and-after`; numbers/output pairs otherwise.
   Then the **Kodus loop** (see below) — nothing commits until it is clean.
   `/check verify` drives the real app against the spec here, alongside
   `evidence-driven-testing` and `before-and-after` evidence. `/test` runs
   after implementing or changing code and owns the suite for uncommitted
   changes.
4. **Ship — proof, polish, review.** PR body carries before/after evidence,
   `/unslop` cleans all human-read text, `opencode-review` (`/review`)
   auto-fixes code findings, PR-Agent (`/pr-agent`) and Kodus review comments
   go to zero. Present the PR URL. Do not merge unless told to. Keep the
   worktree until merge/close. Every repo gets the PR-Agent Action once via
   `/pr-agent-setup` (see [PR-Agent preset](#pr-agent-preset)).
   `/check review` runs here — fresh-model review after verify, before PR
   prose. `/document` drafts PR text / changelog / release-note / postmortem
   from the real diff after the change is green (runs after the living-docs
   update so prose reflects final docs). `/sync` is HUMAN-ONLY: agents must
   NEVER invoke `/sync` on their own — only when the user explicitly
   authorizes it in that same task. It is the user's personal reconciliation
   step, never auto-chained after `/document` or merge.

## Global AGENTS.md (always)

The repo's `AGENTS.md` must always match the global one
(`~/.config/opencode/AGENTS.md`, sourced from this blueprint).

- **Check first.** At the start of every task, check the repo has `AGENTS.md`.
- **Copy if missing.** If it does not exist, copy the global file in as-is —
  only with the user's explicit authorization in that same task. Ask first,
  never copy on its own.
- **Replace if different.** If it exists, compare it with the global file —
  if not identical, replace it with the global version only with the user's
  explicit authorization in that same task. Ask first, never replace on its
  own. Never leave a diverged `AGENTS.md` behind.
- **Bar.** AGENTS.md must never be edited by AI without user consent.

## Living docs (always)

Every repo carries living docs in `docs/` — `changelog.md`,
`system_diagram.md`, `targets.md`, `roadmap.md`, `tech_stack.md`,
`project-doc.md`. Root `docs/` for single-repo; per-app `docs/` in
monorepo (e.g. `docs/` + `apps/frontend/docs/`, layout follows repo shape).
New project: create + fill as you go. Existing with files: read all before
planning. Existing without: implement from codebase analysis, never guess.
Full protocol lives in the `living-docs` skill — load it whenever touching
living docs. Stale docs are a bug.

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
| API design / contract | `api-designer`, `graphql-architect` |
| Realtime / sockets | `websocket-engineer` |
| JS/TS code | `javascript-pro`, `typescript-pro` |
| E2E / browser testing | `playwright-expert` |
| Security review / hardening | `secure-code-guardian`, `security-reviewer` (→ Kodus gate) |
| Legacy modernization | `legacy-modernizer` |
| Adversarial review | `the-fool` |
| NestJS deep work | `nestjs-expert` (+ `nestjs-best-practices`) |
| Next.js deep work | `nextjs-developer` (+ `nextjs-best-practices`) |
| React UI logic | `react-expert` |
| Postgres / query tuning | `postgres-pro`, `database-optimizer` |
| DevOps / pipeline | `devops-engineer` |
| Test strategy / suite | `test-master` (→ `/test`) |
| Architecture input (ours own the gate) | `architecture-designer` (→ `/architect`) |
| Feature shaping input (ours own the gate) | `feature-forge` (→ `/scope`) |
| Spec mining input (ours own the gate) | `spec-miner` (→ `/audit`, human-only) |
| Debug / failure triage | `debugging-wizard` (→ `/debug`) |
| Code review | `code-reviewer` (→ `kodus-review` / `/review`) |
| Docs from diff | `code-documenter` (→ `/document` + living-docs) |
| Full-stack guardrail | `fullstack-guardian` |
| Later, not day-one (only with that surface) | `kubernetes-specialist`, `terraform-engineer`, `microservices-architect`, `mcp-developer`, `monitoring-expert` |

Bar: match the skill to the repo's ACTUAL pinned versions in `tech_stack.md` — never apply latest idioms to legacy code (adapt down or ask).

Ours own the gates (`architecture-designer`→`/architect`, `feature-forge`→`/scope`, `spec-miner`→`/audit`, `debugging-wizard`→`/debug`, `test-master`→`/test`, `code-reviewer`→`kodus-review`/`/review`, `security-reviewer`→Kodus gate, `code-documenter`→`/document` + living-docs) — their content is input/checklist only. Later group: load only when the repo actually has that surface.

## UI rules (always)

Icons Lucide-only; components shadcn-first; motion invisible-or-not;
Apple-clean bar. Full standards live in the `design-system` skill —
read `reference/master-instructions.md` before styling anything.

## Design system (always)

Every codebase with UI carries a `design-system/` folder (single-repo at
root; monorepo root shared plus per-app, following repo shape).
At the start of every UI task, check it exists and read `DESIGN_SYSTEM.md`
+ the `ai/` registry before designing — then follow the `design-system`
skill: existing non-empty system → ADOPT (follow, extend, never replace);
missing or empty → GENERATE (ask intent first, scaffold from it, TBD over
invention). Tokens → primitives → components → patterns → pages. Never
`@import` design-system CSS across package boundaries — each app
materializes its own copy. Stale system docs are a bug.

## Data & backend rules

- Prisma: migrations via `prisma` MCP (`migrate-dev`), never hand-edit
  applied migrations; `$transaction` for multi-writes; raw SQL only when
  Prisma can't express it or changes complexity class.
- Parameterized queries always. No destructive SQL without confirmation.
- `.env*` is blocked by `envsitter-guard` — use its tools, never paste
  secrets. Pasted logs are auto-sanitized (JWT/bcrypt/base64 redacted).

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

## Kodus loop (always)

After implementing, before committing — every time, load the
`kodus-review` skill and run its loop: review → analyse → fix valid →
tests → re-run until `--fail-on error` exits 0 (local-first: stage first,
`--staged` review of a tiny diff). Full protocol (backends, auth, CLI-missing
fallback) lives in the skill. Bar: nothing commits until clean — CLI missing
→ say so, never fake the review.

## PR-Agent preset (always)

PR-Agent reviews every PR once the repo carries the preset pair — load the
`pr-agent` skill per PR: `/review` → fix actionable findings → re-trigger
until clean (`/improve`, `/ask` as needed; bootstrap via `/pr-agent-setup`
on new repos). Full protocol lives in the skill. Bar: PR-Agent + Kodus
comments to zero before presenting the PR URL.

## opencode GitHub integration (always)

opencode runs in GitHub Actions (`opencode.json` at root + `.github/workflows/`
set) — load the `opencode-github` skill when wiring or invoking it (`/oc`
mentions, auto review, triage, scheduled checks; new-repo bootstrap file set).
Full protocol (workflows, triggers, model lineup + fallback pattern) lives in
the skill. Bar: secrets by reference only — never a literal key value in any file.

## Completing a task

Load the `ship` skill at the end of every task — the full end-of-task protocol lives there.

1. Stay scoped to the task; gates in run order: `/scope` → `/audit` → `/architect` spec → `/develop` (small `/ralph-loop` slices).
   `/audit` is
   HUMAN-ONLY: agents must NEVER invoke `/audit` on their own — only when
   the user explicitly authorizes it in that same task. Never auto-chained,
   never assumed — ask first.
2. Run the repo's checks (`/test` owns the suite; `/debug` on failure, regression test to `/test`).
3. Assemble before/after evidence (`/check verify` against the spec; UI via `before-and-after`).
4. Kodus loop to clean, commit (conventional commits), rebase on `origin/main`, rerun checks.
5. Push, open PR (`/check review`, then `/document`; `/unslop` on title + body).
6. `/review` + `/pr-agent` + Kodus to zero comments. Present the PR URL.
7. `/sync` is HUMAN-ONLY — agents must NEVER invoke it on their own, only
   when the user explicitly authorizes it in that same task. Never
   auto-chain it after `/document` or merge.
   One lock covers `/sync`,
   `/audit`, and any other skill that edits `AGENTS.md`: never without
   explicit user authorization in that same task, never auto-chained.
