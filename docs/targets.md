# Targets

Acceptance criteria for the blueprint, with the status as it stands on
2026-10-20. "done" means the behaviour is implemented in this repository and
shipped in a tag, unless the line says otherwise. "open" means the work is in
the working tree but not released, or not started. "blocked" means something
outside this repository has to move first.

## Install

- [done] One command sets up the whole opencode environment: `npx
  opencode-blueprint` runs the six installer steps end to end.
- [done] A dry run prints every step and changes nothing: `npx
  opencode-blueprint --dry-run`.
- [done] The installer fails with a clear message when a required tool is
  missing: `node`, `npx` and `git` are required, `gh`, `python` and `pipx`
  only warn.
- [done] The config home is resolved the same way everywhere:
  `OPENCODE_CONFIG_HOME`, otherwise `~/.config/opencode`.
- [done] Existing `opencode.jsonc` and `AGENTS.md` are backed up with a
  `.bak-<timestamp>` suffix before they are overwritten.
- [done] Files that may hold user values are copied only when missing:
  `.env.example` and `oh-my-opencode-slim.jsonc`.
- [done] Files that are versioned content are overwritten: `opencode.jsonc`,
  `AGENTS.md` and `plugins/`.
- [done] Directories that hold shipped files and user files are merged, each in
  its own way: a missing shipped command is written, a command the user changed
  is kept and backed up, and a command the installer did not put there is never
  removed; in the vendored skills the shipped files are versioned content and
  are replaced, while a file the user added is kept.
- [open] Every local MCP entry points at a path that exists on the installing
  machine. The working tree installs and repoints all seven local servers;
  the released 1.2.6 only repointed `redis` and `rea`.
- [done] The installer never deletes the live opencode config. The GUI
  installer marks its files `uninsneveruninstall`.
- [open] The skills step fails loudly when no Node >= 22.20 runtime is
  found, instead of failing later inside `skills add`. Implemented in the
  working tree.

## Config file

- [done] `config/opencode.jsonc` is JSONC: block comments, line comments and
  trailing commas.
- [done] The installer rewrites only the `"command": [...]` array of an MCP
  entry, so the comments and the formatting of the file survive.
- [done] The rewrite is validated before it is written: the result must
  still parse and must carry exactly the array that was intended.
- [done] A failed rewrite leaves the file untouched and prints a warning.
- [done] 22 MCP entries are configured: 15 remote and 7 local, 17 enabled
  and 5 disabled.
- [done] Secret values are never stored in the config: every credential is a
  `{env:VAR_NAME}` placeholder.
- [open] The committed config still carries the absolute paths of one
  machine. The installer rewrites the local MCP entries on install, but a
  config read without running the installer keeps those paths.
- [done] `config/.env.example` holds placeholders only and lists where each
  value comes from.

## Providers and models

- [done] Three providers are configured: Token Harbor, Omni Router on
  `localhost:20128`, and opencode Zen with the key from the environment.
- [done] The default model is `opencode/muse-spark-1.3-contributor-free`.

## Plugins

- [done] Exactly one orchestrator is installed: `oh-my-opencode-slim`.
- [done] Exactly one memory system is installed: `opencode-mem`.
- [done] The slim plugin ships `setDefaultAgent: false` so restored sessions
  are not killed by `Agent not found: "orchestrator"`.
- [done] The local plugin trees load as path plugins. The seven ported trees
  export the plugin through `define` from the resolvable
  `@opencode-ai/plugin/v2/promise` subpath; the vendored DCP copy keeps the
  upstream entry points and imports the bare `@opencode-ai/plugin` root at its
  own pin `^1.18.32`.
- [done] The central fallback dependency `@opencode-ai/plugin@^1.19.1` is
  installed in the config home, because the loader walks up to it.
- [done] The DCP copy is vendored, so the npm entry is not present and the
  plugin is not loaded twice.
- [done] DCP system reminder blocks are relocated into `event.system` and do
  not render as chat bubbles. A local fix, in place of upstream issue 608.
- [blocked] The DCP reminder tag fix lands upstream. The repository carries a
  local patch for upstream issue 608 and waits for the upstream change.
- [open] The idle auto review trigger of `opencode-review` stays unwired. The
  host exposes no v2 hook for it, so there is nothing to wire to yet.

## Skills

- [done] Skills are installed globally for the opencode agent from 18
  registry sources, plus 16 workflow skills vendored in this repository.
- [done] The registry skill list resolves one pick per job: no second
  orchestrator, no duplicate memory system.
- [open] The user invoked skills keep `metadata.opencode/autoinvoke: "false"`
  after every install. The mirror is implemented in the working tree, because
  `skills add` rewrites `SKILL.md` on each run.
- [open] The stated skill count agrees across the repository. The README and
  the `package.json` description both say 119 in the working tree, the
  released 1.2.6 says 94 in the description, and the 5 whole repository
  installs are not enumerated, so 119 cannot be derived from the source.

## Review loops

- [done] The Kodus loop is installed as a global command and as a skill: run
  the review, fix what is valid, run the checks, repeat until
  `--fail-on error` exits 0.
- [done] The PR-Agent command posts `/review` on a pull request and drives
  the findings to zero.
- [done] `/pr-agent-setup` scaffolds the PR-Agent Action and the config file
  in the target repository, and stores the key as a GitHub secret.
- [done] The workflow gates in `AGENTS.md` are explicit: the Kodus loop
  before every commit, PR-Agent and Kodus comments at zero before a merge.
- [done] `/audit` and `/sync` are marked human only and are never chained
  automatically.

## Packaging and documentation

- [done] The package is published to npm under the name `opencode-blueprint`
  with the bin entry `opencode-blueprint` pointing at `bin/setup.mjs`. The
  latest published version is 1.2.6.
- [done] The version in `package.json` matches the newest tag: 1.2.6.
- [open] Every published version has a git tag. Version 1.0.0 was published
  to npm from the commit `e43469a` and never got a tag.
- [done] The Windows GUI installer is built from `installer/opencode-blueprint.iss`
  and distributed through GitHub Releases, not through git.
- [done] The repository carries living docs in `docs/`: changelog, system
  diagram, targets, roadmap, tech stack, project doc.
- [done] No credential value is committed. The Kodus team key in
  `skills/kodus-review/SKILL.md` is a placeholder now; it is still in git
  history and has to be rotated.
- [open] The published tarball is limited by an allowlist. The README no
  longer claims `files` hygiene, but `package.json` has no `files` field, so
  npm ships the whole tree except the paths in `.gitignore`.
- [done] The usage comment at the top of `bin/setup.mjs` names the published
  package.
- [open] This repository has no automated check of its own. `package.json`
  declares no `scripts`, so the review loops are the only gates that run
  here.
