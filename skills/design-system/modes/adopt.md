# Design System Mode: Adopt

The system exists. Follow it, extend it, never replace it.

## 1. Inspect

Read in this order, cheapest first:

1. `design-system/DESIGN_SYSTEM.md` + the `ai/` registry (`RULES.md`, `COMPONENT_MAP.json`, `DESIGN_TOKENS.json`, `PAGE_PATTERNS.json`, `VALIDATION.md` if present).
2. `design-system/tokens/` (naming and prefix convention, CSS vars or native tokens) and `components.json` if present.
3. Runtime owners: `package.json`, `components.json`, Tailwind config, Storybook config, app CSS / root CSS / `lib/styles/`, `components/`, `app/` or `src/app/`, `patterns/`, `pages/`.

## 2. Determine canonical vs legacy

More than one token source or styling approach means one is legacy. Canonical wins by: referenced from the runtime-owned CSS (the materialized copy), referenced by the registry, newest changelog entry. Name the legacy source explicitly and never extend it; migrate reads toward canonical only where the task already touches that code.

## 3. Reuse-before-create order

Need a style or piece of UI? Walk top-down, stop at the first hit: page pattern → pattern → component variant → primitive → token. Only when nothing fits, create new — then document it, register it in `ai/`, add stories + tests.

## 4. Smallest-consistent-change

Extend the system in its own idiom: same token prefix, same variant API, same file shape. Match surrounding conventions exactly; a change that "improves" the convention itself is a separate task.

Then apply `reference/master-instructions.md` (contracts, states, a11y, responsive, validation, checklists) to the work.
