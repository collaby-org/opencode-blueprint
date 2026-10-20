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
   `/check verify` drives the real app against the spec here, alongside
   `evidence-driven-testing` and `before-and-after` evidence. `/test` runs
   after implementing or changing code and owns the suite for uncommitted
   changes.
   Then the **local code review gate** (`/code-review`, see below) on a model
   from a different family than the author, then the **Kodus loop** (see
   below). That order is fixed: nothing commits until both are clean.
4. **Ship — proof, polish, review.** PR body carries before/after evidence
   and `version: before → after`,
   `/unslop` cleans all human-read text, `opencode-review` (`/review`)
   auto-fixes code findings, PR-Agent (`/pr-agent`) and Kodus review comments
   go to zero. Present the PR URL. Do not merge unless told to. Keep the
   worktree until merge/close. Every repo gets the PR-Agent Action once via
   `/pr-agent-setup` (see [PR-Agent preset](#pr-agent-preset)).
   After the PR opens, sync the local review artifact to it
   (`post-review.mjs --apply`, one sticky comment that updates in place).
   `/check review` runs here too — the quick single-pass read after verify,
   before PR prose; it does not replace `/code-review`.
   `/document` drafts PR text / changelog / release-note / postmortem
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

## Docs and versions (always)

Every project carries its own documentation home and its own version. They
live with the project, never only in this blueprint, in chat, or in a private
vault.

- **Resolve the docs home first.** Use the home the project already has:
  `docs/`, the app's `<app>/docs/` in a monorepo, or the linked documentation
  repository / vault (`Obsidian-Documentation*`, `Documentation/`, `.docs/`).
  When `docs/` is a published docs site, the workflow base is `.workflow/`
  (same base as `/scope`, `/architect`, `/develop`). Nothing exists: create
  `docs/`. A vault mirror is a copy; the repo copy is the source of truth and
  ships in the same PR.
- **Read the version before work.** Manifest (`package.json`,
  `composer.json`, `pyproject.toml`, `*.csproj`, …) or `docs/VERSION`; no
  version → start at `1.0.0`. Every app or workstream that ships on its own
  (frontend, API, mobile) has its own line.
- **One PR, one bump.** Feature or architecture PR → minor (`1.2.0` →
  `1.3.0`); fix, docs or chore → patch; breaking → major. Each change made
  while the PR is open bumps the patch (`1.3.1` … `1.3.35`), so the PR lands at
  the highest patch. Bump the manifest and write the changelog line in the same
  commit as the change.
- **Update before you stop.** End of PR and every pause: changelog entry per
  change, roadmap status, spec marked correct / incorrect / deferred, decisions
  recorded. The PR body states `version: before → after`. Code without its docs
  entry is not done.
- **Release from the merged commit.** Tag `v<version>` only after merge, notes
  copied from the changelog section. Full protocol: `document` skill,
  `reference/versioning.md`.

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
| Diagrams / architecture | `diagram-design` (branded HTML/SVG diagrams), `excalidraw-diagram` |
| Video / motion output | `hyperframes` first (router — it selects the workflow), then its core set; `pr-to-video` for a PR, `product-launch-video` for a URL, `faceless-explainer` for text, `general-video` for anything else. Needs the `hyperframes` CLI (Node >= 22) |
| Slow screen / perf issue | `perf-debug` |
| New DB, console, API keys | `prisma-postgres-setup`, `prisma-postgres` |
| API design / contract | `api-designer`, `graphql-architect` |
| Realtime / sockets | `websocket-engineer` |
| JS/TS code | `javascript-pro`, `typescript-pro` |
| E2E / browser testing | `playwright-expert` |
| Security review / hardening | `secure-code-guardian`, `security-reviewer` (→ Kodus gate) |
| Legacy modernization | `legacy-modernizer` |
| Reverse-engineer a function/feature/app | `reverse-engineer-anything` (+ `rea` MCP) — understanding or rebuilding a feature from a shipped app/binary, reimplementing a function based on one, comparing versions. Skip for ordinary source analysis (use normal repo tools) |
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
| Local review gate (ours) | `code-review` (→ `/code-review`, mandatory before commit) |
| Code review input | `code-reviewer` (→ `kodus-review` / `/review`) |
| Docs from diff | `code-documenter` (→ `/document` + living-docs) |
| Full-stack guardrail | `fullstack-guardian` |
| Agent process / authoring | `writing-for-agents` (skills + AGENTS.md), `domain-modeling` (GLOSSARY/ADR), `research` (cited notes), `handoff` (session handoff), `retro` (retro on the agent's environment), `grilling` / `grill-me` / `grill-with-docs` (relentless interview), `pr` (PR body), `ask-matt` (skill router) |
| Later, not day-one (only with that surface) | `kubernetes-specialist`, `terraform-engineer`, `microservices-architect`, `mcp-developer`, `monitoring-expert` |

Bar: match the skill to the repo's ACTUAL pinned versions in `tech_stack.md` — never apply latest idioms to legacy code (adapt down or ask).

User-invoked only (OpenCode `autoinvoke: false`): `ask-matt`, `grill-me`, `grill-with-docs`, `handoff`, `retro`, `prototype` — load them only when the user asks for that flow, never spontaneously.

Ours own the gates (`architecture-designer`→`/architect`, `feature-forge`→`/scope`, `spec-miner`→`/audit`, `debugging-wizard`→`/debug`, `test-master`→`/test`, `code-review`→`/code-review`, `code-reviewer`→`kodus-review`/`/review`, `security-reviewer`→Kodus gate, `code-documenter`→`/document` + living-docs) — their content is input/checklist only. Later group: load only when the repo actually has that surface.

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
explicit substantial-redesign intent → REDESIGN (brief → audit → proposal → conflict-resolved replacement);
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

- One worktree + one branch per task/agent, created under
  `F:\worktrees\<repo>\<branch>` — never inside the repository directory,
  never on the system drive. Never touch another agent's worktree, branch, or
  uncommitted work.
- Scope check first: `gh pr list`, `gh pr diff <n> --name-only`.
- Never commit to `main`: every change lands through a pull request (branch →
  PR → review → merge), and releases are tagged from the merged commit. Never
  plain `--force`; `--force-with-lease` on your own branch only. Regenerate
  lockfiles, never hand-merge.
- Worktrees don't isolate ports or databases — confirm the dev-server port
  answers your process; no schema experiments on shared DBs.
- Memory (`opencode-mem`) captures durable facts automatically; don't
  re-derive decided conventions. Costs roll into `opencode-telemetry`.
- Conflicts you can't resolve confidently: stop and report.

## Disk hygiene (always)

- Keep the system drive above ~15 GB free. It fills silently: npm, Yarn and
  pnpm caches, pip/uv wheels, OpenCode plugin caches and orphaned worktree
  `node_modules` trees are the usual 60+ GB.
- After any install-heavy step, reclaim: `node bin/clean.mjs` reports what is
  safe to delete, `node bin/clean.mjs --apply` deletes package-manager caches
  (npm, Yarn, pnpm, pip, uv) and review scratch older than a day. The plugin
  install tree (`~/.cache/opencode`) and worktree `node_modules` are never
  deleted by it: a running session may be reading them.
- One copy of a dependency tree, never two. A plugin the loader resolves from
  `<config>/node_modules` gets no local `node_modules` of its own.
- Delete the worktree once its branch is merged, and say so in the report.
  Deleting the worktree removes its `node_modules`; do it only after the merge
  and only when no session is using that worktree.

## Local code review gate (always)

After `/check verify`, before the Kodus loop and before every commit, load the
`code-review` skill and run `/code-review`: several reviewer agents in
parallel, always on a model from a different family than the one that wrote
the code, chunked for a 200k context window, confidence gated at 80, findings
only. It is mandatory, not a second opinion.

- The `opencode-code-review` plugin registers the command and blocks
  `gh pr create` until a complete review of the current HEAD returns
  `approve` or `approve-with-nits`. Three deliberate escapes, nothing else: a
  draft PR; `enforce_pr_gate: false` in `.opencode/review.json`; and
  `CODE_REVIEW_SKIP=1 gh pr create ...` for a single command. The verdict
  reason names the escape that applied.
- The reviewer never edits code. Findings go to the implementer, then the
  review reruns, at most twice. A third failed round goes to the human.
- After the PR opens, sync the result with
  `node <skill>/scripts/post-review.mjs --apply`: one sticky comment, updated
  in place, naming the commit it reviewed. No inline comments from local line
  numbers.
- GitHub Kodus and PR-Agent stay the last resort after this gate, not a
  substitute. A clean GitHub run does not excuse skipping the local review.

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
The Kodus and PR-Agent GitHub workflows are the last resort, outside OpenCode:
a second net for security and bugs the local gate missed. They never replace
`/code-review`, and the local gate never replaces them.

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
4. Code review gate to clean (`/code-review`, cross model), then Kodus loop to clean, commit (conventional commits), rebase on `origin/main`, rerun checks.
5. Push, open PR, sync the review comment (`post-review.mjs --apply`), then `/check review`, then `/document`; `/unslop` on title + body.
6. `/review` + `/pr-agent` + Kodus to zero comments. Present the PR URL.
7. `/sync` is HUMAN-ONLY — agents must NEVER invoke it on their own, only
   when the user explicitly authorizes it in that same task. Never
   auto-chain it after `/document` or merge.
   One lock covers `/sync`,
   `/audit`, and any other skill that edits `AGENTS.md`: never without
   explicit user authorization in that same task, never auto-chained.
