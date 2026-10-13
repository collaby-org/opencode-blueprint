# Design System Mode: Redesign

Explicit substantial-redesign intent overrides folder state — follow this mode even when a system already exists and is non-empty. ADOPT's never-replace rule does not apply here; replacement is permitted where the brief requires it, resolved per stage D. When implementation was requested, the proposal alone is never completion: deliver the implemented + migrated system through stage E.

## A. Brief

Ask targeted questions only — visual direction, information architecture, branding, compatibility constraints, scope, and whether implementation (including app migration) is requested or documentation-only. Documentation-only is allowed only per the docs-only test (`reference/master-instructions.md` §58). Detect the stack from manifests/configs first; never ask what the user already answered; when references plus the brief already establish direction, proceed rather than block (assumptions rule: §55).

## B. Audit

Compare the current implementation against the requested direction and document:

- Must-change vs must-remain.
- Reusable vs redesign components.
- Obsolete tokens and page patterns.
- Still-mandatory accessibility, safety, and architectural requirements.
- Conflicting existing contracts.

## C. Proposal (before broad implementation)

Write the proposal before broad implementation. Cover:

- Brand identity + visual principles.
- Semantic color tokens for light AND dark.
- Typography, spacing, radius, surface, and motion tokens.
- Primitive + component hierarchy with variants and complete interaction states.
- Navigation + information architecture.
- Page-pattern specs for all relevant destinations.
- Onboarding, dialogs, empty / error / progress / destructive workflows.
- Validation criteria.

References are design evidence — never invent product requirements, never copy sample data as real data. The proposal is an intermediate deliverable, never completion, when implementation was requested.

## D. Conflict resolution

- REDESIGN permits replacing existing visual conventions where the brief requires it.
- Every overridden convention gets a one-line why.
- Non-negotiables that survive any redesign: accessibility, safety, architectural constraints, the CSS materialization rule (canonical tokens live in `design-system/`; each app materializes its own copy — never reference design-system CSS across package boundaries).

## E. Implement + migrate (when implementation was requested)

- Replace outdated tokens, variants, and patterns when the audit justifies it; carry reusable components forward through the reuse protocol below.
- Preserve required functionality, safety, accessibility, and architecture throughout.
- Implement the shared system first, then migrate the actual app screens onto it — shared cards, buttons, badges, tags, nav items, form fields, dialogs, and feedback are never reimplemented per page.
- Validate the migrated screens and update the registries to match real code, with truthful statuses and a verified completion report.

## F. Reuse protocol (6 steps)

Need a style or piece of UI? Walk all six steps, in order:

1. Registry first — search the `ai/` registry (`COMPONENT_MAP.json`, `PAGE_PATTERNS.json`, `DESIGN_TOKENS.json`) for a fit.
2. Source + shared styles — read the matched component source and its shared styles/tokens before touching anything.
3. Variant/composition fit — check whether an existing variant, slot, or composition covers the need. Variants may differ in appearance (documented); reuse ≠ identical.
4. Reuse — use the shared component as-is. Shared cards, buttons, badges, tags, nav items, form fields, dialogs, and feedback are never reimplemented per page.
5. Extend — on legitimate repeated need, extend the shared component's variant API (new variant or slot). Never a one-off wrapper around a single call site.
6. Create only when justified — no fit above, plus a recurring or load-bearing need, built from the layer below. Then document it, register it in `ai/` with a truthful status, and add visual contracts + tests per the stack's tooling (see the matching `approaches/` file).

Then build under `reference/master-instructions.md` (contracts, states, a11y, responsive, validation, checklists, statuses, completion gates).
