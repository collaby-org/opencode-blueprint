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

## 4. Review loop and commit

Kodus loop to clean (no high/critical — full loop in the `kodus-review` skill), then commit (conventional commits), rebase on `origin/main`, rerun checks.

## 5. Push and PR

Push, open PR: what changed, how tested (every claim evidenced), before/after proof, risks/follow-ups. `/check review` first (fresh-model review after verify, before PR prose); `/document` drafts the text from the real diff after the living-docs update. `/unslop` on title + body.

## 6. Reviews to zero

`/review` + `/pr-agent` + Kodus to zero comments. Present the PR URL.

## 7. Close

Do not merge unless told to. Keep the worktree until merge/close. `/sync` is HUMAN-ONLY (see `AGENTS.md`) — never auto-chained after `/document` or merge.
