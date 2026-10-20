---
description: Scaffold PR-Agent (Qodo community edition) in the current project — Action workflow plus repo settings, custom LLM endpoint supported.
---

Set up PR-Agent automated PR reviews in the current project
($ARGUMENTS is ignored; always operates on the current worktree repo).

0. Check `gh auth status`. If not authenticated, stop and tell the user to
   run `gh auth login` first.
1. Ask the user ONCE (single round, all questions together).
   Defaults in brackets — accept on empty reply:
   a. LLM base URL [default `https://tokenharbor.ai/v1`]. Must be an
      OpenAI-compatible **chat-completions** endpoint, PUBLICLY reachable
      (GitHub runners can't see localhost). NOTE: Zen serves Muse Spark
      via `/responses`, not chat-completions — for PR-Agent use Token
      Harbor (or any chat-completions gateway), not Zen directly.
   b. Exact API model ID [default `muse-spark-1-3`].
   c. The API key value itself (you will pipe it straight into
      `gh secret set` — never write it to any file, never echo it back).
   d. Secret scope: this repo only, or org-wide (`--org`)?
2. Create `.github/workflows/pr-agent.yml` (merge with existing file, never
   blind-overwrite):
   ```yaml
   name: PR Agent

   on:
     pull_request:
       types: [opened, synchronize, reopened, ready_for_review]
       branches: [main, master, develop]

   permissions:
     contents: read
     pull-requests: write
     issues: write

   concurrency:
     group: pr-agent-${{ github.event.pull_request.number }}
     cancel-in-progress: true

   jobs:
     pr_agent_job:
       runs-on: ubuntu-latest
       timeout-minutes: 20
       env:
         LLM_API_KEY: ${{ secrets.LLM_API_KEY }}
       steps:
         - name: Checkout
           uses: actions/checkout@11bd71901bbe5b1630ceea73d27597364c9af683 # v4.2.2
           with:
             fetch-depth: 0

         - name: PR Agent
           if: ${{ env.LLM_API_KEY != '' }}
           # Pinned to a full commit SHA: a mutable tag would receive this job's secrets.
           uses: the-pr-agent/pr-agent@b4c3d11d2247dce6f716074c5352c3f97d6564df
           env:
             OPENAI__API_BASE: ${{ secrets.LLM_API_BASE }}
             OPENAI__KEY: ${{ secrets.LLM_API_KEY }}
             GITHUB_TOKEN: ${{ secrets.GITHUB_TOKEN }}

         - name: Not configured
           if: ${{ env.LLM_API_KEY == '' }}
           run: echo "::notice::LLM_API_KEY is not set; skipping PR-Agent. The local gate still applies."
   ```
   Forks never get secrets, so a fork PR cannot run the review.
3. Create `.pr_agent.toml` in the repo root (skip if one already exists):
   ```toml
   [config]
   model = "openai/<MODEL_ID_FROM_STEP_1B>"
   fallback_models = ["openai/<MODEL_ID_FROM_STEP_1B>"]
   # Prefixed names aren't in PR-Agent's token table — confirm and adjust:
   custom_model_max_tokens = 128000

   [pr_reviewer]
   persistent_comment = true
   extra_instructions = """Conventional commits. Flag missing tests, unhandled
   loading/empty/error UI states, raw color values instead of semantic tokens,
   missing active press feedback, and animations over 300ms or without
   reduced-motion handling."""
   ```
4. Store the secrets (key NEVER touches a file):
   `gh secret set LLM_API_BASE --body "<url>" [--org]`,
   `printf '%s' "<key>" | gh secret set LLM_API_KEY [--org]`.
   `GITHUB_TOKEN` is automatic.
5. Do NOT commit unless asked — report the created files + where the
   secrets live, and stop.
