# Approach: Backend service (no UI in scope)

- Backend-only: own API contracts (request/response shapes, validation, error envelopes), frontend boundaries (what the backend guarantees vs what the presentation layer decides) — never invent a frontend design system unless UI is in scope.
- Tokens, components, themes, and page patterns do not live in the backend; the moment UI enters scope, hand presentation to the approach matching the actual frontend stack.
- Shared UI rules still apply at the boundary: response shapes are versioned contracts like component contracts (§7); error payloads carry what happened + what it affects + the recovery path, mirroring §29 without leaking internals.
- Validate per `reference/master-instructions.md` §41 adapted: contract tests + validation tests + typecheck + lint; no visual gates apply until a presentation layer exists.
