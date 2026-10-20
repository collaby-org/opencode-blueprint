---
name: ship
description: Run at the end of every task — gates, checks, evidence, review loops, commit, PR, and zero-comment bar before presenting the URL.
---

# Ship

End-of-task protocol, in run order. Bars and human-only locks stay ambient in `AGENTS.md` (`## Completing a task`) — this file holds the elaborations.

## 1. Stay scoped

Small Ralph loops (`/ralph-loop`) for well-defined, verifiable work. Skill gates in run order: new build or migration → `/scope` first (then worktree/plan); context missing or stale → `/audit` (`/audit` is HUMAN-ONLY — see `AGENTS.md`, never without explicit same-task authorization); load-bearing decision owed → `/architect` spec in `docs/specs/` before code; `/develop` builds from spec + `AGENTS.md`.

## 2. The end-of-task order

Run it in this order. Each step depends on the one before it.

1. **Checks.** Run the repo's checks. `/test` owns the suite for uncommitted changes; `/develop` is the build step; `/debug` on any failure (minimal fix, regression test back to `/test`).
2. **Evidence.** Assemble before/after evidence. `/check verify` drives the real app against the spec; UI proof via `before-and-after` (numbers/output pairs otherwise).
3. **Kodus loop on the staged diff.** Stage the change, then run the Kodus loop to clean (no high/critical, full loop in the `kodus-review` skill). It reviews the staged diff, `--staged` is the default scope.
4. **Commit.** Conventional commits. The living docs, the changelog entry and the roadmap status for this change ride in this same commit, never in a separate "bump version" commit.
5. **Rebase on `origin/main`.** The rebase happens before the review, never after it.
6. **Rerun the checks.** The rebased tree is what ships, prove it again.
7. **Local code review gate on the final HEAD.** `/code-review` (full protocol in the `code-review` skill): the local gate on a model from a different family than the author, findings only, confidence 80, chunked for a 200k window. The reviewer never edits code; hand the findings to the implementer, rerun the repo checks, rerun the review, at most twice. A third failed round goes to the human.
8. **Push and PR.** Push, open PR: what changed, how tested (every claim evidenced), before/after proof, `version: before → after`, risks/follow-ups.
9. **Sync the review comment.** `node <skill>/scripts/post-review.mjs --apply` (one sticky comment, updated in place).
10. **Living docs, changelog and roadmap.** They belong to the same commit as the change they describe (step 4). Confirm each one is in that commit: manifest version, changelog entry, roadmap status, spec status. A PR without them is not ready.
11. **`/document`.** The prose from the real diff.
12. **`/unslop`.** On the title and the body.
13. **Reviews to zero.** `/review` + `/pr-agent` + Kodus to zero comments. The Kodus and PR-Agent GitHub workflows are the last resort outside OpenCode, not a substitute for the local gate.
14. **Present the URL.**

## 3. Rules that hold at every step

- **The review is on the final HEAD.** If any step after the review changes code, the review must be re-run, because the gate rejects a stale HEAD. The rebase happens before the review, never after it.
- **`/check review` is optional.** It is a quick single read and never replaces `/code-review`.
- **`/sync` and `/audit` are human only.** Never auto-chained, never run without explicit authorization in the same task.

## 4. Close

Do not merge unless told to. Keep the worktree until merge/close. After the merge, tag `v<version>` from the merged commit and copy the changelog section into the release notes; never tag a branch commit. `/sync` is HUMAN-ONLY (see `AGENTS.md`) — never auto-chained after `/document` or merge.
