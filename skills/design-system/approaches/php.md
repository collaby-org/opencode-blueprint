# Approach: PHP templates (non-Laravel, server-rendered)

- Shared templates first: layouts for shells, partials for sections, reusable view components with explicit parameters/slots for shared UI (cards, buttons, badges, tags, nav items, form fields, dialogs, feedback). Never one-off copies per page.
- Presentation/logic separation: views compose and render; domain logic stays out of templates. Templates read design tokens only — never raw values.
- CSS/JS integration: stylesheets carry the materialized token copies (owned by the app, never cross-referenced from `design-system/`); scripts enhance progressively, never as the only carrier of meaning or state.
- Variants via parameters/slots over duplication; variants may differ in appearance (documented); reuse ≠ identical.
- Validate: applicable states per §30, AA contrast, keyboard navigation, responsive behavior, rendered-page checks, registry consistency (see `reference/master-instructions.md` §41, §59). Tooling follows what the stack has.
