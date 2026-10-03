# Approach: Screenshot-derived

- Source-of-truth priority: runtime code first, then screenshots/live previews, then docs. Screenshots inform, code decides; record divergences explicitly.
- Extract in order: layout skeleton → spacing rhythm → color roles (bg/surface/accent/text) → type scale → component inventory.
- Tokenize with the repo's own prefix convention (`<prefix>-` + role, e.g. `--myapp-bg-primary`); semantic names, never raw hex above the token layer.
- Rebuild the screenshot's structure from system primitives; pixel-tweaking raw CSS to "look right" is forbidden — if no token fits, add the token.
- Be very accurate to the chosen source; never guess values a screenshot cannot resolve (mark TBD, check code).
