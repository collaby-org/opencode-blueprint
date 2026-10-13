# RULES (agent-readable, deterministic)

1. Tokens only: no raw colors, hex, or magic spacing above the token layer.
2. Reuse protocol (6 steps): registry → source + shared styles → variant/composition fit → reuse → extend variant API on repeated need → create only when justified. Shared cards, buttons, badges, tags, nav items, form fields, dialogs, and feedback are never reimplemented per page.
3. New UI must match an entry in COMPONENT_MAP.json or add one (with a truthful status + visual contracts + tests per the stack's tooling).
4. Every interactive element ships its applicable states: default, hover/pressed, focus-visible, plus loading/disabled where they apply; empty states belong to collections and content surfaces, never to single controls.
5. AA contrast, every supported theme, and responsive behavior per pattern are required, not follow-ups.
6. Never decide what DESIGN_SYSTEM.md already defines — follow it, extend it, never replace it (REDESIGN mode resolves replacements explicitly instead).
7. Registries are truthful: entries map to real implementations or are marked specified (planned) — planned is never counted as implemented. No example components, placeholder routes, or TBD where real values are determinable.
8. Documentation-only delivery is allowed only per the docs-only test (§58 in `reference/master-instructions.md`); otherwise implementation + a verified completion report are required.
