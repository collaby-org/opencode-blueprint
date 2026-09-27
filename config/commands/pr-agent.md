---
description: Review a PR with PR-Agent — post /review, collect findings, drive them to zero.
---

Run a PR-Agent review cycle on `$ARGUMENTS` (a PR URL or number in the
current repo; default: the PR for the current branch).

1. Resolve the PR URL (`gh pr view <n> --json url -q .url`, or current
   branch's PR when `$ARGUMENTS` is empty).
2. If the repo has no `.github/workflows/pr-agent.yml`, stop and point at
   `/pr-agent-setup` first.
3. Post the trigger: `gh pr comment <PR> --body "/review"`. Wait ~60s, then
   read back the newest PR-Agent bot comment
   (`gh pr view <PR> --json comments`).
4. Summarize findings grouped by severity. For each actionable finding:
   fix it in the worktree (scoped to the finding, repo checks after), or
   push back with a one-line reason if it's a false positive.
5. Push, re-trigger with `/review` if the diff changed materially, repeat
   until no actionable findings remain.
6. End with the PR URL and the residual risk list (anything accepted, not
   fixed).
