# Design System Master Instructions

The full rule set. `SKILL.md` routes here; modes stay lean and point here. Conventions below assume Next.js + Tailwind + shadcn — adapt per `approaches/` for other stacks, never force the example onto a mismatched stack.

## 1. Hierarchy

Build strictly upward: tokens → primitives → components → patterns → templates → pages → features. A layer may only consume the layer directly below it.

## 2. Raw values live in tokens only

No raw color, hex, pixel, font, shadow, or duration value may appear above the token layer. If a value has no token, add the token — never inline the value.

## 3. Semantic token naming

Name tokens by role (`bg-primary`, `text-muted`, `accent`), never by value (`blue-500`, `12px`). Roles survive rebrands; values do not.

## 4. Prefix convention

Every token carries the repo prefix (e.g. `myapp-` → `--myapp-bg-primary`). One prefix per system; match the existing convention in ADOPT mode, establish it in GENERATE mode.

## 5. Reuse-before-create

Walk top-down and stop at the first fit: page pattern → pattern → component variant → primitive → token. Check existing code and the shadcn registry (`npx shadcn@latest search`) before writing new UI.

## 6. Creation rules

Create a new token, component, or pattern only when (a) no existing entry fits, (b) the need recurs or is clearly load-bearing, and (c) it is built from the layer below. One-off page styling is not a pattern.

## 7. Component contracts

Every component exposes an explicit variant API (props + variants + defaults). Same prop names and semantics across components; no hidden global state, no reaching past the contract.

## 8. Composition

Document page → sections → components with assembly rules: which sections a page allows, which components each section allows, and ordering constraints. Give real examples, not abstract advice.

## 9. Primitives inventory

Primitives are the only headless/raw layer: button, input, select, card/surface, layout shells, text. Everything else composes them. Never ship default-state shadcn — theme with semantic tokens.

## 10. Spacing scale

One base unit, one scale, `gap` for gaps (never `space-x/y`). Rhythm must be eyeball-consistent across pages; arbitrary values are a token-miss — add the token.

## 11. Typography scale

One family stack, one size/weight/line-height scale, roles (`heading`, `body`, `caption`, `label`). Body text never below the agreed minimum; hierarchy through scale and weight, not ad-hoc sizes.

## 12. Color roles and accent discipline

Roles: background, surface, text (+muted), accent, border, danger/success/warning. Exactly one accent color. Status colors carry meaning only — never decoration.

## 13. One radius scale

A single radius ramp used everywhere (buttons, cards, inputs, sheets). `size-*` for square elements. No per-component radius invention.

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

One primary nav per surface; active route always visible; mobile collapses to a defined pattern (bottom bar, drawer, or menu — chosen once, used everywhere). Breadcrumbs where depth exceeds two levels.

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

## 30. Full UI states requirement

Every button and every step ships loading, empty, error, and active-press feedback from the first version. "States later" is a defect, not a plan.

## 31. Accessibility

WCAG AA contrast minimum everywhere including muted text and placeholders. Visible focus rings on all interactives. Labels on all inputs; icon-only buttons get accessible names. Touch targets meet platform minimums.

## 32. Reduced motion

Honor `prefers-reduced-motion`: essential state changes instant, decorative motion off. No animation may carry meaning alone — pair with a static cue.

## 33. Responsive

Design mobile-collapse explicitly per pattern (what stacks, what hides, what moves to overflow). No horizontal page scroll; tables scroll in-card with sticky headers. Touch and pointer both first-class.

## 34. Dark mode

Dark mode from the start: every color role has both modes, validated side by side. Never invert-by-filter; author both palettes. Persist the choice; respect system default initially.

## 35. Registries

`ai/` holds the machine-readable system: `RULES.md` (deterministic agent rules), `COMPONENT_MAP.json` (component → variants/states/docs/stories), `DESIGN_TOKENS.json` (prefix + all token values), `PAGE_PATTERNS.json` (page → sections → components), `VALIDATION.md` (checks). Skeletons in `templates/`.

## 36. Registry sync

Registries are deterministic — an entry is either used by code or it does not exist. Adding UI without registering it (or registering UI that does not exist) fails validation. Keep validation decidable: never make the AI judge what the system already defines.

## 37. Workflow: new page

Inspect the page need → search the registry → reuse patterns/components → apply page patterns → tokens only → responsive check → validate → fix → re-validate. No new component unless §6 allows; when one is created, document + register + stories + tests.

## 38. Workflow: modify page

Read the page's registered pattern first; change within its assembly rules. Pattern-level changes propagate to all pages using the pattern — flag that blast radius before editing.

## 39. Workflow: new component

Prove §6 (no fit above), design the variant API, build on primitives with tokens only, cover §25–§30 states, write stories per variant/state, register in `COMPONENT_MAP.json`, document usage + anti-usage.

## 40. Storybook

Every component ships stories for each variant and each state (§25–§30), plus a kitchen-sink page per pattern. Stories are the visual contract reviewers check against.

## 41. Validation

Run, in order: registry sync (§36) → token audit (no raw values above tokens) → state coverage per interactive → AA contrast both modes → responsive breakpoints → typecheck + lint. Fix, then re-run until green.

## 42. design:check

`design:check` is the repo's single design gate: it runs §41 end to end and exits non-zero on any failure. Wire it into CI for UI packages. No UI PR merges red.

## 43. Pre-completion checklist

Before calling UI work done: states covered, both modes rendered, mobile collapse verified, registry updated, stories added, `design:check` green, screenshots attached for visual diffs.

## 44. Forbidden patterns

Raw colors/hex/spacing in components; `space-x/y`; hand-rolled SVGs; emoji as icons; default-state shadcn; hardcoded palettes; per-component radius invention; `@import` of design-system CSS across package boundaries (§54 scope rule applies repo-wide).

## 45. Icons

Lucide only, one icon family per project. Static via `lucide-react`; animated via the shadcn registry (`npx shadcn@latest add "https://lucide-animated.com/r/<icon>.json"`, kebab-case, into `components/icons/`). Size from the spacing scale; never decorative-only meaning carriers.

## 46. Custom-styling allowance

Escape hatches (arbitrary values, one-off CSS) are allowed only when: the system genuinely lacks the value, the need is proven single-use, and a TODO references the token proposal. Review converts repeats into tokens.

## 47. Over-abstraction

Do not create abstractions for single uses: no wrapper components around one call site, no pattern entries for one page, no tokens for one value. Duplicated twice → candidate; third use → systematize.

## 48. Domain UI

Domain-specific components (charts, tickers, order books) live near their domain, built strictly on primitives + tokens. They are consumers of the system, never extensions of it — shared needs graduate upward through §39.

## 49. Evolution

The system grows by use: new patterns enter through real pages, new tokens through real values. Quarterly, prune unused entries (registry vs code diff); a system nobody prunes becomes a catalog nobody trusts.

## 50. Refactoring

Migrate legacy toward canonical in task-sized steps: one surface per change, legacy and canonical never extended in parallel, registry updated in the same change. Big-bang restyles are forbidden.

## 51. Decision rules

When system and task disagree, the system wins unless the task records why. When the system is silent, §5–§6 decide. The AI never invents a third option (custom palette, new radius, novel pattern) to resolve ambiguity — it asks, or follows the nearest registered answer.

## 52. Visual fidelity and the Apple-clean bar

Every button and step feels inevitable: generous whitespace, one accent, consistent rhythm, hero fits viewport, zero placeholder chrome. Finish means a stranger could use it without explanation.

## 53. Screenshot implementation

Implementing from screenshots: extract layout → spacing rhythm → color roles → type scale → component inventory, in that order. Match structure with system primitives; never pixel-tweak raw CSS to "look right" — missing values become tokens (§2). See `approaches/screenshot-derived.md`.

## 54. Source-of-truth priority (runtime-first)

Conflicts resolve: running code > screenshots/live previews > docs > memory. The runtime is what users get; docs describe it, never override it. Cite the winning source when recording a decision.

## 55. Never-guess, completion, final questions

Never guess values, intent, or product meaning — analyse the codebase, configs, and provided sources; mark unknowns TBD and ask. Completion standard: registry green, both modes, all states, responsive verified, `design:check` passing. End with final questions: list anything still TBD or assumed, each with a recommendation, and wait rather than ship ambiguity.

## 56. Registry sourcing and allowed extras

Animated icons come from the shadcn registry: `npx shadcn@latest add "https://lucide-animated.com/r/<icon>.json"` (kebab-case, into `components/icons/`). Browse via the `lucide-animated` MCP (`search_icons`, `get_icon`) or the icons `llms.txt`. Never hand-roll SVGs, never emoji icons, one icon family per project.

Magic UI and Aceternity UI are allowed — both are shadcn-compatible registries. Never ship default-state shadcn; theme composed components and variants with semantic tokens.
