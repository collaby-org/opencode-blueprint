---
name: opencode-github
description: Run opencode in GitHub Actions (agent mentions, auto review, triage, scheduled checks) — workflows, secrets, model lineup with fallbacks, and new-repo bootstrap. Use when wiring or invoking opencode on GitHub.
---

# opencode GitHub Integration

opencode runs in GitHub Actions via `anomalyco/opencode/github@latest` (see https://opencode.ai/docs/github/). The model and provider wiring for Actions lives in the repository's opencode config: `config/opencode.jsonc` here. Read it before you claim anything about the setup.

## RULE

Do NOT write the literal Zen API key value into ANY file (repo or global) — secrets live only in GitHub Settings > Secrets and variables > Actions and are referenced by name.

## Check before you claim

Never name a workflow, a config file, or a template you have not read in the repository you are working on.

1. List `.github/workflows/`. Only the files that are actually there exist.
2. Read `config/opencode.jsonc` for the model and provider wiring.

If `.github/workflows/` holds no opencode workflow, say so plainly and stop: "This repository has no opencode GitHub workflow set." There is nothing to wire, invoke, or repair, and scaffolding one is a separate task you have not been asked for. Never fabricate file names.

## Secrets (names only, never values)

`LLM_API_KEY` (holds the opencode.ai Zen API key) and `LLM_API_BASE` (`https://opencode.ai/zen/v1`). Set under GitHub Settings > Secrets and variables > Actions (repo or org scope). Workflow files reference them only as `${{ secrets.LLM_API_KEY }}` / `${{ secrets.LLM_API_BASE }}`; the config references the key only as `{env:LLM_API_KEY}`.

## Workflows (`.github/workflows/`, `pr-agent.yml` stays untouched)

List `.github/workflows/` first and work only with what is there. The opencode workflow set is optional: a repository may carry none of it. The standard set, when a repository does carry it, is one workflow per job:

- `opencode.yml` — `issue_comment[created]` + `pull_request_review_comment[created]`; responds to `/oc` or `/opencode` mentions; checkout + action with `model` input and `LLM_API_KEY` / `LLM_API_BASE` env. `issue_comment` fires on non-PR issues only (PR conversation-tab `/oc` intentionally disabled — fork head repo unresolvable in expressions; use review comments instead).
- `opencode-review.yml` — `pull_request [opened, synchronize, reopened, ready_for_review]`; automatic review with the action's default review prompt (`prompt` input omitted); `use_github_token: true` + `GITHUB_TOKEN` env so no OIDC is needed for reads.
- `opencode-triage.yml` — `issues [opened]` (no re-triage on edit — `sender.author_association` is not a documented context path, so `edited` can't be gated on the actor); REQUIRED `prompt` input with triage instructions (labels, repro steps, missing info, priority).
- `opencode-scheduled.yml` — `schedule` cron weekly Monday 09:00 UTC + `workflow_dispatch`; REQUIRED `prompt` input (dependency/health check); `contents:write, pull-requests:write, issues:write` so it can open issues/small PRs.

Name only the ones you found in the listing. A workflow that is not there does not run, and saying it does is a false claim about the repository.

## Model lineup

Primary `openai/muse-spark-1.3-contributor-free`, fallbacks in order `openai/big-pickle` → `openai/space-bunny-free` → `openai/kimi-k3` (last). There is NO official `fallback_models` key in the opencode config or the action inputs — fallback is implemented as sequential retry steps with `if: failure()` overriding `model` in every workflow that calls the model.

## Usage

Comment `/oc` or `/opencode` (plus your instruction) on an issue or on a same-repo PR review comment (PR conversation-tab `/oc` is disabled by design) to invoke the agent. `/review` | `/improve` | `/ask` remain PR-Agent commands and stay separate from opencode.

## New-project bootstrap

Every new project folder gets the same set: copy the global `AGENTS.md` in as the repo `AGENTS.md`, then give the repo its `.github` pair (`.github/workflows/pr-agent.yml` and `.pr_agent.toml`), the opencode config (`config/opencode.jsonc`), and any opencode workflow files it needs, written from the shapes above or copied from a repository that already carries them. There is no canonical template source to copy from: the shapes in this file and the files in this repository are the source. Set the `LLM_API_KEY` / `LLM_API_BASE` GitHub secrets and push. Never leave a new repo without the `.github` + PR-Agent pair.
