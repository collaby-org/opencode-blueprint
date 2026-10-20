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
- [ ] Release the local code review gate and the versioned docs flow as 1.3.2:
  the `code-review` skill, the `opencode-code-review` plugin, the two GitHub
  workflows, the `AGENTS.md` docs/version rules and the skill updates are in
  the working tree. Done when the tag exists, a fresh install loads the plugin
  (`/code-review` present, `gh pr create` gated) and the docs rule is enforced
  on the next project.
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
