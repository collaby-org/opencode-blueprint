---
name: ship
description: Run at the end of every task — gates, checks, evidence, review loops, commit, PR, and zero-comment bar before presenting the URL.
---

# Ship

End-of-task protocol, in run order. Bars and human-only locks stay ambient in `AGENTS.md` (`## Completing a task`) — this file holds the elaborations.

## 1. Stay scoped

Small Ralph loops (`/ralph-loop`) for well-defined, verifiable work. Skill gates in run order: new build or migration → `/scope` first (then worktree/plan); context missing or stale → `/audit` (`/audit` is HUMAN-ONLY — see `AGENTS.md`, never without explicit same-task authorization); load-bearing decision owed → `/architect` spec in `docs/specs/` before code; `/develop` builds from spec + `AGENTS.md`.

## 2. Checks

Run the repo's checks. `/test` owns the suite for uncommitted changes; `/develop` is the build step; `/debug` on any failure (minimal fix, regression test back to `/test`).

## 3. Evidence

Assemble before/after evidence. `/check verify` drives the real app against the spec; UI proof via `before-and-after` (numbers/output pairs otherwise).

## 4. Code review, Kodus, commit

`/code-review` first (full protocol in the `code-review` skill): the local gate on a model from a different family than the author, findings only, confidence 80, chunked for a 200k window. The reviewer never edits code; hand the findings to the implementer, rerun the repo checks, rerun the review, at most twice. A third failed round goes to the human.

Then the Kodus loop to clean (no high/critical — full loop in the `kodus-review` skill). Only after both, commit (conventional commits), rebase on `origin/main`, rerun checks. The order is fixed: review, Kodus, commit.

## 5. Push and PR

Push, open PR: what changed, how tested (every claim evidenced), before/after proof, `version: before → after`, risks/follow-ups. Before pushing, check the final state: manifest version, changelog entry, roadmap status, spec status — a PR without them is not ready. Sync the local review to the PR with `node <skill>/scripts/post-review.mjs --apply` (one sticky comment, updated in place). Then `/check review` for the quick single pass, `/document` for the prose from the real diff, `/unslop` on title + body.

## 6. Reviews to zero

`/review` + `/pr-agent` + Kodus to zero comments. The Kodus and PR-Agent GitHub workflows are the last resort outside OpenCode, not a substitute for the local gate. Present the PR URL.

## 7. Close

Do not merge unless told to. Keep the worktree until merge/close. After the merge, tag `v<version>` from the merged commit and copy the changelog section into the release notes; never tag a branch commit. `/sync` is HUMAN-ONLY (see `AGENTS.md`) — never auto-chained after `/document` or merge.
