---
name: kodus-review
description: Run the Kodus review loop after implementing and before committing — review findings, fix, test, re-review until clean. Use every time before commit/push; local-first staged flow by default.
---

# Kodus Review

After implementing, before committing — every time.

## The loop

1. Run `kodus review --prompt-only` (or `/kodus-review`).
2. Analyse every finding.
3. Fix all valid findings.
4. Run the repo's tests.
5. Re-run the review. Repeat until no high/critical issues remain (`--fail-on error` exits 0).
6. Only then commit/push.

## Local-first flow (default, before every commit)

Staged diffs stay small (full-PR bot reviews time out past ~120k tokens) and skip push-and-wait latency; bots re-verify the tiny diff after push.

1. Stage first: `git add <touched files>` (`--staged` sees staged changes only).
2. Run `kodus review --prompt-only --staged` → analyse → fix valid → run repo tests where runnable → re-run → repeat until `--fail-on error` exits 0.
3. Only then commit/push.

## Auth

CLI: `npm install -g @kodus/cli`. Auth via `kodus auth login`, or solo-private team key per shell (global/skill file only — local machine, never committed to git, never pasted elsewhere):

`$env:KODUS_TEAM_KEY = 'kodus_H_n5XzUkGfM2O5kY2f0JszKovhgGxdFc6iHmMylCngY'`

Persist for future shells via `setx` / `kodus auth team-key --key ...` using the same value.

## Backends

- **Cloud (default):** CLI talks to `api.kodus.io`; models chosen in the Kodus dashboard.
- **Self-hosted local orchestrator** (`kodustech/kodus-ai` via Docker): `KODUS_API_URL=http://localhost:3001`, plus `.env` with `API_OPEN_AI_API_KEY=<key>` + `API_OPENAI_FORCE_BASE_URL=<public URL — containers can't see host localhost>` + `API_LLM_PROVIDER_MODEL=<exact model id>`. Needs Docker + pnpm; grabs ports 3000/3001/5432/27017/5672 (remap or stop colliding local dev DBs first); anonymous telemetry heartbeat on unless `KODUS_TELEMETRY_DISABLED=true`; local quickstart is dev-mode, production follows the generic-vm guide.

## Missing CLI

Skipped only when the CLI is missing — then say so and continue without it, never fake the review.

## Bar

Nothing commits until clean.
