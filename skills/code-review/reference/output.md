# Output contract

The three scripts own the deterministic parts. This file says what each
artifact is, how findings become a verdict, and what reaches the pull request.

---

## Artifacts

| Artifact | Path | Written by | Purpose |
|---|---|---|---|
| Plan | `<tmp>/opencode-code-review/<stamp>-<sha>/plan.json` | `plan-review.mjs` | Scope, chunks, budgets, skipped files |
| Chunk diffs | `<plan>/chunk-<n>.diff` | `plan-review.mjs` | One scoped diff per reviewer |
| Reviewer output | `<plan>/findings/agent-<n>.json` | Reviewer agents | Raw findings, one file per agent |
| Result | `<plan>/result.json` and `.git/code-review/last-result.json` | `reconcile-review.mjs` | Verdict, counts, head, report path |
| Report | `docs/reviews/<date>-<branch>.md` (or `.workflow/reviews/` on a docs site) | `reconcile-review.mjs` | Human readable review |
| Plan pointer | `.git/code-review/last-plan.json` | `plan-review.mjs` | Lets the next step find the plan |

`.git/code-review/` is inside the git directory, so it is never committed and
never pollutes the worktree.

---

## The gate

Applied in this order, by `reconcile-review.mjs`:

1. **Confidence**: drop every finding below `--threshold` (default 80).
2. **Changed line**: a finding must point at an added line in the chunk diffs.
   A minor or nit outside the changed lines is dropped as pre-existing. A
   blocker or major outside them is kept and marked, because a real problem
   next to the change is still worth a human look.
3. **Deduplicate**: same file, line bucket, and category collapse into one
   finding. The most severe one wins, confidence breaks a tie inside one
   severity, and the sources merge.
4. **Rank**: blocker, major, minor, nit; then confidence descending.
5. **Cap**: `--max-findings` (default 32). Overflow is counted, not listed. Use
   `--max-findings all` when the change is high risk.

No finding survives all five steps, the verdict is `approve`. That is a clean
review, and it is still evidence, not proof.

---

## Verdict

| Verdict | Condition | Meaning |
|---|---|---|
| `blocked` | At least one blocker | Do not open the PR |
| `changes-requested` | At least one major, no blocker | Fix before the PR |
| `approve-with-nits` | Only minors and nits | Ship, take or leave the notes |
| `approve` | Nothing survived the gate | Ship |

The verdict is a recommendation, not a merge decision. The human decides.

---

## Pull request comment

One comment per pull request, updated in place. `post-review.mjs` owns it.

Format:

```markdown
<!-- opencode-code-review:v1 -->
<!-- reviewed-head:<full sha> -->
## Local code review (cross model)

<the report body>

---
<sub>Local review on `glm-5.3-flash-free` · author model `deepseek-v4.1-flash-free` ·
level standard · verdict blocked · head `abc12345` · this comment updates in place</sub>
```

Rules:

- **Idempotent**: the marker identifies the comment. A second sync patches it
  instead of adding another. There is never more than one.
- **Names its commit**: the reviewed head is in the body. If the PR head has
  moved, a note says so and asks for a fresh run.
- **No inline comments**: local line numbers do not survive a rebase, and a
  stale inline comment is worse than a link plus `file:line` in the summary.
  The summary is the review record. If inline comments are ever needed, they
  must be validated against the PR diff at post time, not the local worktree.
- **No secrets**: `post-review.mjs` redacts private key blocks, common token
  prefixes, JWTs, `KODUS_TEAM_KEY` style assignments, and generic
  `api_key` / `secret` / `password` / `token` assignments of twelve characters
  or more, before posting. The
  report is also local, so nothing leaves the machine until `--apply`.
- **Bounded**: bodies over 60,000 characters are truncated with a pointer to
  the local report.

`post-review.mjs` is a dry run by default. `--apply` is the only way it writes.
`--require-pr` turns a missing PR into exit 3, which is what CI uses. Without
it, a missing PR is a normal skip: the local gate runs before the PR exists.

---

## Failure rules

- **A missing findings file is a failed review, not a clean one.** The
  reconciler exits 2 when the findings directory is missing or empty.
- **An agent that errors writes no file and says so.** The orchestrator
  re-spawns that chunk once with a fresh model from the ladder, then reports
  the gap. It never fills the gap with an invented finding.
- **A truncated chunk is a known limitation.** It is counted in the report.
  The orchestrator tells the human which file needs a manual read.
- **The gate fails closed.** If the plugin cannot read a valid result for the
  current head, `gh pr create` is blocked with the reason and the escape that
  applied (a draft PR, `enforce_pr_gate: false`, or a single command prefixed
  with `CODE_REVIEW_SKIP=1`).
- **A review is incomplete for one of two reasons**, and the report, the pull
  request comment and the gate message each name the one that applies: the plan
  had more chunks than the agent budget, so the tail chunk never had a
  reviewer; or not every reviewer reported. Either way `complete` is false and
  the gate blocks the pull request.
