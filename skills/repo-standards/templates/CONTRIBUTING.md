# Contributing to {{PROJECT_NAME}}

Read `AGENTS.md` first. It is the workflow every contribution follows, and it
points at the project docs and setup notes for this repository. This file
covers only what a change must contain.

## One problem per pull request

A pull request solves one problem. A refactor, a dependency bump, and a bug fix
are three pull requests. If the work needs a second problem solved to land,
land the first one and open the second one separately.

## Conventional commits

Every commit uses a conventional commit message: `feat:`, `fix:`, `docs:`,
`chore:`, `refactor:`, `test:`, or `build:`. The subject says what changed in
plain words. The body says why, when the reason is not obvious.

## Evidence is required

A pull request states what you ran, what it printed, and what you did not
check. Evidence means:

1. The exact commands you ran, copyable as written.
2. The relevant output, pasted, not summarized as "tests pass".
3. The parts you did not verify, named honestly. A manual step you skipped, a
   browser you did not test, a platform you did not run: say so.

Screenshots are welcome for interface changes. They never replace the commands
and output for the logic underneath.

## Flow

The full order lives in `AGENTS.md`; this is the short form.

1. Run `/check verify` and make the change pass against its spec.
2. Run the Kodus review loop (`/kodus-review`) on the staged diff until it is
   clean.
3. Commit with a conventional message, then rebase on the default branch and
   rerun the checks.
4. Run the local code review (`/code-review`) on the final HEAD, on a model
   that did not write the code. Fix what it finds; a change after the review
   makes it stale, so rerun it.
5. Open the pull request, fill every section of the template, and state
   `version: before → after`.

CI runs `ci.yml` and `secret-scan.yml` on every pull request. The Kodus and
PR-Agent workflows are advisory and may skip themselves when a repository has
no secrets configured.

## Version and changelog

This project keeps its version in `{{VERSION_FILE}}` and its history in
`docs/changelog.md`.

- A feature or architecture change bumps the minor version.
- A fix, a docs change, or a chore bumps the patch version.
- A breaking change bumps the major version.
- Every change made while a pull request is open bumps the patch again, so the
  pull request lands at the highest patch it reached.

Bump the manifest and write the changelog line in the same commit as the code
change. The pull request body states `version: before → after`, using real
numbers.

## Review rounds

Two review rounds are the limit. Each round ends with the reviewer's new
findings resolved or explicitly deferred with a reason. After the second round,
stop and fix the cause: split the pull request, change the design, or ask for a
decision. Do not open a third round on the same shape.

## Secrets

Never commit `.env` files, tokens, keys, customer data, or private URLs. If a
secret reaches a commit, rotate it first and report it through the private
channel in `.github/SECURITY.md`, not in the pull request.
