# Design System Master Instructions

The full rule set. `SKILL.md` routes here; modes stay lean and point here. Conventions below use Next.js + Tailwind + shadcn as the worked example — adapt per `approaches/` for other stacks, never force the example onto a mismatched stack; on conflict the matching approach overrides.

## 1. Hierarchy

Build strictly upward: tokens → primitives → components → patterns → templates → pages → features. A layer may only consume the layer directly below it.

## 2. Raw values live in tokens only

No raw color, hex, pixel, font, shadow, or duration value may appear above the token layer. If a value has no token, add the token — never inline the value.

## 3. Semantic token naming

Name tokens by role (`bg-primary`, `text-muted`, `accent`), never by value (`blue-500`, `12px`). Roles survive rebrands; values do not.

## 4. Prefix convention

Every token carries the repo prefix (e.g. `myapp-` → `--myapp-bg-primary`). One prefix per system; match the existing convention in ADOPT mode, establish it in GENERATE mode.

## 5. Reuse-before-create

Walk top-down and stop at the first fit: page pattern → pattern → component variant → primitive → token. Check existing code and the matching stack registry (e.g. `npx shadcn@latest search` on Next.js stacks — see `approaches/nextjs.md`) before writing new UI.

## 6. Creation rules

Create a new token, component, or pattern only when (a) no existing entry fits, (b) the need recurs or is clearly load-bearing, and (c) it is built from the layer below. One-off page styling is not a pattern.

## 7. Component contracts

Every component exposes an explicit variant API (props + variants + defaults). Same prop names and semantics across components; no hidden global state, no reaching past the contract.

## 8. Composition

Document page → sections → components with assembly rules: which sections a page allows, which components each section allows, and ordering constraints. Give real examples, not abstract advice.

## 9. Primitives inventory

Primitives are the only headless/raw layer: button, input, select, card/surface, layout shells, text. Everything else composes them. Never ship default-state primitives — theme with semantic tokens (e.g. shadcn on Next.js stacks).

## 10. Spacing scale

One base unit, one scale, the stack's gap mechanism for gaps (e.g. `gap`, never `space-x/y`, in utility-class stacks). Rhythm must be eyeball-consistent across pages; arbitrary values are a token-miss — add the token.

## 11. Typography scale

One family stack, one size/weight/line-height scale, roles (`heading`, `body`, `caption`, `label`). Body text never below the agreed minimum; hierarchy through scale and weight, not ad-hoc sizes.

## 12. Color roles and accent discipline

Roles: background, surface, text (+muted), accent, border, danger/success/warning. Exactly one accent color. Status colors carry meaning only — never decoration.

## 13. One radius scale

A single radius ramp used everywhere (buttons, cards, inputs, sheets). Square elements use the stack's sizing mechanism (e.g. `size-*` in utility-class stacks). No per-component radius invention.

## 14. Surfaces, shadows, elevation

Surfaces stack by role (page → surface → raised → overlay), each with its elevation token. Shadows signal depth only; flat alternatives must exist for low-power/reduced-transparency contexts.

## 15. Motion tokens

Animate `transform` and `opacity` only. UI motion stays under 300ms, ease-out for enter, custom curves deliberate, springs for gestures. Purpose every animation or drop it; match motion to mood (crisp dashboard, playful marketing).

## 16. Buttons

Variants by intent (primary, secondary, ghost, danger), sizes from the spacing scale, full state coverage (§25–§27), active press feedback on all. One primary action per view.

## 17. Cards

Card = surface + radius + elevation + content slots (header/body/footer). Metric cards share one layout (label, value, delta, sparkline slot). Never style card-likes from scratch.

## 18. Forms

Every field: label, input, hint, inline error slot. Validate on submit + touched; errors name the fix, not the rule. Group related fields; one column unless comparison demands two.

## 19. Tables

Density from tokens; sortable headers where data invites comparison; pagination or virtualization past one screen of rows; row actions consistent (same position, same affordance); empty/filtered states per §28–§30.

## 20. Navigation

One primary nav per surface; active route always visible; where the surface has a small form factor, collapse follows one defined pattern (bottom bar, drawer, or menu — chosen once, used everywhere). Breadcrumbs where depth exceeds two levels.

## 21. Header pattern

App header slots: brand/nav, search or command entry, notifications, account. Same order on every page; page titles live in content, not the header.

## 22. Dashboard pattern

Dashboard = header summary strip (key metrics) + grid of cards/tables + drill-down links. Above the fold answers "how are things"; detail lives one click down, never crammed in.

## 23. Landing and marketing pattern

Hero fits the viewport; one claim, one accent, one call to action. Sections follow one rhythm (claim → proof → action). Playful motion allowed within §15 budgets.

## 24. Page patterns (general)

New pages assemble registered patterns only. A page pattern names its sections, each section names its components, and deviations need a recorded reason. Responsive behavior is part of the pattern, not an afterthought.

## 25. Interactive states

Every control ships default, hover/pressed, focus-visible, and active states. Press feedback is mandatory — no dead-feeling taps.

## 26. Disabled and readonly states

Disabled = visibly inert (reduced opacity per token, no pointer events, `aria-disabled`); readonly = legible but non-editable, visually distinct from disabled. Never hide why: pair with a reason where the cause is not obvious.

## 27. Loading states

Skeletons matching the layout (same skeleton shape as the content it replaces), never bare spinners for page loads. Buttons show inline progress and lock against double-submit.

## 28. Empty states

First-run empty ≠ no-results empty ≠ error empty. Each names the situation, offers the next action, and uses the illustration slot consistently (or none — chosen once).

## 29. Error states

Errors state what happened, what it affects, and the recovery path (retry, go back, contact). Never raw error dumps to users; log the technical detail, show the human path.

## 30. State coverage (applicable states only)

Ship every applicable state from the first version — "states later" is a defect, not a plan. Applicability is per control and per surface: buttons and async actions ship loading + disabled where they can be pending or unavailable, with inline progress and double-submit locks; empty states belong to collections and content surfaces (lists, tables, search results, dashboards), never to single controls. Never force nonsense states (a button has no empty state); §59 lists the completion gates, §25–§29 define each state.

## 31. Accessibility

WCAG AA contrast minimum everywhere including muted text and placeholders. Visible focus rings on all interactives. Labels on all inputs; icon-only buttons get accessible names. Touch targets meet platform minimums.

## 32. Reduced motion

Honor `prefers-reduced-motion`: essential state changes instant, decorative motion off. No animation may carry meaning alone — pair with a static cue.

## 33. Responsive

Design mobile-collapse explicitly per pattern where the form factor has a small surface (what stacks, what hides, what moves to overflow). No horizontal page scroll; tables scroll in-card with sticky headers. Touch and pointer both first-class where both exist.

## 34. Dark mode

Dark mode from the start: every color role has both modes, validated side by side. Never invert-by-filter; author both palettes. Persist the choice; respect system default initially.

## 35. Registries

`ai/` holds the machine-readable system: `RULES.md` (deterministic agent rules), `COMPONENT_MAP.json` (component → variants/states/status/sources/visual-contracts), `DESIGN_TOKENS.json` (prefix + all token values + status), `PAGE_PATTERNS.json` (page → sections → components + status), `VALIDATION.md` (checks). Skeletons in `templates/`. Every entry carries a status (§59): specified, implemented, integrated, or validated. Entries map to real implementations or are marked specified (planned) — planned is never counted as implemented. Page-pattern entries describe real pages or approved ready-to-build patterns, never placeholder routes.

## 36. Registry sync

Registries are deterministic and truthful — an entry is either used by code or it does not exist as implemented. Adding UI without registering it (or registering UI that does not exist) fails validation. Stale entries (registered but unreferenced by code), token mismatches (registry values diverging from runtime theme resources), and invalid references (components, patterns, or routes that resolve nowhere) fail validation where the stack permits deterministic checks. Keep validation decidable: never make the AI judge what the system already defines. No example components, placeholder routes, or TBD where real values are determinable — genuinely undecided values stay TBD and are marked specified (planned).

## 37. Workflow: new page

Inspect the page need → search the registry → reuse patterns/components → apply page patterns → tokens only → responsive check → validate → fix → re-validate. No new component unless §6 allows; when one is created, document + register + visual contracts + tests per the stack's tooling (§40).

## 38. Workflow: modify page

Read the page's registered pattern first; change within its assembly rules. Pattern-level changes propagate to all pages using the pattern — flag that blast radius before editing.

## 39. Workflow: new component

Prove §6 (no fit above), design the variant API, build on primitives with tokens only, cover applicable states (§30), write visual contracts per variant/state for the stack's tooling (§40), register in `COMPONENT_MAP.json`, document usage + anti-usage.

## 40. Stories and visual contracts

Every component ships a visual contract for each variant and each applicable state (§30), plus a kitchen-sink view per pattern: stories where the stack has story tooling, rendered states on device/simulator for native stacks, representative page renders for document-rendered stacks. The contract is what reviewers check against — the mechanism follows the stack (see the matching `approaches/` file), never an unjustified demand for tooling the stack does not use.

## 41. Validation

Run, in order, adapting each check to the actual stack (see the matching `approaches/` file — never demand tooling the stack does not use): registry sync (§36) → token audit (no raw values above tokens) → applicable-state coverage per interactive (§30) → AA contrast everywhere it applies, in every supported theme → responsive behavior per pattern (mobile-collapse where the form factor has it) → typecheck + lint where the stack has them. Fix, then re-run until green.

## 42. design:check

`design:check` is the repo's single design gate: it runs §41 end to end and exits non-zero on any failure. Wire it into CI for UI packages; stacks without scripted gates enforce §41 through their own mechanism (see the matching `approaches/` file). No UI PR merges red.

## 43. Pre-completion checklist

Before calling UI work done: applicable states covered (§30), every supported theme rendered, responsive behavior verified per pattern, registry updated with truthful statuses, visual contracts added per §40, `design:check` green (or the stack's equivalent evidence per §42), screenshots or renders attached for visual diffs. Full generation/redesign implementation additionally meets the completion gates in §59. Adapt each item per the matching approach — no visual gates for backend-only work.

## 44. Forbidden patterns

Raw colors/hex/spacing in components; `space-x/y` (in utility-class stacks — use the stack's gap mechanism); hand-rolled SVGs; emoji as icons; default-state primitives (e.g. unthemed shadcn where the stack uses it); hardcoded palettes; per-component radius invention; `@import` of design-system CSS across package boundaries (see SKILL.md Invariants — CSS materialization; per-stack in `approaches/`).

## 45. Icons

One icon family per project. Static + animated sourcing per the matching stack approach (on Next.js stacks: Lucide via the component registry — see `approaches/nextjs.md` for the invocation). Sizes from the spacing scale; never decorative-only meaning carriers.

## 46. Custom-styling allowance

Escape hatches (arbitrary values, one-off CSS) are allowed only when: the system genuinely lacks the value, the need is proven single-use, and a TODO references the token proposal. Review converts repeats into tokens.

## 47. Over-abstraction

Do not create abstractions for single uses: no wrapper components around one call site, no pattern entries for one page, no tokens for one value. Duplicated twice → candidate; third use → systematize.

## 48. Domain UI

Domain-specific components (charts, tickers, order books) live near their domain, built strictly on primitives + tokens. They are consumers of the system, never extensions of it — shared needs graduate upward through §39.

## 49. Evolution

The system grows by use: new patterns enter through real pages, new tokens through real values. Quarterly, prune unused entries (registry vs code diff); a system nobody prunes becomes a catalog nobody trusts.

## 50. Refactoring

In ADOPT mode, migrate legacy toward canonical in task-sized steps: one surface per change, legacy and canonical never extended in parallel, registry updated in the same change. Big-bang restyles are forbidden in ADOPT. REDESIGN mode is the exception: broad replacement is permitted there where the brief requires it, with a one-line why per overridden convention (see `modes/redesign.md` stage D).

## 51. Decision rules

When system and task disagree, the system wins unless the task records why. When the system is silent, §5–§6 decide. The AI never invents a third option (custom palette, new radius, novel pattern) to resolve ambiguity — it asks, or follows the nearest registered answer.

## 52. Visual fidelity and the Apple-clean bar

Every button and step feels inevitable: generous whitespace, one accent, consistent rhythm, hero fits viewport, zero placeholder chrome. Finish means a stranger could use it without explanation.

## 53. Screenshot implementation

Implementing from screenshots: extract layout → spacing rhythm → color roles → type scale → component inventory, in that order. Match structure with system primitives; never pixel-tweak raw CSS to "look right" — missing values become tokens (§2). See `approaches/screenshot-derived.md`.

## 54. Source-of-truth priority (runtime-first)

Conflicts resolve: running code > screenshots/live previews > docs > memory. The runtime is what users get; docs describe it, never override it. Cite the winning source when recording a decision.

## 55. Never-guess, completion, final questions

Never guess values, intent, or product meaning — analyse the codebase, configs, and provided sources; mark unknowns TBD and ask. Record reasonable non-blocking assumptions and proceed; wait for the user only on genuinely consequential decisions (scope, direction, irreversible or destructive changes). Completion standard: registry green, every supported theme, all applicable states, responsive behavior verified, `design:check` passing (or the stack's equivalent evidence per §42). End with final questions: list anything still TBD or assumed, each with a recommendation, and wait rather than ship ambiguity.

## 56. Registry sourcing and allowed extras

Animated icons come from a registry compatible with the stack (sourcing and invocation per the matching `approaches/` file — e.g. `approaches/nextjs.md`). Never hand-roll SVGs, never emoji icons, one icon family per project.

Magic UI and Aceternity UI are allowed on shadcn-compatible stacks — both are shadcn-compatible registries. Never ship default-state primitives; theme composed components and variants with semantic tokens.

## 57. Complete system (generation / redesign implementation)

For generation and redesign tasks where implementation was requested, the workflow must deliver all of the following — documentation alone is never completion:

- Documented design language + brand (identity, visual principles).
- Semantic tokens AND real runtime theme resources materialized for the actual stack (CSS, native theme objects, stylesheets, or framework resources — see the matching `approaches/` file).
- Implemented primitives (button, input, card/surface, layout shells, text or the stack equivalent).
- Implemented component library (variants + applicable states per §30, explicit contracts per §7).
- Documented + implemented page patterns (assembly rules + real pattern implementations).
- Real pages composed from shared components (never per-page reimplementations of shared UI).
- Registries matching real code (§61), with truthful statuses (§59).
- Validation tooling + a verified completion report (gates in §59, checklist in §43).

`DESIGN_SYSTEM.md` is documentation, not proof — proof is running code plus green deterministic checks. Scope-appropriate: deliver only what the brief/references require — never invent features or force irrelevant components.

## 58. Documentation-only exception and the proposal rule

Documentation-only delivery (design language, tokens, proposal, registry scaffolds without runtime implementation) is allowed only when the docs-only test passes: the brief says proposal/docs/audit-only, or asks for no build/migrate. Otherwise the default is the complete implemented system (§57). A proposal is an intermediate deliverable that unblocks implementation — never completion — when implementation was requested. For redesign implementation specifically: identify change vs remain from the audit, replace outdated tokens/variants/patterns when justified (one-line why each), preserve required functionality/safety/a11y/architecture, implement the shared system first, then migrate the actual app screens onto it, then validate screens and update registries.

## 59. Statuses and completion gates

Every registry entry carries exactly one status: specified (documented but not implemented) → implemented (exists in runtime code) → integrated (used by a real page, screen, or pattern) → validated (applicable validation actually passed, §41). Planned entries stay at specified and are never counted as implemented — planned is not a status, it is the specified value used when TBD remains. Full generation/redesign implementation is complete only when all gates hold:

- Runtime themes materialized for the actual stack, every supported theme rendered.
- Real component + page-pattern implementations exist for everything the task scope requires.
- Screens are composed from shared components (reuse protocol §60 shows no per-page duplication).
- Applicable states complete per §30; keyboard + a11y validation passing.
- Build + tests green for the stack; visual verification of representative pages or screens.
- Registry consistency green: no missing implementations, no stale entries, no token mismatches, no invalid references.

Adapt each gate to the actual stack per the matching `approaches/` file — never demand tooling the stack does not use.

## 60. Reuse protocol (canonical 6 steps)

The three modes carry these same six steps explicitly; this is the canonical wording:

1. Registry first — search the `ai/` registry (`COMPONENT_MAP.json`, `PAGE_PATTERNS.json`, `DESIGN_TOKENS.json`) for a fit.
2. Source + shared styles — read the matched component source and its shared styles/tokens before touching anything.
3. Variant/composition fit — check whether an existing variant, slot, or composition covers the need. Variants may differ in appearance (documented); reuse ≠ identical.
4. Reuse — use the shared component as-is. Shared cards, buttons, badges, tags, nav items, form fields, dialogs, and feedback are never reimplemented per page.
5. Extend — on legitimate repeated need, extend the shared component's variant API (new variant or slot). Never a one-off wrapper around a single call site.
6. Create only when justified — no fit above, plus a recurring or load-bearing need, built from the layer below. Then document it, register it in `ai/` with a truthful status, and add visual contracts + tests per the stack's tooling.

## 61. Truthful registry relationships

The system has one source chain, and every link must agree: `DESIGN_SYSTEM.md` (human-readable design language) ↔ `DESIGN_TOKENS.json` (machine-readable tokens) ↔ runtime theme resources (what the app actually renders) ↔ component sources (primitives, components) ↔ `COMPONENT_MAP.json` (component → variants/states/status/sources) ↔ pages ↔ `PAGE_PATTERNS.json` (page → sections → components) ↔ `RULES.md` (deterministic agent rules) ↔ `VALIDATION.md` (checks). Deterministic checks, where the stack permits: every implemented registry entry resolves to a real file, route, or resource; every shared component and page in code is registered; registry token values equal runtime theme values; no entry references a component, pattern, or route that does not exist. Failures block completion (§59).

## 62. Approach routing

Select the `approaches/` file by the actual stack + presentation layer, never by habit: document-rendered frontends, native apps, screenshot sources, backend-only services, server-rendered templates, and desktop frameworks each have their own approach (authoritative filename list: the SKILL.md Map, which owns it). Backend-only work (no UI in scope) uses the backend approach and never invents a frontend design system; the moment UI enters scope, the matching presentation-layer approach takes over. Global rules define WHAT must be true; approaches define HOW per stack (precedence as stated in the intro: on conflict the matching approach overrides). Framework rules live in `approaches/`; shared rules live here; `SKILL.md` stays a router. When changing a rule here, fix all dependent files (modes, approaches, templates) in the same change — duplicated conflicting rules are a defect.
