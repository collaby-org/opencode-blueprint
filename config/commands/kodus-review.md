---
description: Kodus review-fix loop — review the staged diff, fix findings, re-review until no high/critical issues.
---

Run the Kodus review loop on the current changes ($ARGUMENTS: extra flags
passed through to `kodus review`; the staged diff is the default scope).

Prerequisite: Kodus CLI installed (`npm install -g @kodus/cli`) and authed
(`kodus auth login`, or `KODUS_TEAM_KEY` in env). If `kodus --version`
fails, stop and tell the user to install/auth first.

Loop:
1. Stage the change first (`git add <touched files>`): the loop reviews the
   staged diff, the same local first flow as the `kodus-review` skill.
2. Run `kodus review --prompt-only --staged --fail-on error $ARGUMENTS`.
   `--staged` is the default scope; every flag in $ARGUMENTS is passed
   through to `kodus review` unchanged.
3. Analyse every finding. Fix all valid ones (minimal, targeted edits;
   explain and skip false positives).
4. Run the repo's checks/tests.
5. Re-run step 2. Repeat until no high/critical issues remain
   (exit code 0).
6. Report what was fixed vs accepted. Do NOT commit or push — the caller
   decides that (see AGENTS.md: commit only after the loop is clean).
