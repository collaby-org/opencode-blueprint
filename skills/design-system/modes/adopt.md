# Design System Mode: Adopt

> Guard: if the user asks for substantial redesign (SKILL.md Entry-scan test: replaces tokens/brand/IA/navigation or reworks more than roughly a third of components), stop — switch to `modes/redesign.md` instead. The never-replace rule below does not apply there.

The system exists. Follow it, extend it, never replace it.

## 1. Inspect

Read in this order, cheapest first:

1. `design-system/DESIGN_SYSTEM.md` + the `ai/` registry (`RULES.md`, `COMPONENT_MAP.json`, `DESIGN_TOKENS.json`, `PAGE_PATTERNS.json`, `VALIDATION.md` if present).
2. `design-system/tokens/` (naming and prefix convention, CSS vars or native tokens) and `components.json` if the stack uses one.
3. Runtime owners per the matching `approaches/` file (e.g. on Next.js stacks: `package.json`, `components.json`, Tailwind config, app CSS / root CSS / `lib/styles/`, `components/`, `app/` or `src/app/`; other stacks: their own manifests, asset pipelines, stylesheets, view/template dirs, `patterns/`, `pages/`).

## 2. Determine canonical vs legacy

More than one token source or styling approach means one is legacy. Canonical wins by: referenced from the runtime-owned CSS (the materialized copy), referenced by the registry, newest changelog entry. Name the legacy source explicitly and never extend it; migrate reads toward canonical only where the task already touches that code.

## 3. Reuse protocol (6 steps)

Need a style or piece of UI? Walk all six steps, in order:

1. Registry first — search the `ai/` registry (`COMPONENT_MAP.json`, `PAGE_PATTERNS.json`, `DESIGN_TOKENS.json`) for a fit.
2. Source + shared styles — read the matched component source and its shared styles/tokens before touching anything.
3. Variant/composition fit — check whether an existing variant, slot, or composition covers the need. Variants may differ in appearance (documented); reuse ≠ identical.
4. Reuse — use the shared component as-is. Shared cards, buttons, badges, tags, nav items, form fields, dialogs, and feedback are never reimplemented per page.
5. Extend — on legitimate repeated need, extend the shared component's variant API (new variant or slot). Never a one-off wrapper around a single call site.
6. Create only when justified — no fit above, plus a recurring or load-bearing need, built from the layer below. Then document it, register it in `ai/` with a truthful status, and add visual contracts + tests per the stack's tooling (see the matching `approaches/` file).

## 4. Smallest-consistent-change

Extend the system in its own idiom: same token prefix, same variant API, same file shape. Match surrounding conventions exactly; a change that "improves" the convention itself is a separate task. Registry entries are updated in the same change — entries map to real implementations or are marked specified (planned) — planned is never counted as implemented.

Then apply `reference/master-instructions.md` (contracts, states, a11y, responsive, validation, checklists) to the work.
