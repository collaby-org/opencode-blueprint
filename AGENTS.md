# Global Agent Workflow

Every task moves through four beats. This file governs everywhere; project
specifics go in the repo's own `AGENTS.md`. Skills carry the procedures; this
file carries the rules and the pointers.

## Workflow

1. **Isolate — `new-feature`.** Established projects only: every feature
   starts in a worktree branched from `origin/main`, on the same drive as the
   repository (`D:\Work\worktrees\<repo>\<branch>` for a repository on `D:`) —
   never on the system drive (C:) unless the repository itself lives there,
   and never inside the repository's own location. Never build on
   `main`. New builds and
   migrations start at `/scope` first (new build → `/scope` then
   `/new-feature`; migration → `/scope` then the plan). When project context
   is missing or stale, `/audit` runs first — HUMAN-ONLY: never invoke it
   without explicit authorization in that same task.
2. **Build — `/develop` + stack skills.** Load the stack skills and
   `code-structure`; check existing code and the shadcn registry before new
   UI. A load-bearing decision that is unmade → `/architect` writes the spec
   in `docs/specs/` first. UI work loads `design-system` before styling.
   `/debug` for a failing test, a failed `/check verify`, or wrong behavior:
   minimal fix, regression test to `/test`.
3. **Prove.** Repo checks (`/test` owns the suite), runtime evidence,
   `/check verify` against the spec, before/after via `before-and-after`.
   Then, in this order: **Kodus loop** on the staged diff → **commit** →
   **rebase on `origin/main`** → rerun checks → **local code review gate**
   on the final HEAD. Nothing commits before Kodus is clean; nothing ships
   before the review is clean. If any later step changes code, rerun the
   review — the gate rejects a stale HEAD.
4. **Ship.** Push the branch to the remote and open a pull request: a pull
   request that only exists on this machine is not done. Every change lands
   through a new PR — never a direct commit or push to `main`. Fill the PR with
   evidence and `version: before → after`, sync the review comment, update the
   living docs and the changelog of the folder worked in (the same-commit rule
   is in Docs and versions), then `/document` and `/unslop`. `/check review` is
   an optional single quick read; it never replaces `/code-review`. The bar
   for the review comments is in the PR-Agent preset. Merging is
   the human's decision: never merge unless told. Keep the worktree until
   merge, delete it after.
   `/sync` is HUMAN-ONLY: never invoke it without explicit authorization in
   that same task, never auto-chained.

## Repo standards (always)

Every repo carries `AGENTS.md`, `CONTRIBUTING.md`, `CLAUDE.md` (exactly
`@AGENTS.md`), and the `.github` set: a PR template with evidence and
`version: before → after`, issue forms, an active `CODEOWNERS`,
`dependabot.yml`, `SECURITY.md`, and SHA-pinned CI and secret-scan
workflows. Check with
`node ~/.agents/skills/repo-standards/scripts/standards.mjs --check .`;
scaffold only missing files with `--apply`, never overwrite curated ones.
Adapt values to the project; unresolved values stay `TODO:` and are listed.

## Global AGENTS.md (always)

The repo's `AGENTS.md` must match the global one
(`~/.config/opencode/AGENTS.md`, sourced from this blueprint). Check first.
If it is missing or different, copy/replace it only with the user's explicit
authorization in that same task — ask first, never do it on its own. Never
leave a diverged `AGENTS.md` behind. AI never edits it without consent.

## Docs and versions (always)

Resolve the docs home once, before the work starts, and use it for the whole
change: the repository's `docs/`, the app's `<app>/docs/`, the linked
documentation repository or vault (`Obsidian-Documentation*`,
`Documentation/`, `.docs/`), or `.workflow/` when `docs/` is a published site.

Versions: every app or workstream that ships on its own (frontend, API,
mobile, worker) has its own version line, in its own manifest or
`docs/VERSION`; none → `1.0.0`. One PR, one bump, on the version line of the
folder the PR touches: feature or architecture → minor, fix, docs or chore →
patch, breaking → major. Every further change while that PR is open bumps the
patch on that same line. The bump and the changelog entry land in the same
commit as the change.

Changelog: the entry goes to the changelog of the folder that was worked in —
`docs/changelog.md` for repo-level work, `<app>/docs/changelog.md` for one app
in a monorepo, and the resolved docs home when it lives outside the
repository. Not one global file for everything. If the resolved docs home is
outside the repository, the change updates it as well, in the same PR or in a
linked PR against that documentation repository; the repository copy stays the
source of truth and the mirror moves with it. A change that edited code and
left the resolved docs home untouched is not done.

End of PR and every pause: that folder's changelog, the roadmap, the spec
status, the decisions. Tag `v<version>` only from the merged commit. Full
protocol: `document` skill, `reference/versioning.md`.

## Living docs (always)

Every repo carries `docs/changelog.md`, `system_diagram.md`, `targets.md`,
`roadmap.md`, `tech_stack.md`, `project-doc.md` (per-app docs in a monorepo).
New project: create and fill as you go. Existing with files: read all before
planning. Existing without: implement from codebase analysis, never guess.
Full protocol: `living-docs` skill. Stale docs are a bug.

## Skill routing

Load the `skill-routing` skill and use its table. Load only the skills that
match the target. Match the repo's ACTUAL pinned versions in `tech_stack.md`;
never apply latest idioms to legacy code (adapt down or ask).

## Diagrams and mind maps (always)

A diagram or a mind map is a file in the repository, not a chat answer. Use the
`diagram-design` skill for a diagram and the `mindmap` skill for a concept map:
a Markmap `.md` file in the project's resolved docs home
(`docs/mindmaps/<topic>.mindmap.md`), and the interactive React `.jsx` only when
the user asks for it. Produce one when the structure is the point — a new
subsystem, a plan, a research summary, a handover — and link it from the
document it explains. Never answer a "map this out" request with prose.

## UI rules (always)

Icons Lucide-only; components shadcn-first; motion invisible-or-not;
Apple-clean bar. Full standards live in the `design-system` skill — read
`reference/master-instructions.md` before styling anything.

## Design system (always)

Every codebase with UI carries `design-system/` (root; shared plus per-app in
a monorepo). At the start of every UI task, read `DESIGN_SYSTEM.md` and the
`ai/` registry, then follow the `design-system` skill — it owns the decision
tree and the boundary rules. Stale system docs are a bug.

## Data & backend rules

- Prisma migrations via the `prisma` MCP (`migrate-dev`); never hand-edit
  applied migrations; `$transaction` for multi-writes; raw SQL only when
  Prisma cannot express it or changes complexity class.
- Parameterized queries always. No destructive SQL without confirmation.
- `.env*` is blocked by `envsitter-guard` — use its tools, never paste
  secrets. Pasted logs are sanitized automatically.

## Multi-agent rules

One worktree and one branch per task/agent. Never touch another agent's
worktree, branch or uncommitted work. Scope check first (`gh pr list`, `gh pr
diff <n> --name-only`). Never plain `--force`; `--force-with-lease` on your own
branch only. Regenerate lockfiles, never hand-merge. Worktrees do not isolate
ports or databases — confirm the port answers your process; no schema
experiments on shared DBs. Memory (`opencode-mem`) captures durable facts;
costs roll into `opencode-telemetry`. Unresolved conflict: stop and report.

## Parallel work (always)

Lean sequential by default: most coding work has fewer independent units than
research, and a multi-agent run costs far more. When the change genuinely
partitions, cut it into work units, give every writer one path set, one
worktree and one owner — a shared type, a schema, a generated file, a lockfile
or a migration gets a single owner who lands it first — and let read-only
lanes overlap freely. Write the scope manifest and check it before dispatching
and the result against it afterwards: `node ~/.config/opencode/tools/agents-scope.mjs
--write .agents/lanes.json`, `--check .agents/lanes.json`,
`--verify .agents/lanes.json --changed <file>,<file>`. The
tool is installed globally; inside the blueprint repository the same file is
`bin/agents-scope.mjs`. If it is missing, say so and continue without the
check. The full contract lives in the orchestrator agent.

## Reverse engineering (always)

Every artifact of a reverse engineering session lands in the project being
worked on, under `reversed-engineered/<name>/` — the extracted files, the
notes and the scripts together, one folder per target. Never in a temp
directory, never loose in the repository root, never outside the project. The
REA MCP writes there too. Full convention: `docs/conventions.md`.

## Disk hygiene (always)

Keep the system drive above ~15 GB free; ten sessions may be running at once,
so a cleanup must never break one. `node ~/.config/opencode/tools/clean.mjs`
reports safe deletions; `--apply` removes package-manager caches, old opencode
logs and aged temp directories. It never deletes `~/.cache/opencode` (the
installed plugin tree — removing it is what made plugin-provided agents
disappear and produced `Agent not found: "orchestrator"`), never a worktree's
`node_modules`, and never anything a live session may be reading. One
dependency tree per plugin. Delete a worktree only after its branch is merged
and no session uses it; say so in the report. Inside the blueprint repository
the same tool is `bin/clean.mjs`.

## Local code review gate (always)

After the rebase and before `gh pr create`, load the `code-review` skill and
run `/code-review`: parallel reviewers on a model family different from the
author, 200k chunks, confidence >= 80, findings only, at most two rounds.
The `opencode-code-review` plugin blocks `gh pr create` until a complete
review of the current HEAD returns `approve` or `approve-with-nits`. Three
deliberate escapes, nothing else: draft PR, `enforce_pr_gate: false` in
`.opencode/review.json`, and `CODE_REVIEW_SKIP=1 gh pr create ...` for one
command. The reviewer never edits code; findings go to the implementer.
Sync the result with
`node ~/.agents/skills/code-review/scripts/post-review.mjs --apply` (one sticky
comment). GitHub Kodus and PR-Agent remain the last resort, never a
substitute.

## Kodus loop (always)

Before commit, load `kodus-review` and run its loop on the staged diff:
review → analyse → fix valid → tests → rerun until `--fail-on error` exits 0.
CLI missing → say so, never fake it. Full protocol in the skill.

## PR-Agent preset (always)

After the PR opens, load `pr-agent`: `/review` → fix actionable findings →
re-trigger until clean (`/improve`, `/ask` as needed; bootstrap with
`/pr-agent-setup`, which must use the pinned workflow, never `@main`). Bar:
PR-Agent and Kodus comments to zero before presenting the URL. The GitHub
workflows are a second net, not a replacement for `/code-review`.

## opencode GitHub integration (always)

When a repo carries the opencode GitHub workflow set, load `opencode-github`
for `/oc` mentions, auto review, triage, and scheduled checks. Secrets by
reference only — never a literal key in any file. Do not claim workflows
exist before checking `.github/workflows/`.

## Completing a task

Load the `ship` skill for the full end-of-task protocol; the four beats above
are its order.
