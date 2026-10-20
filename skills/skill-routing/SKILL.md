---
name: skill-routing
description: The single routing table from a target to the skills to load. Use when choosing which skill applies to a task, and keep it in sync with the installed skill set.
---

# Skill routing

Load the skills matching the target. Nothing else. Match the repo's actual
pinned versions in `tech_stack.md`; never apply latest idioms to legacy code.

| Building | Load |
|---|---|
| Next.js frontend | `nextjs-best-practices`, `vercel-react-best-practices`, `shadcn`, `impeccable`, `apple-design`, `animate` |
| Landing / marketing page | `design-taste-frontend`, `impeccable`, `shadcn` |
| Animations / motion | `animate` (web), `animate-expo` (Expo), `animation-vocabulary` to name effects, `review-animations` / `improve-animations` / `find-animation-opportunities` for QA |
| Component work | `emil-design-eng`, `shadcn`, `pick-ui-library`, `prototype` (variants picker) |
| NestJS API | `nestjs-best-practices`, `nextjs-nestjs-integration` |
| Prisma / Postgres | `prisma-database-setup`, `prisma-client-api`, `prisma-cli`, `prisma-postgres`, `prisma-postgres-setup`, `prisma-upgrade-v7`, `prisma-mongodb-upgrade` (+ `postgres`, `prisma` MCPs) |
| MongoDB / Redis | `mongodb`, `redis` MCPs (+ `prisma-mongodb-upgrade` where Prisma is involved) |
| Kubernetes | `kubernetes` MCP (needs kubeconfig) |
| Expo mobile | `expo-overview` first, then `expo-router`, `expo-native-ui`, `expo-data-fetching`, `expo-upgrade`, `eas-app-stores`, `eas-workflows`, `eas-update`, `animate-expo` (+ `expo` MCP) |
| Tauri desktop | `tauri-v2` |
| Diagrams / architecture | `diagram-design` (branded HTML/SVG diagrams), `excalidraw-diagram` |
| Video / motion output | `hyperframes` first (router), then its core set; `pr-to-video` for a PR, `product-launch-video` for a URL, `faceless-explainer` for text, `general-video` for anything else. Needs the `hyperframes` CLI (Node >= 22) |
| Slow screen / perf issue | `perf-debug` |
| New DB, console, API keys | `prisma-postgres-setup`, `prisma-postgres` |
| API design / contract | `api-designer`, `graphql-architect` |
| Realtime / sockets | `websocket-engineer` |
| JS/TS code | `javascript-pro`, `typescript-pro` |
| E2E / browser testing | `playwright-expert` |
| Security review / hardening | `secure-code-guardian`, `security-reviewer` (→ Kodus gate) |
| Legacy modernization | `legacy-modernizer` |
| Reverse-engineer a function/feature/app | `reverse-engineer-anything` (+ `rea` MCP) — understanding or rebuilding a feature from a shipped app/binary, reimplementing a function based on one, comparing versions. Skip for ordinary source analysis |
| Adversarial review | `the-fool` |
| NestJS deep work | `nestjs-expert` (+ `nestjs-best-practices`) |
| Next.js deep work | `nextjs-developer` (+ `nextjs-best-practices`) |
| React UI logic | `react-expert` |
| Postgres / query tuning | `postgres-pro`, `database-optimizer` |
| DevOps / pipeline | `devops-engineer` |
| Test strategy / suite | `test-master` (→ `/test`) |
| Architecture input (ours own the gate) | `architecture-designer` (→ `/architect`) |
| Feature shaping input (ours own the gate) | `feature-forge` (→ `/scope`) |
| Spec mining input (ours own the gate) | `spec-miner` (→ `/audit`, human-only) |
| Debug / failure triage | `debugging-wizard` (→ `/debug`) |
| Local review gate (ours) | `code-review` (→ `/code-review`, mandatory before PR) |
| Code review input | `code-reviewer` (→ `kodus-review` / `/pr-agent`) |
| Docs from diff | `code-documenter` (→ `/document` + living-docs) |
| Full-stack guardrail | `fullstack-guardian` |
| Agent process / authoring | `writing-for-agents`, `domain-modeling`, `research`, `handoff`, `retro`, `grilling`, `pr` |
| Later, only with that surface | `kubernetes-specialist`, `terraform-engineer`, `microservices-architect`, `mcp-developer`, `monitoring-expert` |

User-invoked only (`autoinvoke: false`): `ask-matt`, `grill-me`,
`grill-with-docs`, `handoff`, `retro`, `prototype` — only when the user asks
for that flow.

Ours own the gates: `architecture-designer` → `/architect`,
`feature-forge` → `/scope`, `spec-miner` → `/audit`,
`debugging-wizard` → `/debug`, `test-master` → `/test`,
`code-review` → `/code-review`, `security-reviewer` → Kodus gate,
`code-documenter` → `/document` + living-docs. Their content is input or a
checklist; the gate skill decides.
