---
name: design-system
description: Adopt, redesign, or generate complete implemented design systems — tokens, primitives, components, patterns, pages, and truthful registries kept consistent with the runtime. Use at the start of every UI task before designing.
---

# Design System

Lean router. The full rule set lives in `reference/master-instructions.md` — read it before writing any styles or components.

## Entry scan

Check the user's brief and references first, folder state second. Detect the stack from manifests/configs first (manifest + lockfile, composer config, dependency manifests, solution/project files, app manifest + presentation dir); ask stack only if ambiguous. Locate `design-system/`: single-repo at root; monorepo root shared plus per-app following the repo shape (never force example paths; adapt to whatever token format the repo already uses).

Substantial redesign = the brief replaces tokens/brand/IA/navigation or reworks more than roughly a third of components (brief says rebrand, rework, or overhaul) → REDESIGN. Evolve = new or changed UI within existing tokens/variants/patterns → ADOPT.

- Explicit substantial-redesign intent in the brief or references → **REDESIGN mode**: read `modes/redesign.md` and follow it — even when a system already exists and is non-empty. ADOPT's never-replace rule does not apply inside REDESIGN.
- Existing non-empty system + continue/evolve intent (including new UI on the existing system without redesign intent) → **ADOPT mode**: read `modes/adopt.md` and follow it. Follow the system, extend the system, never replace it, never invent styles it already covers.
- Missing or empty system + new intent → **GENERATE mode**: read `modes/generate.md`. Redesign intent with nothing to audit or migrate also lands here — borrow the proposal shape (`modes/redesign.md` stages C–D).
- Unstated intent → inspect folder state, then ask one intent question before routing.

## Complete system (generation / redesign implementation)

When implementation was requested, the workflow delivers a complete implemented system — never documentation-only. That means: documented design language + brand; semantic tokens AND real runtime theme resources; implemented primitives; implemented component library; documented + implemented page patterns; real pages composed from shared components; registries matching real code; validation tooling + a verified completion report. `DESIGN_SYSTEM.md` is documentation, not proof. Documentation-only is the exception, allowed only per the docs-only test in §58. A proposal is an intermediate deliverable, never completion, when implementation was requested. Full definition, statuses, and completion gates live in `reference/master-instructions.md` (§57, §59).

## Screenshot-derived systems

When screenshots are the brief, treat them as a first-class visual evidence set before choosing a visual direction. Read `approaches/screenshot-derived.md` alongside the stack approach and record the evidence in the installed system.

- Inventory every supplied viewport and map each relevant route/pattern to its source image. Extract repeated layout, surface, type, accent, density, navigation, and responsive behaviour before inventing a token.
- Derive the default theme from the repeated evidence. A dark-first reference set yields a dark-first system; do not impose a light default from generic product convention. Still author both dark and light semantic palettes unless the brief explicitly excludes a theme.
- Preserve evidence-backed geometry and information hierarchy—not sample balances, copy, dates, identities, or unlicensed imagery. Media is a named slot with accessibility rules, never a palette or a required carrier of meaning.
- Add a route-level fidelity checklist: side-by-side comparison at the source viewport, plus responsive and alternate-theme validation once runtime code exists.
- A screenshot task is route-locked: build the named route from its paired reference, not a generic landing page or a visually similar surface. Do not change public home while implementing dashboard, markets, wallet, or terminal work unless that public route is explicitly in scope.
- A reference screen's visible modules are a minimum inventory. A generic hero, loading skeleton, blank panel, footer, fallback state, or missing-data placeholder cannot stand in for a reference module in a visual acceptance render. Use deterministic representative data where live data is unavailable, while keeping real loading/error states separately testable.
- Do not call the work visually complete until every target route is rendered at the reference viewport, compared side-by-side, and passes its required-element inventory. If the current route is empty, crashes, or remains in a loading state, fix that blocker before claiming screenshot fidelity.
- Treat a redesign as a behaviour-preserving migration. Before replacing a route, capture its working route, API/data dependencies, controls, and critical user flow. After replacement, the same route must load, preserve its interactions, have no new console/network failures, and retain every existing capability through the new composition.
- Public marketing chrome is not a safe global fallback. Do not inject public footers, generic campaign banners, or unrelated CTAs into authenticated account, wallet, referral, exchange, or terminal routes. Each layout owns its shell and route composition.
- Do not use a visual fixture to hide broken live behaviour. Fixtures are development-only comparison data with no side effects; production data paths, empty states, error states, chart normalisation, and order safeguards must remain functional and be verified separately.
- If the user explicitly limits work to `design-system/` or other documentation/token paths, produce an honest **specified system target**: tokens, component/page contracts, source mapping, deterministic validation, and registry entries marked `specified`. Do not falsely mark it implemented or claim the app was migrated. Runtime migration remains required when the permitted scope expands.

## Invariants (always apply)

- Token hierarchy: tokens → primitives → components → patterns → templates → pages → features. Build upward only; never place raw values above the token layer.
- CSS materialization: app code must NEVER `@import` or otherwise reference `design-system/*.css` across package boundaries. Canonical tokens live in `design-system/`; each app materializes its own copy into its own styles location (app CSS, root CSS, or monorepo frontend styles dir — whichever owns the runtime). `design-system/` is source, app styles are generated copies.
- Reuse over duplication: shared cards, buttons, badges, tags, nav items, form fields, dialogs, and feedback are never reimplemented per page — reuse the shared component through variants and slots. Variants may differ in appearance (documented); reuse ≠ identical. No one-off wrappers around single call sites. The explicit 6-step reuse protocol lives in `reference/master-instructions.md` and in each mode.
- Truthful registries: every registry entry maps to a real implementation or is marked specified (planned) — planned is never counted as implemented. No example components, placeholder routes, or TBD where real values are determinable.

## Map (owns the filename list — `reference/master-instructions.md` §62 cites here, never duplicates it)

- `modes/adopt.md` — follow-existing protocol (canonical vs legacy, reuse protocol, smallest-consistent-change).
- `modes/redesign.md` — substantial-redesign protocol (brief → audit → proposal → conflict-resolved replacement → implementation + migration when requested).
- `modes/generate.md` — greenfield protocol (ask intent, scaffold docs + tokens + registries + primitives, implement the system when requested, TBD over invention).
- Reuse protocol (all modes; canonical wording in `reference/master-instructions.md` §60): registry → source + shared styles → variant/composition fit → reuse → extend variant API on repeated need → create only when justified.
- `approaches/` — read the one matching the actual stack + presentation layer; never force a backend framework into frontend architecture (backend-only tasks use the backend approach, never a frontend one). Priority: Laravel → `laravel.md` (never `php.md`); non-Laravel PHP → `php.md`; `screenshot-derived.md` composes with the stack approach (source evidence + stack mechanism); backend+UI splits use the backend approach for contracts and the matching presentation approach for UI.
- `templates/` → `design-system/` (skeleton → installed): `DESIGN_SYSTEM.md` → `design-system/DESIGN_SYSTEM.md`; `COMPONENT_MAP.json`, `DESIGN_TOKENS.json`, `PAGE_PATTERNS.json`, `RULES.md`, `VALIDATION.md` → `design-system/ai/`; `index.css` (CSS-stacks starter) → `design-system/tokens/index.css`; `components.json` (alias-file stacks only) → beside the stack config (see `approaches/`).
- `reference/master-instructions.md` — the full rule set. SKILL.md and modes stay lean and point here.
