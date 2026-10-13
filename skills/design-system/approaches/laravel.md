# Approach: Laravel (Blade layouts + components)

- Tokens as CSS custom properties owned by the app's stylesheets; Blade layouts and components read tokens only — never raw values in markup or styles.
- Reusable templates first: layouts for shells, partials for sections, components with props/slots for shared UI (cards, buttons, badges, tags, nav items, form fields, dialogs, feedback). Variants via props/slots, never one-off copies per page.
- Asset ownership: stylesheets and compiled assets belong to the app's asset pipeline; canonical token source lives in `design-system/`, materialized copies live with the app — never cross-referenced (see the materialization invariant in `SKILL.md`).
- Token integration: theme maps to the vars; every supported theme rendered and validated side by side.
- API-only variant: no UI in scope → behave as backend-only (contracts, boundaries, never invent a frontend design system).
- Validate: applicable states per §30, AA contrast, keyboard navigation, responsive behavior, build + tests, registry consistency (see `reference/master-instructions.md` §41, §59).
