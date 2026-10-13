# VALIDATION (deterministic checks only)

Run in order, adapting each check to the actual stack (see the matching `approaches/` file). Every check is pass/fail — never ask the AI to judge what the system defines. Checks fail as stated where the stack permits a deterministic check; where it does not, verify manually per the matching approach — never weaken the gate, change only the mechanism.

1. Registry sync: every implemented entry in `COMPONENT_MAP.json` / `PAGE_PATTERNS.json` resolves to a real file, route, or resource; every shared component and page in code is registered; no stale entries.
2. Token audit: no raw colors, hex, or magic spacing above the token layer; registry token values equal the runtime theme values.
3. Reference integrity: no entry references a component, pattern, or route that does not exist; no example components, placeholder routes, or TBD where real values are determinable.
4. State coverage: every interactive element ships its applicable states (see `RULES.md` rule 4); empty states on collections and content surfaces.
5. Themes: every supported theme rendered and validated side by side (light + dark where supported).
6. Accessibility + keyboard: contrast minimums, visible focus, labels/names, keyboard paths, reduced-motion behavior.
7. Responsive: collapse/adaptation behavior verified per pattern for the form factor.
8. Build + tests: green for the stack; visual contracts (§40 in `reference/master-instructions.md`) present per the stack's tooling.
9. Completion report: statuses (specified → implemented → integrated → validated) truthful across registries; gates in `reference/master-instructions.md` §59 all hold before calling implementation work done.
