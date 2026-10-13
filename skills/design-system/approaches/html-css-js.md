# Approach: HTML + CSS + JS (document-rendered, no framework)

- Semantic HTML first: landmarks, headings, labels, and native controls carry meaning before any styling.
- Tokens as CSS custom properties in shared stylesheets; pages and partials read tokens only — never raw values above the token layer.
- Shared stylesheets owned once: layout, components, and themes each in their place; never per-page reimplementations of shared UI.
- Composition via partials or web components with explicit variant APIs (attributes/props + slots); variants may differ in appearance (documented); reuse ≠ identical.
- Themes: every supported theme authored as real token values (never invert-by-filter); persisted choice with a sensible initial default.
- Validate in the browser: applicable states per §30, AA contrast, keyboard navigation, responsive behavior, registry consistency (see `reference/master-instructions.md` §41, §59). No build-gate demands beyond what the stack has.
