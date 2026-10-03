---
name: pr-agent
description: Review every PR with PR-Agent (Qodo community edition) — bootstrap the preset, run /review to fix to zero, use /improve and /ask as needed. Use on every PR before presenting the URL.
---

# PR-Agent

PR-Agent reviews every PR automatically once the repo carries `.github/workflows/pr-agent.yml` + `.pr_agent.toml`.

## Bootstrap (new repo)

Run `/pr-agent-setup` first: it asks for the LLM base URL + exact model ID + key, scaffolds both files, and stores the key as `LLM_API_BASE` / `LLM_API_KEY` GitHub secrets (repo or org scope). Secrets are secret-references only — the key NEVER lands in a file. The endpoint must be publicly reachable (GitHub runners can't see localhost); default is official OpenAI.

## Per-PR loop

1. Run `/pr-agent <url-or-number>`, post `/review`.
2. Fix actionable findings.
3. Re-trigger until clean.

`/improve` and `/ask` are available as PR comments for targeted help. You can also comment directly on the PR: `/review`, `/improve`, or `/ask <question>` (e.g. `/ask Could this introduce a race condition?`). PR-Agent answers in GitHub comments; fold its findings into the same fix loop.

## Bar

PR-Agent findings and Kodus comments share one bar: zero unresolved before presenting the PR URL.
