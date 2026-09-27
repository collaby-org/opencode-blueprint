---
description: Kodus review-fix loop — review working tree, fix findings, re-review until no high/critical issues.
---

Run the Kodus review loop on the current changes ($ARGUMENTS: extra paths
or flags to pass to `kodus review`, e.g. `--staged`; default: working tree).

Prerequisite: Kodus CLI installed (`npm install -g @kodus/cli`) and authed
(`kodus auth login`, or `KODUS_TEAM_KEY` in env). If `kodus --version`
fails, stop and tell the user to install/auth first.

Loop:
1. Run `kodus review --prompt-only --fail-on error $ARGUMENTS`.
2. Analyse every finding. Fix all valid ones (minimal, targeted edits;
   explain and skip false positives).
3. Run the repo's checks/tests.
4. Re-run step 1. Repeat until no high/critical issues remain
   (exit code 0).
5. Report what was fixed vs accepted. Do NOT commit or push — the caller
   decides that (see AGENTS.md: commit only after the loop is clean).
