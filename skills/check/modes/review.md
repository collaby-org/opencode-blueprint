# /check review (fresh model code review)

The `review` mode of `/check`: a senior code review, before merge, on a different model than wrote the code. Follow it fully.

This is the quick single pass. The mandatory, chunked, multi agent gate that blocks the PR lives in the `code-review` skill (`/code-review`); it runs on the final HEAD, after the rebase, and the gate refuses `gh pr create` without it. This mode never replaces that gate, and it does not duplicate its rubric.

## What this skill does

Your role: the senior reviewer with fresh eyes, the one who didn't write the code. Read the diff for what it actually does, not what it was meant to do; rank findings by the harm they'd cause in production. The one rule that never bends: the review runs on a different model family from the author, because a model reviewing its own output shares its blind spots. Write severity ranked findings.

- Different model family, automatically: the review runs in a subagent on a model from another family than the author. No API keys, no external setup.
- Read only on code: produces findings, never edits the code under review.
- The reviewer ladder and the review rules live in the `code-review` skill (`skills/code-review/SKILL.md`). This mode never defines its own.

Owns review findings (`docs/reviews/check-*.md`). Does not write code, tests, specs, or the `AGENTS.md`/`CLAUDE.md` context files.

## Asks vs acts

Acts, with one deliberate exception: it confirms which model wrote the code before reviewing (a single MCQ, with the detected value selected by default), because the model can't reliably detect itself and a wrong guess silently breaks the cross model guarantee (see Step 1). Everything else (scoping, reviewing, writing findings) it does without asking. It states which model is reviewing so you can still redirect, and pauses if there is nothing to review (clean tree, no branch diff). The confirm is skipped when you pass an explicit `with <model>` override and detection was unambiguous.

Steering: `/check review` (default contrasting model), `/check review with <model>` (force a reviewer), or `/check review uncommitted` (scope to working tree changes only).

## Artifact ownership

`docs/reviews/check-<YYYY-MM-DD>-<branch>.md`, created by this mode only. The subagent writes it; the main model relays a summary.

The `code-review` skill owns the unprefixed `docs/reviews/<YYYY-MM-DD>-<branch>.md`. The two paths never overlap, so neither mode ever overwrites the other's findings. If both run on the same change, both reports stand.

Artifact base: findings live under `docs/` by default. If `docs/` is a published docs site (`docusaurus.config.*`, `.vitepress/`, `mkdocs.yml`, Astro Starlight, or Nextra detected), use `.workflow/` instead (`.workflow/reviews/`). Always follow whichever base, `docs/` or `.workflow/`, already exists (paths here assume `docs/`).

---

## Portability (any OS, any agent)

Any Agent Skills client on macOS, Linux, or Windows:
- Commands: `git` is the only required CLI and behaves the same on every OS; run the `git` lines as shown. Other shell snippets are POSIX reference, not literal scripts: don't assume `find`, `grep`, `sed`, `cat`, `test`/`[ ]`, `ls`, `xargs`, or `for` exist. Use your agent's cross-platform file tools (read, search/glob, write) for those, and apply branching logic yourself rather than via shell `if`/variables/redirects.
- Bundled files: referenced by paths relative to this skill's folder. The main agent resolves the folder to an absolute path (it already resolves these relative paths, so it knows the folder) and passes absolute file paths in the subagent prompt; it must not read the bundled files' contents into the main context; the subagent reads them by path. Fallback: if your client's subagents cannot read files, read and inline the contents instead.
- No subagent support? The cross-model guarantee then needs another assistant: open the diff there, run the review on a different model, and bring the findings back. If that is not possible, run the review inline and say plainly that it is a same-model review with the author's blind spots, never a cross-model one.

## Execution

### 1. Determine the author model, then pick a DIFFERENT reviewer

The one rule that never bends: the reviewer runs on a different model family from the author. The ladder of reviewer models and the review rules live in the `code-review` skill (`skills/code-review/SKILL.md`); this mode never defines its own. Read that file and use its ladder and its rules.

**Author model.** The author model is whatever this session runs on. There is no in-session switch: the only supported way to review on another model is to spawn the reviewer on it. Detect it best effort, in the order the `code-review` skill defines (Step 0): the model line in your runtime context, then `model` in `opencode.jsonc` or `.opencode/opencode.json`, then a host hint such as `OPENCODE_MODEL`. Do not rely on a model's self description alone, it goes stale the moment the model is switched and it may be wrong. If detection is ambiguous, ask exactly one question and offer the detected value as the default:

```
"Which model wrote this code? I'll review on a different one."
  header: "Author model"
  options:
    - label: "<detected> (detected, recommended)"
      description: "I'll review on a different model family for a fresh perspective"
    - label: "<another model>"
      description: "The review will run on a different family than this one"
```

Present via your agent's interactive option picker, or as plain-text options with the same choices if it has none. Skip the question only when detection was unambiguous and the user passed an explicit `with <model>` reviewer override (the override settles which model reviews).

**Reviewer.** Spawn the reviewer on a model from a different family than the author, using the ladder in the `code-review` skill. A different version of the same family is not a different model.

Rules:
- The reviewer must never run on the author's own family. If the user names the author's own model, say why and use the contrast.
- If no different family is available (an org restriction on available models, or a client whose subagents inherit the parent's model), say so plainly: "No reviewer on a different model family is available here." Never claim a cross-model review. Either run it inline on the author's model and label it a degraded, same-model review, or stop and put it to the human.
- If the user passed `with <model>`: honor it only if its family differs from the author's.

State the final choice plainly before spawning:
> "Author on `<author family>`; running the review on `<reviewer family>`, a second model catches what the author model is blind to."

### 2. Scope the change set (cheap, names only, let the subagent read the diff)

Keep the main context lean: gather file names and the base ref only. The subagent runs the actual `git diff` and reads files. Choose a mode (apply the branching logic yourself, not via shell `if`/variables):
- Base branch `BASE`: `git rev-parse --verify main`; on success use `main`, otherwise `master`.
- Current branch `CUR`: `git rev-parse --abbrev-ref HEAD`.
- If `CUR` equals `BASE` (working directly on the base branch) → `MODE=uncommitted`. Gather changed names with `git diff --name-only HEAD` plus untracked files via `git ls-files --others --exclude-standard`.
- Otherwise (feature branch: review everything that differs from the base, the PR-equivalent) → `MODE=branch`. Resolve the merge base with `git merge-base "$BASE" HEAD`, then gather names with `git diff --name-only <merge-base>` (committed-since-branch + uncommitted) plus untracked files via `git ls-files --others --exclude-standard`.

If the user passed `uncommitted`, force `MODE=uncommitted` regardless of branch.

De-duplicate the file list. Exclude lock files and generated output (`dist/`, `build/`, `.next/`, `coverage/`) from the count, but the subagent still sees the full diff.

If the change set is empty: stop and tell the engineer there's nothing to review (make a change first, or point /check review at a branch). Do not spawn.

### 3. Gather lightweight pointers (do NOT read heavy files here)

Paths and cheap signals only; the subagent reads on demand. Using your file tools: list the 3 most-recent spec files under `docs/specs/` (paths only), and resolve the test signal, one of three states, not a yes/no:
- `TESTS = configured`: `test-preferences.json` sets `"tool"` to a framework (a runner is set up). Judge test adequacy normally.
- `TESTS = none-by-design`: `test-preferences.json` has `"tool": null` and a `"gate"` (e.g. `"typecheck+verify"`), or the nearest `AGENTS.md`/governing spec states a "no test runner" convention. Deliberate: the gate is typecheck + `/check verify`, not a suite.
- `TESTS = none-yet`: no `test-preferences.json` at all, and no stated convention. A genuine gap.

Pass to the subagent: project-context contents inline (read `AGENTS.md`, canonical, or `CLAUDE.md` as fallback; short), the 3 recent spec paths, the base ref / merge-base, and the diff scope. The subagent reads a governing spec's **build-spec sections only** (`index.md`: Requirements, Decision, the design section, Consequences), the contract to review against; not `rationale.md` (decision history), unless a specific finding hinges on the reasoning. It runs `git diff` itself and reads the changed files and their tests.

### 4. Spawn the review subagent: on a different model family

Resolve this skill's folder to an absolute path (you, the main agent, already resolve these relative paths, so you know the folder) and pass the absolute paths of two bundled files in the spawn prompt: `review-agent-prompt.md` (the spawn template) and `review-guide.md` (the rubric). Do not read their contents into the main context; the subagent's first action is to `Read` `review-agent-prompt.md` by path and follow it. Pass the dynamic values as a labeled list in the spawn prompt (`Placeholder values: ...`). Fallback: if your client's subagents cannot read files, read both files and inline their contents into a filled prompt instead (the old behavior). Then spawn:

- `model`: the reviewer model chosen in Step 1 (different family from the author)
- `description`: `"Review: <N> changed files on <reviewer-model>"`
- Tools: `Read`, `Bash`, `Grep`, `Glob`, `Write`, no `Edit` (the reviewer reports, it does not change code)
- `prompt`: the absolute path to `review-agent-prompt.md` (Read it first, then follow it), plus `Placeholder values:`, a labeled list supplying:
  1. `REVIEW_GUIDE`: the absolute path to `review-guide.md` (the subagent reads it as its rubric)
  2. Diff scope: `MODE`, `BASE`, `MERGE_BASE`, and the changed-file list with the exact `git diff` command to run
  3. Project-context contents (inline), `AGENTS.md` or `CLAUDE.md` fallback, the conventions the review must enforce
  4. Recent spec paths (read if relevant), or inline the relevant spec text if your client gives subagents no file access
  5. The test signal (`configured` / `none-by-design` / `none-yet`) so it judges test adequacy correctly; never nag for tests on a `none-by-design` project
  6. Output path for findings: `docs/reviews/check-<date>-<branch>.md`

### 5. Relay the result

If the subagent errored or wrote no findings file, report the failure and offer to re-run; don't relay an empty or fabricated review. Otherwise it writes the findings file and returns a compact summary. Relay:

```
## /check review <feature> Â· <Approve | Approve with nits | Changes requested | Blocked>

Blockers (<count>) Â· fix before merge:
- <file:line Â· one line>
Major (<count>):
- <file:line Â· one line>
<count> minor/nits · strengths: <one line> · reviewed by <reviewer-model> over <N> files. Full findings in docs/reviews/check-<date>-<branch>.md.
```

Lead with the verdict; show every blocker and major (they are the action); collapse minors/nits, strengths, and the reviewer/scope to the one tail line plus the file pointer. Zero blockers and zero majors → just the verdict line and the tail, nothing more.

For a high-stakes change (verdict was Blocked or Changes requested, or the change is high/critical severity), append one line:
> "For an independent second opinion, spawn the reviewer on another model family (the `code-review` skill holds the ladder) and re-run /check review."

**Tick the scope box (closing gate).** If the reviewed feature has a row in `docs/scope/`, tick its `Review it` box (the review ran; the box marks that, not that it passed) and confirm it in the report: "Scope: ticked `Review it`." No matching row → say so ("no scope row matched `<feature>`, tick it manually or enroll it"). This is the only scope edit review makes; it writes no code, tests, or specs.

This skill is complete after relaying. It does not fix findings (the implementer does) or invoke other skills; its job is the assessment.

---

## Reference files (in this skill's folder; relative paths)

- `review-agent-prompt.md`: lean spawn template; the main model passes its absolute path in the spawn prompt and the subagent reads and follows it
- `review-guide.md`: rubric, severity, findings format. The main model passes its absolute path in the subagent prompt; the subagent reads it (inline its text only if your client's subagents cannot read files).
