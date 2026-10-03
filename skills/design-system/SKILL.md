---
name: design-system
description: Adopt the existing design-system/ or scaffold one from user intent — tokens, primitives, components, patterns, and registries kept consistent with the runtime. Use at the start of every UI task before designing.
---

# Design System

Lean router. The full rule set lives in `reference/master-instructions.md` — read it before writing any styles or components.

## Entry scan

Locate `design-system/`: single-repo at root; monorepo root shared plus per-app following the repo shape (never force example paths; adapt to whatever token format the repo already uses).

- (a) Exists and non-empty → **ADOPT mode**: read `modes/adopt.md` and follow it. Follow the system, extend the system, never replace it, never invent styles it already covers.
- (b) Missing or empty → **GENERATE mode**: read `modes/generate.md`. Ask what the user wants to build first, then scaffold from intent.

## Invariants (always apply)

- Token hierarchy: tokens → primitives → components → patterns → templates → pages → features. Build upward only; never place raw values above the token layer.
- CSS materialization: app code must NEVER `@import` or otherwise reference `design-system/*.css` across package boundaries. Canonical tokens live in `design-system/`; each app materializes its own copy into its own styles location (app CSS, root CSS, or monorepo frontend styles dir — whichever owns the runtime). `design-system/` is source, app styles are generated copies.

## Map

- `modes/adopt.md` — follow-existing protocol (canonical vs legacy, reuse-before-create, smallest-consistent-change).
- `modes/generate.md` — greenfield protocol (ask intent, scaffold docs + tokens + registries + primitives, TBD over invention).
- `approaches/` — stack adaptations: `nextjs.md`, `expo.md`, `screenshot-derived.md`. Read the one matching the stack.
- `templates/` — skeletons for `DESIGN_SYSTEM.md`, `ai/COMPONENT_MAP.json`, `ai/DESIGN_TOKENS.json`, `ai/PAGE_PATTERNS.json`, `ai/RULES.md`, `tokens/index.css`.
- `reference/master-instructions.md` — the full 55-section rule set. SKILL.md and modes stay lean and point here.
