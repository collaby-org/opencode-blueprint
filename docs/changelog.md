# Changelog

Dated entry per change. Newest first. Every version section corresponds to a
version published to npm; the commit range under each git tag is the source
of the entries. Tags are listed with `git tag` and dated with
`git for-each-ref --sort=creatordate`.

Version 1.0.0 was published to npm but never got a git tag, so it has no tag
range. The npm publish timestamps are UTC and can sit a day earlier than the
commit date of the same version.

## [1.4.0] - 2026-10-20

### Added

- `repo-standards` skill: the baseline every repository carries — `AGENTS.md`,
  `CONTRIBUTING.md`, `CLAUDE.md` (`@AGENTS.md`), a PR template, issue forms,
  `CODEOWNERS`, `dependabot.yml`, `SECURITY.md`, and SHA-pinned CI and
  secret-scan workflows. `standards.mjs --check` verifies a repository;
  `--apply` scaffolds only what is missing and never overwrites a curated
  file. Installs globally with the skills.
- `skill-routing` skill: the routing table, moved out of `AGENTS.md`.

### Changed

- `AGENTS.md` slimmed to the industry-standard shape: hard rules and
  pointers, with the procedures in the skills that own them.
- The versioning and docs flow is explicit: one version line per app or
  workstream, one PR one bump, the changelog of the folder that was worked in,
  and the resolved docs home updated with the change — including a linked
  documentation repository outside the repository.
- Worktrees live on the dedicated worktree drive, never on the system drive
  and never inside the repository's own location.
- `bin/clean.mjs` reclaims package-manager caches, old opencode logs and aged
  temp directories, and never touches the installed plugin tree, a worktree's
  `node_modules`, or anything a live session may be reading.
- The `orchestrator` agent ships in `config/agents/` and installs to
  `~/.config/opencode/agents/`. V2 reads agent markdown from `agents/`; the
  V1 `agent/` directory registered nothing, which is what produced
  `Agent not found: "orchestrator"` in restored sessions.

### Fixed

- The installer never writes through a path that is not a regular file and never
  creates a directory where a user file sits: a shipped file is written file by
  file, a command the user changed is kept and backed up, and a file, a
  directory or a link in the way is kept with a log instead of aborting the
  install half way.
- The installer deploys the shipped files only when they are missing, so a
  user's own copy is never overwritten by the installer. A shipped command
  that changed in a new release therefore lands on a fresh install only;
  delete the file to take the new one. The vendored skills are the exception:
  their shipped files are versioned content and are replaced on every install.
- The report, the pull request comment and the gate message name the real
  reason a review is incomplete: a plan that outran the agent budget reads
  differently from an agent that did not report.
- A duplicate finding keeps the most severe one, so a confident nit can no
  longer erase a blocker and flip the verdict.
- A plan whose chunks outran the agent budget records the overshoot, and the
  reconciler derives it from the plan shape as well, so a chunk without a
  reviewer can never read as a finished review.
- The workflow conflicts the audit found: the rebase now happens before the
  review, `/check review` no longer carries Claude-only model detection and
  no longer writes the gate's report path, the Kodus command and the PR-Agent
  scaffold match the skills they duplicate, and the opencode GitHub skill no
  longer promises workflow files that do not exist.
- `docs/conventions.md` now exists; nine skills referenced it (audit, architect,
  check, debug, develop, document, scope, sync, test).

## [1.3.5] - 2026-10-20

### Fixed

- The gate reads the session directory from `session.location.directory` or
  `session.directory`, and extracts the session id from every shape the hook
  event can carry, so a worktree or a second project is checked against its
  own artifact instead of the plugin's load directory.
- `reviewCoversHead` no longer defaults to the server working directory: the
  root is required, so the gate can never consult the wrong checkout.
- The status tool no longer reports `via: "head"` when both heads are null.
- On Windows, a UNC or over-long checkout path is retried with the extended
  path prefix instead of being reported as "not a git repository".

## [1.3.4] - 2026-10-20

### Fixed

- The gate reads `ctx.location.directory` — the V2 setup context has no
  `ctx.directory` — and resolves the session's location per invocation, so a
  worktree checks its own `.git/code-review/last-result.json` instead of the
  project's. When no location can be resolved it fails closed with a named
  error instead of falling back to the server working directory.

## [1.3.3] - 2026-10-20

### Fixed

- The gate resolves the project root from the plugin context instead of
  `process.cwd()`, which points at the opencode config home when the server
  starts outside the checkout. `gh pr create` now finds
  `.git/code-review/last-result.json` and the per-repo `.opencode/review.json`;
  before this, the gate reported "no review artifact" even after a clean run.

## [1.3.2] - 2026-10-20

### Fixed

- Review gate: a bare `$VAR` in command position (`$GH pr create`,
  `RUNNER=gh; $RUNNER pr create`) now resolves to the same fail-closed
  `__subst__` path as `${VAR}` and `$(...)`, including behind wrappers.
  The probe matrix is 95/95.
- `plan-review.mjs` records the reviewer count from the skill's dispatch rule
  (`chunks x passes` when it fits the level budget, otherwise one agent per
  chunk capped at the budget) instead of a fixed 1/2, so `reconcile-review.mjs`
  cannot report `complete` when a pass never reported.

## [1.3.1] - 2026-10-20

Review fixes for 1.3.0. The branch lands as 1.3.5.

### Fixed

- Review gate: `timeout`, `nice`, `setsid`, `stdbuf`, `flock`, `chrt`,
  `ionice`, `taskset`, `doas` and `pkexec` no longer hide `gh pr create`;
  `flock -c` payloads are parsed. `CODE_REVIEW_SKIP=1`, the third escape
  hatch, is documented in the plugin header, the skill and `AGENTS.md`.
- Installer repoints keep the `mcp-env` wrapper and `@NAME@` placeholders for
  postgres, mongodb, redis and google-analytics; kubernetes no longer gets the
  HTTP-only `--log-file` flag.
- `reconcile-review.mjs` derives the expected reviewer count from the plan and
  fails closed instead of accepting a missing findings file.
- `post-review.mjs` reports a broken or unauthenticated `gh` as a failure, not
  as "no PR".
- `mcp-env.mjs` lets a non-empty exported variable win over a stale `.env`
  line, so credential rotation works.
- `kodus.yml` pins checkout and setup-node to commit SHAs.
- Redis MCP uses `@REDIS_URL@`: the host expands `{env:REDIS_URL}` to an empty
  string before the wrapper starts.
- Restored the `orchestrator` agent definition (`config/agent/orchestrator.md`)
  so sessions and slim task sessions that reference it drain instead of
  failing with `Agent not found: "orchestrator"` when slim runs with
  `setDefaultAgent: false`.

### Changed

- `develop` and `scope` wording: the PR opens at the bump-matrix bump; each
  later change bumps the patch.

## [1.3.0] - 2026-10-20

Local code review gate, versioned docs flow, and the MCP and cleanup fixes.
Published to npm and tagged from the merge commit.

### Changed

- `opencode-mem` is a path plugin now (`config/plugins/opencode-mem`, a
  wrapper that re-exports `opencode-mem/v2`), and the package is pinned in the
  config home (`<config>/package.json`, `opencode-mem@2.32.0`). The Bun loader
  resolves bare imports from `<config>/node_modules`, not from the plugin
  directory, so a tree next to the wrapper is invisible to it — that, plus an
  incomplete cache install missing `@libsql/client` and
  `@huggingface/transformers` after an `ENOSPC`, is why the plugin failed with
  `Cannot find package`. The `plugin` array lists only `oh-my-opencode-slim`
  from npm now, and the duplicate 864 MB tree under `plugins/opencode-mem` was
  removed.

### Added

- Versioned docs flow in `AGENTS.md` and the skills. Every project resolves its
  own docs home (`docs/`, an app-level `docs/`, a linked vault such as
  `Obsidian-Documentation*`, or `.workflow/` for a published site) and its own
  version line. A feature PR opens a minor; each change while it is open bumps
  the patch; the changelog entry is written in the same commit as the change.
  Code without its docs entry is not done. Full protocol in the `document`
  skill, `reference/versioning.md`.
- The local code review gate is wired end to end. New `code-review` skill
  (`/code-review`) with three scripts and three reference files:
  `plan-review.mjs` resolves the scope, classifies files, and splits the diff
  into 40k-token chunks with one diff file per chunk; reviewer agents run on a
  model from a different family than the author; `reconcile-review.mjs`
  applies the confidence gate (80), drops findings outside the changed lines,
  dedupes, caps at 32, and writes `docs/reviews/` plus a state file;
  `post-review.mjs` keeps one sticky comment per pull request, updated in
  place, dry run by default.
- New `opencode-code-review` plugin: registers the `/code-review` command and
  its orchestrator agent, exposes a read only `code_review_status` tool, and
  blocks `gh pr create` until a complete review of the current HEAD returns
  `approve` or `approve-with-nits`. Draft PRs pass, and
  `enforce_pr_gate: false` in `review.json` is the explicit escape.
- `.github/workflows/kodus.yml` and `.github/workflows/pr-agent.yml`: the
  GitHub side gates as the last resort. Both skip their review step while
  `KODUS_TEAM_KEY` and `LLM_API_KEY` are absent, so a fresh repository never
  goes red before it is configured.
- `bin/clean.mjs`: reports the caches a development loop accumulates and, with
  `--apply`, deletes package-manager caches (npm, Yarn, pnpm, pip, uv) and
  review scratch directories older than a day. The first run freed 5.8 GB. It
  never touches the OpenCode plugin tree (`~/.cache/opencode`), worktree
  `node_modules`, or anything a running session reads: a cache written in the
  last ten minutes is reported as in use and skipped. Removing the plugin tree
  is what forced a slow reinstall and widened the restore window behind
  `Agent not found: orchestrator`, so that path no longer exists.
- Local MCP servers that need a secret go through `<config>/tools/mcp-env.mjs`,
  which loads `<config>/.env` and expands `@NAME@`/`{env:NAME}` itself.
  OpenCode expands placeholders from its own process environment, so
  `DATABASE_URL` reached the Postgres server as an empty string and it died on
  `new URL("")`; Redis and MongoDB had been silently using localhost defaults.
- The GitHub MCP entry authenticates with a PAT header (`GITHUB_TOKEN` in the
  user environment): the remote endpoint does not support dynamic client
  registration, so OAuth could never complete. The Kubernetes entry is disabled
  until a kubeconfig context exists — the server exits immediately without one.

- `AGENTS.md` now requires worktrees under `F:\worktrees\<repo>\<branch>`
  (never inside the repository, never on the system drive), sends every change
  through a pull request instead of a direct commit to `main`, and keeps the
  system drive above ~15 GB with the cleanup above.

## [1.2.7] - 2026-10-20

### Added

- The installer now installs the local MCP servers as pinned packages under
  `<config>/tools/` and repoints each entry in `opencode.jsonc` at the copy on
  the installing machine: `prisma@7.10.1`,
  `@modelcontextprotocol/server-postgres@0.6.2`, `mongodb-mcp-server@3.1.0`,
  `kubernetes-mcp-server@0.0.67` (the platform package for the current
  machine) and `analytics-mcp==0.7.0` in a venv.
- The skills step resolves a Node runtime of its own, requires Node >= 22.20,
  and puts it first on `PATH` for the duration of the install loop.
- The installer mirrors the Claude `disable-model-invocation: true` flag into
  the OpenCode `metadata.opencode/autoinvoke: "false"` key for 11 user
  invoked skills, so those skills never fire against the workflow gates.
- Three more skill sources are installed: `cathrynlavery/diagram-design`,
  `heygen-com/hyperframes` and `mattpocock/skills`.
- The repository now carries living docs under `docs/`: changelog, system
  diagram, targets, roadmap, tech stack and project doc.

### Changed

- `config/opencode.jsonc` runs the local MCP servers from absolute paths
  instead of `npx` and `pipx run`.
- `config/.env.example` describes the pinned local installs instead of the
  `npx` and `pipx run` invocations it used to name.
- `AGENTS.md` routes `diagram-design` and the HyperFrames set, and lists the
  agent process skills.
- `README.md` states 119 skills and adds the diagram, video and agent process
  rows to the skill table.
- The `package.json` description skill count was corrected from 94 to 119.
- The installer copies `.env.example` to `.env` (copy-if-missing) so the
  `{env:...}` placeholders resolve instead of expanding to empty strings.

### Fixed

- The Kodus team key was removed from the vendored `kodus-review` skill and
  replaced with a placeholder. It was committed to this repository, so it must
  be rotated on the Kodus side — deleting the file does not un-leak it.
- `README.md` no longer claims `files` hygiene in the published tarball; the
  package has no `files` field and ships everything not gitignored.
- The installer's usage comment named the package `development-base`.

## [1.2.6] - 2026-10-17

### Fixed

- The `rea` MCP runs as an absolute `node.exe` plus the installed
  `rea.mjs` instead of being resolved through `npx`.

## [1.2.5] - 2026-10-16

### Changed

- `config/opencode.jsonc` reports 22 MCPs and describes the local v2 plugin
  ports.

### Fixed

- The DCP plugin restored the synthetic flag on injected parts after the host
  was verified to keep them out of chat while still sending them to the model.
- The DCP plugin runtime pin went back to `^1.18.32`.
- The slim plugin ships `setDefaultAgent: false` and the installer copies that
  file only when it is missing.

## [1.2.4] - 2026-10-16

### Added

- The vendored DCP plugin picked up upstream fixes: tokenizer, tag cleanup,
  tool id collisions, argument handling, slash commands, media handling and
  pending message reset.

## [1.2.3] - 2026-10-16

### Changed

- The design system skill content was refreshed.

## [1.2.2] - 2026-10-16

### Fixed

- The `rea` MCP got the `mcp` subcommand, and the Prisma server was pinned to
  a local Prisma 7 install.

## [1.2.1] - 2026-10-16

### Changed

- The plugin runtime moved to 1.19 and the installer brings in `pipx` for the
  analytics MCP.

## [1.2.0] - 2026-10-14

### Added

- The `rea` reverse engineering MCP plus its companion skills.

## [1.1.1] - 2026-10-13

### Added

- A Windows GUI installer built with Inno Setup 6.

### Changed

- The design system skill was refreshed and the agents redesign rule added,
  taking the skill set to 90.

## [1.1.0] - 2026-10-13

### Added

- All plugins are vendored in the repository, six of them ported to the
  opencode v2 plugin API.

### Fixed

- `opencode-review` was migrated to the v2 plugin format and the stale npm
  plugins were dropped.
- The six ported plugins import a resolvable `@opencode-ai/plugin` path.
- The review plugin registers its commands through `editor.add`.
- The synthetic flag on DCP injected parts was reverted after the host was
  found to drop those parts.
- The installer vendors the review test, the DCP production dependency and
  the central fallback dependency.
- The package description skill count was corrected from 44 to 88.

### Changed

- The README was refreshed for the v2 ports, the installer scope and the
  known limits.

## [1.0.2] - 2026-10-03

### Added

- The workflow is synced to the global `AGENTS.md`, with 88 skills including
  the vendored workflow skills.

## [1.0.1] - 2026-09-30

### Added

- The design system, living docs and global `AGENTS.md` rules were added to
  the repository.

### Fixed

- The config syncs to the global config home, the GCP MCPs are disabled, and
  the full `.env` template ships.

## [1.0.0] - 2026-09-27

Published to npm without a git tag, from the commit `e43469a`.

### Added

- The first release of the blueprint: one command opencode setup with 21
  MCPs, 10 plugins, 44 skills, and the Kodus and PR-Agent loops.
- The npm compatible bin path used for publishing.
