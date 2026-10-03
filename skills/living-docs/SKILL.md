---
name: living-docs
description: Maintain repo living docs in docs/ (changelog, system_diagram, targets, roadmap, tech_stack, project-doc). Use at task start (check-first before planning), when creating missing docs from codebase analysis, and after each task to update them. Use whenever docs look stale vs code.
---

# Living Docs

Six files in `docs/`, kept accurate against the real codebase. Stale docs are a bug.

## Placement

- **Single-repo:** root `docs/` (`docs/changelog.md`, etc.).
- **Monorepo:** root `docs/` for shared decisions plus per-app `docs/` following the actual repo layout (e.g. `docs/` + `apps/frontend/docs/`). Follow the repo shape — never force an example path.

## Entry Modes

Pick one per task:

1. **Init new** — scaffold all six files, fill what is known, fill the rest as you go. No guessing: mark unknowns as TBD, never invent.
2. **Existing with files** — read all six before planning. Verify claims vs code; flag drift explicitly and fix it.
3. **Existing without** — implement from real code, configs, manifests, migrations. Never guess. Be very accurate: every entry must reflect what is really there.

## Lifecycle

- **Check-first.** At task start, check which files exist and read every one that does — before planning, not after.
- **Create-if-missing.** Missing file → create from codebase analysis (code, configs, manifests, migrations). Never guess.
- **Update-after-each-task.** After every task, update what changed, what is now true, what is next. Tight factual lines, no filler, no aspirational claims.

## Contents

- `changelog.md` — dated entry per change; in multi-app repos scope each entry to its app.
- `system_diagram.md` — real architecture and data flow as it runs today (mermaid ok). Hint: components + connections + data direction.
- `targets.md` — current acceptance criteria and their status. Hint: one line per criterion, status marker (done / open / blocked).
- `roadmap.md` — sequenced next steps, checked off as done. Hint: ordered, smallest shippable step first.
- `tech_stack.md` — actual runtimes, frameworks, DBs, and versions in use. Hint: read from manifests/lockfiles, not memory.
- `project-doc.md` — product decisions WITH reasoning; reasoning matters more than decisions. Sections with one-line hints:
  - What it is — one-paragraph product summary.
  - Problem — the pain this removes.
  - Who it's for — primary user and context.
  - Why it hasn't stuck before — prior attempts and why they failed.
  - The rule everything rests on — the single principle other decisions follow.
  - Scope — what v1 does.
  - Out-of-scope with why for each — excluded item + reason.
  - How it works — behavior constraints, not folders (what must hold true at runtime).
  - Interface — surfaces and entry points.
  - Where likely to go wrong — top failure modes.
  - Ship criteria — verifiable specifics, not "looks right".

## Versions

- Fix → patch, feature → minor, breaking → major.
- Multi-app: version and changelog each app independently — bump only the app(s) that changed, and record the bump in that app's `changelog.md`.

## Remember

- Analyse the actual codebase — never guess, never paste aspirational content.
- Keep entries short and factual; docs follow code, not the reverse.
- Never leave diverged docs behind: update in the same task that changed the code.
