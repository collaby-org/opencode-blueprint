---
description: Scaffold PR-Agent (Qodo community edition) in the current project — Action workflow plus repo settings, custom LLM endpoint supported.
---

Set up PR-Agent automated PR reviews in the current project
($ARGUMENTS is ignored; always operates on the current worktree repo).

0. Check `gh auth status`. If not authenticated, stop and tell the user to
   run `gh auth login` first.
1. Ask the user ONCE (single round, all questions together):
   a. LLM base URL — default `https://api.openai.com/v1` (official OpenAI).
      Custom OpenAI-compatible endpoints welcome, but must be PUBLICLY
      reachable (GitHub runners can't see localhost).
   b. Exact API model ID — default `gpt-4o`. Must be the endpoint's real
      model string, not a display name.
   c. The API key value itself (you will pipe it straight into
      `gh secret set` — never write it to any file, never echo it back).
   d. Secret scope: this repo only, or org-wide (`--org`)?
2. Create `.github/workflows/pr-agent.yml` (merge with existing file, never
   blind-overwrite):
   ```yaml
   name: PR Agent
   on:
     pull_request:
       types: [opened, synchronize]
   jobs:
     pr_agent_job:
       runs-on: ubuntu-latest
       permissions:
         pull-requests: write
         issues: write
         contents: read
       steps:
         - name: PR Agent action step
           uses: the-pr-agent/pr-agent@main
           env:
             OPENAI__API_BASE: ${{ secrets.LLM_API_BASE }}
             OPENAI__KEY: ${{ secrets.LLM_API_KEY }}
             GITHUB_TOKEN: ${{ secrets.GITHUB_TOKEN }}
   ```
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
