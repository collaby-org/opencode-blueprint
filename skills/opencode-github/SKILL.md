---
name: opencode-github
description: Run opencode in GitHub Actions (agent mentions, auto review, triage, scheduled checks) — workflows, secrets, model lineup with fallbacks, and new-repo bootstrap. Use when wiring or invoking opencode on GitHub.
---

# opencode GitHub Integration

opencode runs in GitHub Actions via `anomalyco/opencode/github@latest` (see https://opencode.ai/docs/github/). `opencode.json` is committed at the repo root and carries the model + provider wiring for Actions.

## RULE

Do NOT write the literal Zen API key value into ANY file (repo or global) — secrets live only in GitHub Settings > Secrets and variables > Actions and are referenced by name.

## Secrets (names only, never values)

`LLM_API_KEY` (holds the opencode.ai Zen API key) and `LLM_API_BASE` (`https://opencode.ai/zen/v1`). Set under GitHub Settings > Secrets and variables > Actions (repo or org scope). Workflow files reference them only as `${{ secrets.LLM_API_KEY }}` / `${{ secrets.LLM_API_BASE }}`; the config references the key only as `{env:LLM_API_KEY}`.

## Workflows (`.github/workflows/`, `pr-agent.yml` stays untouched)

- `opencode.yml` — `issue_comment[created]` + `pull_request_review_comment[created]`; responds to `/oc` or `/opencode` mentions; checkout + action with `model` input and `LLM_API_KEY` / `LLM_API_BASE` env. `issue_comment` fires on non-PR issues only (PR conversation-tab `/oc` intentionally disabled — fork head repo unresolvable in expressions; use review comments instead).
- `opencode-review.yml` — `pull_request [opened, synchronize, reopened, ready_for_review]`; automatic review with the action's default review prompt (`prompt` input omitted); `use_github_token: true` + `GITHUB_TOKEN` env so no OIDC is needed for reads.
- `opencode-triage.yml` — `issues [opened]` (no re-triage on edit — `sender.author_association` is not a documented context path, so `edited` can't be gated on the actor); REQUIRED `prompt` input with triage instructions (labels, repro steps, missing info, priority).
- `opencode-scheduled.yml` — `schedule` cron weekly Monday 09:00 UTC + `workflow_dispatch`; REQUIRED `prompt` input (dependency/health check); `contents:write, pull-requests:write, issues:write` so it can open issues/small PRs.

## Model lineup

Primary `openai/muse-spark-1.3-contributor-free`, fallbacks in order `openai/big-pickle` → `openai/space-bunny-free` → `openai/kimi-k3` (last). There is NO official `fallback_models` key in `opencode.json` or action inputs — fallback is implemented as sequential retry steps with `if: failure()` overriding `model` in every workflow that calls the model.

## Usage

Comment `/oc` or `/opencode` (plus your instruction) on an issue or on a same-repo PR review comment (PR conversation-tab `/oc` is disabled by design) to invoke the agent. `/review` | `/improve` | `/ask` remain PR-Agent commands and stay separate from opencode.

## New-project bootstrap

Every new project folder gets the same set: copy the global `AGENTS.md` in as the repo `AGENTS.md`, plus copy `.github/workflows/` (`pr-agent.yml` + `opencode*.yml`), `.pr_agent.toml`, and `opencode.json` from the canonical template source; then set the `LLM_API_KEY` / `LLM_API_BASE` GitHub secrets and push. Never leave a new repo without the `.github` + PR-Agent pair.
