# RULES (agent-readable, deterministic)

1. Tokens only: no raw colors, hex, or magic spacing above the token layer.
2. Reuse-before-create order: page pattern → pattern → component variant → primitive → token.
3. New UI must match an entry in COMPONENT_MAP.json or add one (with stories + tests).
4. Every interactive element ships all states: default, hover/pressed, focus, disabled, loading, empty, error.
5. AA contrast, dark mode, and mobile collapse are required, not follow-ups.
6. Never decide what DESIGN_SYSTEM.md already defines — follow it, extend it, never replace it.
