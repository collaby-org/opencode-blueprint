# Design System Mode: Generate

No system yet. Ask first, then scaffold from intent — never from assumption.

## 1. Ask intent

Before writing anything, ask what the user wants to build: product type, stack, and style source (analyse the existing codebase, images / links / live previews they provide, or both). Wait for the answer. Be very accurate to the chosen source.

## 2. Scaffold (minimal viable system)

From `templates/`, create: `DESIGN_SYSTEM.md`, `tokens/` (colors, typography, spacing, radius, shadows, motion + index), `ai/` (`RULES.md`, `COMPONENT_MAP.json`, `DESIGN_TOKENS.json`, `PAGE_PATTERNS.json`, `VALIDATION.md`), `components.json`, and primitives only (button, input, card, layout shells). Patterns, pages, and components grow as real UI needs them — never scaffold speculative ones.

## 3. CSS materialization

App code must NEVER `@import` or otherwise reference `design-system/*.css` across package boundaries. Canonical tokens live in `design-system/`; each app materializes its own copy into its own styles location (app CSS, root CSS, or monorepo frontend styles dir — whichever owns the runtime). `design-system/` is source, app styles are generated copies. Expo: tokens materialize as native values, not CSS (see `approaches/expo.md`).

## 4. Unknowns stay TBD

Mark anything not yet decided as TBD in the docs. Never invent product values (brand color, font, copy) to fill a template — ask, or leave TBD.

Then build under `reference/master-instructions.md` (creation rules, contracts, states, validation, checklists).
