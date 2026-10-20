# Roadmap

Next steps, smallest shippable one first. Items that are blocked say what
blocks them. Checked items are shipped and stay here as the record of what
the last releases delivered.

## Open

- [x] Release the pinned local MCP installs. Shipped in 1.2.7.
- [x] Release the rest of the working tree in the same version: the Node
  >= 22.20 floor for the skills step, the `metadata.opencode/autoinvoke:
  "false"` mirror for the 11 user invoked skills, the three added skill
  sources `cathrynlavery/diagram-design`, `heygen-com/hyperframes` and
  `mattpocock/skills`, and the skill count corrected from 94 to 119 in the
  `package.json` description. Shipped in 1.2.7.
- [x] Release the local code review gate and the versioned docs flow as 1.4.0:
  the `code-review` skill, the `opencode-code-review` plugin, the two GitHub
  workflows, the `AGENTS.md` docs/version rules, the `repo-standards`
  scaffold, the slim `AGENTS.md` and the skill updates are in the working
  tree. Shipped in 1.4.0: PR #4 merged, the tag exists, a fresh install
  loads the plugin (`/code-review` present, `gh pr create` gated), the agent
  file lands in `~/.config/opencode/agents/` and the docs rule is enforced on
  the next project.
- [x] Report the MCP credentials the host is missing (1.4.1) and replace the
  config atomically (1.4.2), so an install can no longer leave the host with
  an empty `opencode.jsonc` and no plugins, MCPs or agents.
- [x] Add the `mindmap` skill and say when a map belongs in a project
  (1.4.2): a Markmap file in the resolved docs home, the interactive React
  file only on request.
- [x] State the worktree and pull request rules (1.4.2): a worktree on the
  repository's own drive, every change through a new pull request with the
  branch pushed, merging the human's decision.
- [ ] Authenticate the hosted MCP servers: `opencode mcp auth cloudflare`,
  `expo`, `figma`, `notion`, `stripe`, `supabase`, and set
  `SENTRY_ACCESS_TOKEN` for sentry. Done when `opencode mcp list` shows every
  server connected and a restarted host still has the token in its process
  environment.
- [ ] Rotate the Kodus team key. It was committed on 2026-10-03 and is in the
  history; the value is out of the file and the fingerprint is ignored by the
  secret scan, but the credential itself is leaked. Also rotate the npm token.
- [ ] Let `bin/clean.mjs` descend one level into `%TEMP%\opencode`, so a stale
  scratch directory is reclaimed on its own age instead of the age of the
  whole temp root.
- [ ] Apply the repo standards and the resolved docs home to the projects
  outside this repository, starting with the Laravel project whose linked
  documentation home was never updated. Done when each project passes
  `standards.mjs --check` and its pull requests update the resolved home.
- [ ] Confirm the standards flow on a repository outside this one.
  `standards.mjs --check` must pass on a project that already carries the
  baseline, and a second `--apply` must change nothing. Done when a project
  outside this repository passes the check and keeps its curated files.
- [ ] Arm the GitHub side gates. `.github/workflows/kodus.yml` and
  `.github/workflows/pr-agent.yml` skip their review step while
  `KODUS_TEAM_KEY` and `LLM_API_KEY` are absent, so nothing goes red before
  the repo is configured. Done when both secrets exist and one pull request
  shows both checks running green.
- [ ] Add a `files` allowlist to `package.json`. The README no longer claims
  `files` hygiene, but npm still ships the whole tree except the paths in
  `.gitignore`, which includes the vendored plugin `dist/` trees.
- [ ] Make the skill count verifiable from the repository. The 5 whole
  repository installs are not enumerated, so the total in the README cannot
  be checked against the source. Done when the count is either derived or
  dropped in favour of a range.
- [ ] Say more than a printed checklist line about the kubeconfig context
  the kubernetes MCP needs. The requirement appears in the AGENTS.md skill
  routing table and in the manual steps of the installer, and nowhere else.
- [ ] Decide whether the published 1.0.0 gets a git tag. It shipped to npm
  from the commit `e43469a` with no tag, so the tag list and the npm
  version list disagree by one.
- [ ] Make the shipped config usable without the installer. The config in
  the repository carries one machine's absolute paths for the local MCP
  servers. The installer rewrites them, but anyone who copies the file by
  hand gets entries that point nowhere.
- [ ] Decide whether this repository needs its own check. `package.json`
  declares no `scripts`, so the Kodus and PR-Agent loops are the only gates
  that can run here.

## Blocked

- [ ] The Kodus team key that was committed in `skills/kodus-review/SKILL.md`
  must be rotated on the Kodus side. The value has been removed from the
  working tree, but it is still in git history, so it has to be treated as
  leaked. Blocked on the account owner.
- [ ] The 5 Google remote MCPs (`gcp-bigquery`, `gcp-compute`, `gcp-gke`,
  `gcp-run`, `gcp-storage`) stay disabled until an OAuth client is
  pre-registered. Google does not offer dynamic client registration, so the
  entries need an OAuth client id and secret, or a bearer header. Blocked on
  that credential.
- [ ] The DCP reminder tag fix lands upstream. The repository carries a
  local patch for upstream issue 608 that relocates the reminder blocks into
  `event.system`. Blocked on the upstream change in
  `Opencode-DCP/opencode-dynamic-context-pruning`.
- [ ] The idle auto review trigger of `opencode-review` gets wired. The
  host exposes no v2 hook for it. Blocked on the host.

## Shipped

- [x] 1.2.6: the `rea` MCP runs from an absolute `node.exe` and the
  installed `rea.mjs` instead of `npx`.
- [x] 1.2.5: the slim plugin ships `setDefaultAgent: false`, the MCP count
  is 22, and the DCP synthetic flag was restored after the host was checked.
- [x] 1.2.4: the vendored DCP copy picked up the upstream fixes for the
  tokenizer, tag cleanup, tool id collisions, arguments, slash commands,
  media and pending reset.
- [x] 1.2.2: the `rea` MCP got the `mcp` subcommand and the Prisma server
  was pinned to a local Prisma 7 install.
- [x] 1.2.0: the `rea` reverse engineering MCP and its companion skills.
- [x] 1.1.1: the Windows GUI installer built with Inno Setup 6, and the
  refreshed design system skill.
- [x] 1.1.0: all plugins vendored in the repository, six of them ported to
  the v2 plugin API, with the central `@opencode-ai/plugin` fallback added to
  the installer.
- [x] 1.0.2: the workflow synced to the global `AGENTS.md`, with the
  vendored workflow skills.
- [x] 1.0.1: the design system, living docs and global `AGENTS.md` rules,
  the GCP MCPs disabled, and the full `.env` template.
- [x] 1.0.0: the first release, published to npm without a git tag.
