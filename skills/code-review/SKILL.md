---
name: code-review
description: "Run the mandatory local code review before a PR: multiple reviewer agents, always on a model different from the one that wrote the code, confidence gated, chunked for a 200k context window, then synced to the pull request. Use after /check verify and before Kodus, the commit, and the PR."
---

# Code review

The local gate before a pull request. It is not a suggestion and not a second
opinion you can skip. It runs on every change, it runs before Kodus, and it
runs before the PR exists.

Adapted from Anthropic's `code-review` plugin (several reviewers in parallel, a
high signal filter, a validation pass before anything is posted) and its
`security-guidance` plugin (a separate review on a fresh context, never the
author grading itself). Reimplemented for a local, small context reviewer.

## What it guarantees

1. **A different model reviews the code.** Never the model family that wrote
   it. A model reviewing its own output shares its blind spots.
2. **The diff is chunked, not truncated.** Free models have a 200k window. The
   planner splits the change so each agent has room to read the changed files,
   not just the hunks.
3. **Only high signal findings survive.** Confidence 80 or higher, the line
   must be in the changed diff, duplicates merge, capped at 32.
4. **The result is an artifact.** A report on disk, a verdict, and a stable
   state file that the plugin gate reads before it lets `gh pr create` run.
5. **The PR gets the review.** One sticky comment, updated in place, naming
   the commit it reviewed.

## What it does not do

- It does not edit code. The reviewer reports, the implementer fixes. A
  reviewer that fixes becomes an author, and the independence is gone.
- It does not replace `/check verify`. Runtime proof and code review are
  different evidence.
- It does not replace Kodus or PR-Agent. Those are the last resort, on GitHub,
  after this gate and after the local Kodus loop.
- It does not approve or merge. A human decides.

---

## Order of operations

```
/check verify  ->  /code-review  ->  fix valid findings  ->  rerun  ->
kodus review (local)  ->  commit  ->  push  ->  PR  ->  sync the review  ->
Kodus + PR-Agent on GitHub  ->  zero comments
```

This order is not optional. A commit before the review means the review is
reviewing code that already moved. The one exception: a draft PR may be opened
before the review, because drafts exist for early CI. The plugin gate allows
drafts and blocks everything else.

The review runs on the working tree, before the commit, so the artifact records
the HEAD it was built on top of. Committing that same tree as the next commit
keeps the artifact valid — the gate accepts a review made in `uncommitted` mode
when its recorded head is `HEAD^`, because the reviewed content is exactly what
became that commit. So `review -> commit -> PR` needs no second run. Anything
after that commit does make it stale: a second commit, a rebase, a cherry-pick
the gate does not recognise. An amend keeps the same parent, so the gate cannot
see content changes — rerun `/code-review` after an amend that changed anything
the review covered.

---

## Step 0: choose the reviewer model

The reviewer must differ from the author. Detect the author first.

**Author model**, best effort, in this order:

1. The model line in your runtime context (the session model).
2. `OPENCODE_MODEL` in the environment.
3. `model` in `opencode.jsonc` or `.opencode/opencode.json`.
4. The human, if the above disagree or are missing.

Do not trust a model's self description alone. It goes stale the moment the
model is switched, and it may be wrong. If detection is ambiguous, ask exactly
one question and offer the detected value as the default.

**Reviewer ladder**, first available whose family differs from the author:

```
opencode/deepseek-v4.1-flash-free
opencode/glm-5.3-flash-free
opencode/mimo-v2.6-flash-free
opencode/beam-free
```

Family is the leading token: `deepseek`, `glm`, `mimo`, `beam`, `muse`. A
different version of the same family is not a different model.

Overrides, highest first:

1. An explicit `--reviewer <provider/model>` from the human.
2. `model` in `.opencode/review.json` (project) or `~/.config/opencode/review.json`.
3. `fallback_models`, in order.
4. The ladder.

Rules:

- Never spawn a reviewer on the author family, even if asked. Say why and use
  the contrast.
- If the only reachable model is the author family, run it, mark the result
  `independence: degraded`, and say so in the report and to the human. A
  degraded review is still worth something. Pretending it is independent is
  not.
- State the choice before you spawn: "Author on `deepseek`; reviewing on
  `glm`, a different family." One line, then go.
- The orchestrator stays on the author model. Only reviewer agents get the
  override. Cheap orchestration, expensive review.

The same `review.json` configures the `opencode-review` plugin. Read it, do not
rewrite it.

---

## Step 1: plan the review

Resolve `SKILL_DIR` to the absolute path of this skill's folder, then run:

```
node "<SKILL_DIR>/scripts/plan-review.mjs" --level standard
```

Options: `--base <ref>`, `--chunk-tokens <n>`, `--max-context <n>`,
`--out <dir>`, `--level quick|standard|deep`, `--no-untracked`.

The script prints JSON. Read these fields:

- `empty` true: stop. Tell the human there is nothing to review. Do not
  manufacture one.
- `mode`, `base`, `head`, `branch`: the scope.
- `chunks[]`: each has `diffFile`, `files`, `tokens`, `truncated`.
- `totals`: files, added, removed, skipped, truncated chunks.
- `skipped[]`: lockfiles, generated output, binaries, snapshots. Say the count
  once, not per file.

Do not read the diff into your own context. The chunk files are for the
reviewer agents. You only need the plan.

Default budget is 40k tokens per chunk and a 200k window, set in
`review.json` (`chunk_tokens`, `max_context_tokens`). Leave it alone unless a
chunk fails to fit.

If Node is unavailable, do the same job by hand: `git diff` against the merge
base, skip lockfiles and generated files, split at 1,500 changed lines or
40k estimated tokens, one temp file per chunk. Say that you used the manual
fallback.

---

## Step 2: fan out the reviewers

Pick the passes from the level:

| Level | Passes | Agent budget |
|---|---|---|
| `quick` | `correctness` | 2 |
| `standard` | `correctness`, `security`, `conventions` | 4 |
| `deep` | `correctness`, `security`, `conventions`, `tests`, `history` | 8 |

Dispatch rule, deterministic:

- If `chunks x passes` is at or below the agent budget, spawn one agent per
  chunk and pass.
- Otherwise spawn one agent per chunk, with every pass listed in its brief,
  capped at the budget. If there are more chunks than the budget, rerun the
  planner with a larger `--chunk-tokens` so the count fits. Do not silently
  drop a chunk.

Spawn each reviewer with your client's general-purpose subagent tool and an
explicit model override. In this setup the general-purpose agent is `fixer`
(the other subagents are read-only or single-purpose): spawn it with the model
override and the instruction to write only the findings file. On a runtime
that has a `general` agent, use that. The prompt shape:

```
Read <SKILL_DIR>/reference/reviewer-brief.md and follow it.
Placeholder values:
  REPO_ROOT=<abs>
  MODE=<mode>
  BASE=<base>
  MERGE_BASE=<mergeBase>
  HEAD=<head>
  PASS=<pass or comma separated passes>
  LEVEL=<level>
  REVIEWER_MODEL=<model>
  AUTHOR_MODEL=<model>
  RUBRIC=<SKILL_DIR>/reference/rubric.md
  CHUNK_DIFF=<chunk.diffFile>
  CHANGED_FILES=<comma separated list>
  TEST_SIGNAL=<configured|none-by-design|none-yet>
  OUT_PATH=<planDir>/findings/agent-<n>.json
```

Rules:

- Pass file paths, never inline the rubric or the diff. The agent reads them.
  Your context stays small.
- Give every agent a unique `OUT_PATH`. Create `findings/` first.
- Run them in parallel in one message where the client allows it.
- Reuse one model for all agents in a round. The contrast is with the author,
  not between reviewers.
- The reviewer agent must be told to write only its `OUT_PATH`. A review that
  edits the code under review is not a review.
- Keep the one line each agent returns. Do not ask for the full findings in
  the reply. The file is the payload.

---

## Step 3: reconcile

```
node "<SKILL_DIR>/scripts/reconcile-review.mjs" \
  --plan "<planDir>/plan.json" \
  --author "<author model>" \
  --reviewer "<reviewer model>" \
  --level <level> \
  --expected <number of agents you spawned>
```

It applies the gate (confidence, changed line, dedupe, rank, cap), writes
`docs/reviews/<date>-<branch>.md`, and writes `result.json` plus
`.git/code-review/last-result.json`.

Read the JSON summary: `verdict`, `counts`, `complete`, `agents`, `reportPath`.

- `complete: false` means an agent did not report. That is not a clean review.
  Respawn the missing chunk once, with the next model in the ladder if the
  first failed at the provider level. If it fails again, keep
  `complete: false`, report the gap, and do not open the PR.
- Exit code 2 means no findings files at all. Treat it as a failed review, not
  as zero findings.

Do not edit the report by hand. If a finding is wrong, fix the input and
rerun. A hand edited result is a fabricated review.

---

## Step 4: act on the verdict

| Verdict | What happens |
|---|---|
| `blocked` | Report every blocker with `file:line`. The implementer fixes them. The PR does not open. |
| `changes-requested` | Fix the majors before the PR. Minors may be deferred with a note. |
| `approve-with-nits` | Proceed. Nits are optional. |
| `approve` | Proceed. Say that the review found nothing above the gate. |

The fix loop is separate from the review. Hand the findings file to the
implementer, let it fix, rerun the repo checks, then rerun `/code-review` from
Step 1. Maximum two rounds. If round three still has blockers, stop and put the
finding in front of the human. Do not loop forever, and do not lower the
threshold to make it pass.

Never fix code inside this skill. The reviewer model must not become the
author model.

---

## Step 5: Kodus, locally, after the review

Only after the review is at `approve` or `approve-with-nits`:

```
kodus review --prompt-only --staged --fail-on error
```

Stage first so the diff is small. Fix valid findings, run the repo checks,
rerun until it exits 0. The full loop lives in the `kodus-review` skill.

Why here, not earlier: Kodus is a second reviewer, not the first. Running it
before `/code-review` wastes its findings on issues the local gate would have
caught for free, and the user asked for this order.

No Kodus CLI installed: say so and continue. Never fake the result.

---

## Step 6: sync to the pull request

After the commit and `gh pr create`:

```
node "<SKILL_DIR>/scripts/post-review.mjs"            # dry run, prints the body
node "<SKILL_DIR>/scripts/post-review.mjs" --apply    # creates or updates the comment
```

One comment per PR, identified by a hidden marker. A second run patches the
same comment instead of adding another. If the PR head moved since the review,
the comment says which commit it reviewed and asks for a fresh run.

Add `--require-pr` in CI: a missing PR becomes exit 3 instead of a silent skip.

The comment is the record. Do not also paste the whole report into the PR body,
and do not post inline comments from local line numbers. Local lines drift
after a rebase. The comment carries `file:line` and the full reasoning.

---

## Step 7: the last resort, on GitHub

Kodus and PR-Agent run outside OpenCode, from `.github/workflows/`. They are
the last resort: a second security and bug net for anything this gate missed,
and the public record on the PR. Their findings still go to zero before the PR
URL is presented. They do not replace this step, and a clean GitHub run does
not excuse skipping it.

---

## Review levels and flags

```
/code-review                     standard, current branch plus uncommitted
/code-review --level deep        all five passes, more agents
/code-review --base develop      compare against a different base
/code-review --comment           also sync the result to the PR
/code-review --fix               apply the findings after the review
/code-review --reviewer opencode/glm-5.3-flash-free
```

To review someone else's pull request, check its branch out first
(`gh pr checkout 1234`) and run the gate on it. The planner only reviews the
checkout; it does not fetch a PR ref, and a review artifact must always name
the commit it covered.

`--fix` is the only path that edits code, and it runs after the review is
written, on the author model, as a separate step. It never happens inside a
reviewer agent.

Targets: the current branch (commits since the merge base plus uncommitted
changes) or an explicit `--base <rev>`. The planner takes a revision, not a
PR number and not a path: to review a pull request, check its branch out first.

---

## Failure handling

- **No base branch**: pass `--base`. Never guess a diff against `main` when the
  repo uses `develop`.
- **No commits yet**: make one commit, then review.
- **Reviewer provider down**: try the next ladder model. Record which model
  actually ran.
- **Chunk truncated**: the file has one hunk bigger than the budget. Say which
  file, and ask a human to read it. Do not claim coverage.
- **No `gh`**: the local review still runs and the report is still written. The
  PR sync is skipped with a clear note.
- **Secrets in the diff**: the report redacts common token shapes before
  posting. Do not paste a secret into a finding to prove a point.

---

## Reference files

- `reference/rubric.md`: dimensions, severity, confidence, what never to flag.
- `reference/reviewer-brief.md`: the spawn template each reviewer follows.
- `reference/output.md`: artifacts, the gate, verdict mapping, PR comment.
- `scripts/plan-review.mjs`: scope, classify, chunk, write diffs and plan.
- `scripts/reconcile-review.mjs`: gate, dedupe, verdict, report, state file.
- `scripts/post-review.mjs`: idempotent PR comment, dry run by default.

## Anti patterns

- Reviewing on the author model because it is already loaded.
- Feeding the whole diff into one 200k agent and calling it deep.
- Raising the confidence threshold until the PR is green.
- Reporting style, naming, or "consider adding tests" with no project rule.
- Posting findings inline from local line numbers.
- Opening the PR first and reviewing after, because CI is faster.
- Letting the reviewer fix the code it just reviewed.
