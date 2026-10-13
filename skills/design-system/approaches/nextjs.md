# Approach: Next.js + Tailwind + shadcn

- Tokens as CSS custom properties in the app-owned CSS; Tailwind theme maps to the vars (never raw values in utilities).
- shadcn components are primitives to compose and theme — never ship default-state: override via semantic tokens, variants via cva.
- Registry first: `npx shadcn@latest search` before any custom component; Magic UI / Aceternity registries allowed (shadcn-compatible).
- Animated icons via the registry (`npx shadcn@latest add "https://lucide-animated.com/r/<icon>.json"`, kebab-case, into `components/icons/`); browse via the `lucide-animated` MCP (`search_icons`, `get_icon`) or the icons `llms.txt`.
- `components.json` owns aliases and paths; keep it in sync with the router config.
- Server Components by default; `"use client"` only where interactivity requires it.
- Motion: transform/opacity only, under 300ms, ease-out enter, honor `prefers-reduced-motion`.
- Validate: typecheck + lint + `design:check` (see `reference/master-instructions.md` §42).
- When implementation was requested, deliver the complete system (`reference/master-instructions.md` §57): runtime themes, implemented components, pages composed from shared UI, truthful registries, verified completion report. Reuse follows the 6-step protocol (§60) — shared UI is never reimplemented per page.
