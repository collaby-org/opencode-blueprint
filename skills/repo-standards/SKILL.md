---
name: repo-standards
description: "Install and verify the baseline every repository needs before a task starts: AGENTS.md, CONTRIBUTING.md, CLAUDE.md, PR and issue templates, CODEOWNERS, dependabot, SECURITY.md, pinned CI, and a secret scan. Use at task start and before a PR in any repository."
---

# Repo standards

Every repository carries the same baseline. This skill checks it, scaffolds
only what is missing, and never overwrites a curated file.

## When to run

At the start of every task, before reading or changing code, and again before a
pull request. Any repository, any stack. A failure here is a task blocker, not
a suggestion.

## Check first

```bash
node <skill>/scripts/standards.mjs --check <repo>
```

Globally installed, `<skill>` is `~/.agents/skills/repo-standards`. From this
blueprint repository, `node bin/standards.mjs --check <repo>` runs the same
code.

Exit 0 means clean. Exit 1 lists every missing or invalid file:

- `CLAUDE.md` must contain exactly `@AGENTS.md` and one newline.
- `.github/CODEOWNERS` needs at least one active rule line.
- `.github/pull_request_template.md` needs `Verification` and a `version:` line.
- Every `uses:` in `.github/workflows/*.yml` needs a 40 character commit SHA,
  with an optional trailing comment.
- `AGENTS.md` must match `<config>/AGENTS.md` when that file exists. The config
  directory is `OPENCODE_CONFIG_DIR`, else `~/.config/opencode`. Line endings
  are normalized, so a Windows checkout with CRLF does not false fail.

## Required set

```text
AGENTS.md
CONTRIBUTING.md
CLAUDE.md
.github/pull_request_template.md
.github/ISSUE_TEMPLATE/{bug_report,feature_request,documentation,config}.yml
.github/CODEOWNERS
.github/dependabot.yml
.github/SECURITY.md
.github/workflows/ci.yml
.github/workflows/secret-scan.yml
```

`--apply` also writes `.github/WORKFLOWS.md`, which explains the required and
advisory jobs. It is documentation, not part of the checked set.

## Apply

```bash
node <skill>/scripts/standards.mjs --apply <repo> --dry-run
node <skill>/scripts/standards.mjs --apply <repo>
node <skill>/scripts/standards.mjs --apply <repo> --with-agents
```

`--apply` copies only missing files from `templates/`, substitutes placeholders,
prints created and skipped files, then runs `--check`. An existing file is
skipped, always. Run `--dry-run` first to see the plan. Running `--apply` twice
changes nothing the second time.

`--force <relative-path>` overwrites one scaffolded file after an explicit
decision. Use it only for a file you intend to reset to the template.

Options: `--stack node|php|generic` (default `node`, picks the CI template),
`--name`, `--owner`, `--branch` (default `main`), `--security-contact`.

## AGENTS.md

`AGENTS.md` must be byte identical to the global `~/.config/opencode/AGENTS.md`.
The checker normalizes line endings before the hash, so a Windows checkout that
turns LF into CRLF still matches; the text itself must not differ.
Copy it only with the user's explicit authorization in the same task.
`--with-agents` performs that copy when the file is missing and reports an
existing file without touching it. Without `--with-agents`, `--apply` reports
the missing file and exits 1 through the final check. Never hand edit the local
copy, and never replace it with a merged or shortened version.

## Values and placeholders

The script fills `{{PROJECT_NAME}}`, `{{OWNER}}`, `{{DEFAULT_BRANCH}}`,
`{{STACK}}`, `{{NODE_VERSION}}`, `{{INSTALL_CMD}}`, `{{LINT_CMD}}`,
`{{TEST_CMD}}`, `{{BUILD_CMD}}`, `{{SECURITY_CONTACT}}`, and `{{VERSION_FILE}}`.

It detects name and owner from `package.json`, `composer.json`, and the git
remote; commands from lockfiles and manifest scripts; the version file from the
manifests and `docs/VERSION`. A value it cannot detect stays `TODO:` and is
listed by `--apply`. Never invent an owner, a contact, a command, or a version.
A `TODO:` in `CODEOWNERS` or `SECURITY.md` blocks merge until a person fills it.
After `--apply`, read the generated files and adapt any detected command or
name the repository does not actually use.

## Validation

Agents run `--check` at task start and report the exact output. CI can run the
same command in a job with `contents: read`; no network is required, and the
checker makes no network calls. A clean check is a precondition for a PR, not
proof that the work itself is correct.

## Failure handling

- Missing file: run `--apply`, then fill any `TODO:` values it lists.
- Invalid file: inspect the named rule, fix the file, rerun `--check`.
- `AGENTS.md` hash mismatch: stop. The user decides whether the repository or
  the global config is stale; do not sync either one on your own.
- CI workflow check fails: pin the named action to a full commit SHA. Do not
  weaken the checker to accept a tag.
