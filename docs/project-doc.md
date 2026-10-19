# Project Doc

The decisions behind the blueprint and the reasoning that produced them.
Every claim here is traceable to a file in this repository.

## What it is

OpenCode Blueprint is a one command installer for a complete opencode
environment. It publishes itself to npm as `opencode-blueprint`, and running
`npx opencode-blueprint` copies a configuration file, a global workflow, three
commands and eight plugin trees into the opencode config home, installs the
skills into the global skills folder, installs the Kodus CLI and seven local
MCP servers, and prints the steps that still need a human. The result is an
opencode install that works the same way on every machine, with a review loop
around every commit and every merge.

## Problem

Standing up an AI coding environment by hand takes weeks and leaves the result
in a state nobody can reproduce. The questions are always the same and none of
them have one answer: which MCP servers to enable, which plugins fight each
other, which skills are actually worth having, and how to make sure a sloppy
change never reaches the default branch. Each of those is a decision that
belongs to one person, taken once, and then taken badly on the next machine.

The blueprint removes the decisions. The set is researched, de-duplicated and
verified to work together, and it ships as one command.

## Who it is for

A developer or small team that already uses opencode and wants a working
environment on a new machine without an afternoon of setup. The person is
comfortable with a terminal and a GitHub account, and is willing to supply
their own credentials for the services they use. The blueprint does not
replace opencode, a language model, or a source control host.

## Why it hasn't stuck before

Earlier attempts at this failed in ways this repository recorded and then
fixed. The record is in the commit history and in the comments in
`config/opencode.jsonc`.

- Stacking every plugin that looked useful produced duplicates that fought:
  more than one orchestrator, more than one memory system. The fix was to pick
  one of each and write down the conflict analysis for the excluded ones.
- A plugin can be correct in its own code and still fail inside the host. The
  DCP plugin marked injected parts as synthetic, and the host dropped those
  parts from the model context. The experiment was reverted, then re-tested,
  and the reminder blocks were moved into `event.system` instead.
- Installing a local server through `npx` looks portable and is not. It takes
  whatever `node` is first on `PATH`, a cold install can exit 0 without ever
  handshaking, and a machine wide Node downgrade breaks the server outright.
  The fix is to install the server as a pinned package and write an absolute
  path into the config.
- A skills install that looks fine can still be broken. The skills CLI needs
  a newer Node than the machine happens to have on `PATH`, so every entry in
  the loop fails in the same way. The fix is to resolve a runtime for the
  step and put it first on `PATH` for the duration of the loop.
- A review loop that is described in a document is not a gate. The loop only
  counts when it is a command the agent can run and a bar it cannot commit
  under, which is why both the Kodus loop and the PR-Agent loop ship as
  installed commands.

## The rule everything rests on

One pick per job, and every pick carries its conflict analysis.

A second orchestrator, a second memory system or a second design skill set is
never added, even when it is good, because the cost is a conflict the user
has to debug. This is why the README says to name every addition with its
conflict analysis, and why the rule is applied to skills, plugins and MCP
servers alike.

## Scope

What the blueprint does:

- Installs and updates the opencode config home: `opencode.jsonc`,
  `AGENTS.md`, `commands/`, `plugins/`, the `.env.example` starter and the
  central `@opencode-ai/plugin` fallback.
- Installs 22 MCP servers, 15 remote and 7 local, with the local ones pinned
  to exact package versions under the config home.
- Installs 10 plugins: 2 from npm and 8 vendored in this repository.
- Installs the skills globally, from 18 registry sources plus 16 workflow
  skills vendored here. The README counts 119 in total; 85 are named
  individually in the installer and the 5 whole repository installs are not
  enumerated, so the total cannot be derived from the source alone.
- Installs the global agent workflow that gates the work: isolate, build,
  prove, ship.
- Installs the review loops: the Kodus loop before every commit, PR-Agent
  before every merge.
- Ships a Windows GUI installer that wraps the same setup.

## Out of scope

- **A second orchestrator, memory system or design skill set.** The rule
  above. One pick per job.
- **Dynamic client registration for the Google MCP servers.** Google does
  not offer it, so the entries need a pre-registered OAuth client or a bearer
  header. They ship disabled rather than broken.
- **The idle auto review trigger in `opencode-review`.** The host exposes no
  v2 hook for it, so there is nothing to wire to. The manual `/review` works.
- **Credentials in files.** Values live in `.env` in the config home, in the
  shell, or in GitHub secrets. The config file holds placeholders.
- **A macOS or Linux GUI installer.** The GUI is an Inno Setup script, which
  is Windows only. The terminal installer is the path for every platform.
- **Managing the opencode host itself.** The blueprint configures opencode;
  it does not install or update it.
- **Service accounts and cloud resources.** The blueprint wires the clients.
  The accounts, buckets and clusters stay with the user.

## How it works

The constraints that must hold at runtime:

- opencode reads the config once, at startup. After an install the host must
  be restarted completely, including the `opencode-cli` sidecar, or failed
  plugin resolutions stay cached and the plugins look installed but are not.
- Path plugins in the plugins folder load on their own. An npm entry for the
  same plugin loads it twice, which is why the DCP npm entry is absent.
- Local MCP servers are started as child processes from absolute paths that
  exist on the machine. A path that does not exist is a dead server, not a
  slow one.
- The config file stays JSONC. The installer rewrites only the `"command"`
  array of an MCP entry, so comments, formatting and line endings survive.
- A rewrite is validated before it is written: the file must still parse and
  the entry must carry exactly the array that was intended. A failed rewrite
  leaves the file as it was and prints a warning.
- Files that can hold user values are copied only when missing. Files that
  are versioned content are overwritten.
- The skill install runs through the `skills` CLI, which rewrites `SKILL.md`
  on every run. The opt out for user invoked skills is therefore applied
  after every install, and it has to be idempotent.
- The workflow gates are behavioural, not decorative. Nothing commits until
  the Kodus loop exits 0, and a merge needs PR-Agent and Kodus at zero
  comments.
- Two skills are human only by rule: `/audit` and `/sync` are never run
  automatically.

## Interface

- `npx opencode-blueprint` runs the install. `--dry-run` prints the plan and
  changes nothing.
- `npx opencode-blueprint@<version>` is what the GUI installer runs, pinned
  to the version that shipped it.
- Global commands, available in any project: `/pr-agent-setup`, `/pr-agent`,
  `/kodus-review`.
- Plugin commands: `/review`, `/ralph-loop`, `/ralph-continue`,
  `/cancel-ralph`, `/telemetry-report`, `/telemetry-inspect`,
  `/project-commands`, and the DCP compress command.
- The skills folder is global, `~/.agents/skills`, so a skill applies to every
  project without being copied into it.
- The config home is `OPENCODE_CONFIG_HOME`, otherwise `~/.config/opencode`.
- `node installer/build.mjs` builds the Windows installer, and the result is
  published through GitHub Releases.
- The npm package is `opencode-blueprint`, with the bin entry
  `opencode-blueprint` pointing at `bin/setup.mjs`.

## Where likely to go wrong

- **The Node version on `PATH`.** Below 22.20 every skills entry fails;
  below 20.19 Prisma 7 and mongodb-mcp-server 3 fail; below 20.12 the rea
  server dies on `node:util` `styleText`. The installer resolves a runtime
  per step, but a machine with no suitable Node installed still fails.
- **A partial restart.** The host caches failed plugin resolutions. A
  restart that leaves the sidecar running looks like a successful install
  with plugins that do nothing.
- **`npx` as a launcher.** A cold `npx` install can race and exit 0 without
  ever handshaking. This is the reason the local servers are pinned.
- **The committed absolute paths.** The config in the repository carries one
  machine's paths. Without running the installer, those entries point
  nowhere.
- **The DCP reminder blocks.** The synthetic flag is not supported by the
  host, and the local fix for upstream issue 608 has to be carried until
  upstream lands.
- **The slim plugin stamping the default agent.** It made restored sessions
  die with `Agent not found: "orchestrator"` until
  `setDefaultAgent: false` was added.
- **A self hosted Kodus.** It uses ports 3000, 3001, 5432, 27017 and 5672,
  which collide with local development databases, and containers cannot reach
  the host on localhost.
- **The first boot after a fresh install.** Skills, plugin dependencies and
  the local servers are all installed at once, so the first run after the
  installer is the slowest and the least forgiving.

## Ship criteria

Each of these can be checked, not eyeballed.

- `npx opencode-blueprint --dry-run` prints all six steps and leaves the
  config home untouched.
- After an install the config home holds `opencode.jsonc`, `AGENTS.md`, three
  files in `commands/`, eight plugin trees with their dependencies, a
  `tools/` folder with the six pinned local servers and a `package.json`
  carrying `@opencode-ai/plugin` at `^1.19.1`.
- Every local MCP entry in the installed `opencode.jsonc` points at a path
  that exists on that machine, and the file still parses as JSONC with its
  comments intact.
- The existing `opencode.jsonc` and `AGENTS.md` are still there under a
  `.bak-<timestamp>` name after the install.
- An existing `.env.example` with filled values is untouched.
- The skills step fails with a clear message when no Node >= 22.20 is
  available, and the install does not reach the skills step.
- Running the installer twice leaves the autoinvoke opt out on the user
  invoked skills in the same state, reported as already patched.
- The 5 Google MCP servers are still disabled in the installed config.
- `package.json` and the newest git tag carry the same version, and every tag
  has an entry in `docs/changelog.md`.
- The Kodus loop exits 0 before a commit, and PR-Agent and Kodus have no
  open comments before a merge.
- `docs/` matches the repository: the MCP count, the plugin count, the skill
  sources and the pinned versions in `docs/tech_stack.md` are the ones the
  files actually hold.
