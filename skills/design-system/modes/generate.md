# Design System Mode: Generate

No system yet. Ask first, then scaffold from intent — never from assumption. When implementation was requested, scaffold alone is never completion: deliver the complete implemented system.

## 1. Ask intent

Before writing anything, detect the stack from manifests/configs first (manifest + lockfile, composer config, dependency manifests, solution/project files, app manifest + presentation dir); ask stack only if ambiguous. Then ask what the user wants to build: product type and style source (analyse the existing codebase, images / links / live previews they provide, or both) — ask only what the brief/references don't already answer. Also establish whether implementation is requested or documentation-only: documentation-only is allowed only per the docs-only test (`reference/master-instructions.md` §58) — otherwise default to delivering the implemented system. Wait for answers to consequential questions only (assumptions rule: §55); proceed on the rest. Be very accurate to the chosen source; when the brief plus references already establish direction, proceed rather than block.

## 2. Discover (before creating files)

Run this inventory first — no files until it is done:

1. Inspect repo, structure, deps, conventions, existing UI, requirements, references.
2. Fix product scope: platforms, stack, direction, a11y, themes, deliverables.
3. Inventory required pages/screens/workflows and the shared UI they need.
4. Justify primitives/components/variants/patterns/templates from that inventory — two-sided: no speculative libraries for unneeded features, and no using "avoid over-abstraction" to skip clearly justified components (§6, §47).
5. Draft design language, tokens, contracts, composition, validation — then scaffold.

Respect spec-only scope: when the brief asks for spec/proposal only (see the §58 test), stop at the proposal — do not build.

## 3. Scaffold (minimal viable system)

From `templates/`, create: `DESIGN_SYSTEM.md`, `tokens/` (colors, typography, spacing, radius, shadows, motion + index), `ai/` (`RULES.md`, `COMPONENT_MAP.json`, `DESIGN_TOKENS.json`, `PAGE_PATTERNS.json`, `VALIDATION.md`), `components.json` (reuse the stack's existing file, or scaffold from `templates/components.json` where the stack uses component aliases; omit otherwise), and primitives only (button, input, card, layout shells). Patterns, pages, and components grow as real UI needs them — never scaffold speculative ones. New registry entries start at status specified (planned) until implemented (see `reference/master-instructions.md` §58–§59).

## 4. Implement (when implementation was requested)

Deliver the complete system: runtime theme resources materialized for the actual stack; implemented primitives; implemented component library with variants and applicable states; documented + implemented page patterns; real pages composed from shared components (never per-page reimplementations of shared UI); registries updated to match real code; validation tooling run with a verified completion report. The proposal/scaffold is an intermediate deliverable, never completion, when implementation was requested.

## 5. Reuse protocol (6 steps)

Need a style or piece of UI? Walk all six steps, in order:

1. Registry first — search the `ai/` registry (`COMPONENT_MAP.json`, `PAGE_PATTERNS.json`, `DESIGN_TOKENS.json`) for a fit.
2. Source + shared styles — read the matched component source and its shared styles/tokens before touching anything.
3. Variant/composition fit — check whether an existing variant, slot, or composition covers the need. Variants may differ in appearance (documented); reuse ≠ identical.
4. Reuse — use the shared component as-is. Shared cards, buttons, badges, tags, nav items, form fields, dialogs, and feedback are never reimplemented per page.
5. Extend — on legitimate repeated need, extend the shared component's variant API (new variant or slot). Never a one-off wrapper around a single call site.
6. Create only when justified — no fit above, plus a recurring or load-bearing need, built from the layer below. Then document it, register it in `ai/` with a truthful status, and add visual contracts + tests per the stack's tooling (see the matching `approaches/` file).

## 6. CSS materialization

App code must NEVER `@import` or otherwise reference `design-system/*.css` across package boundaries. Canonical tokens live in `design-system/`; each app materializes its own copy into its own styles location (app CSS, root CSS, or monorepo frontend styles dir — whichever owns the runtime). `design-system/` is source, app styles are generated copies. Non-CSS stacks materialize tokens as native runtime values instead (see the matching `approaches/` file).

## 7. Unknowns stay TBD

Mark anything genuinely undecided as TBD in the docs — never TBD where real values are determinable from the brief, references, or codebase. Never invent product values (brand color, font, copy) to fill a template — ask, or leave TBD.

Then build under `reference/master-instructions.md` (creation rules, contracts, states, validation, checklists, statuses, completion gates).
