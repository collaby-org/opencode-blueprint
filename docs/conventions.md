# Conventions

The rules every change in this repository follows. The skills read this file
as the contract: a review finding that names a rule here is a real finding,
one that does not is style noise.

## Naming

- Files and directories: kebab-case (`post-review.mjs`, `code-review/`).
- Types, classes and components: PascalCase (`ReviewPlan`, `PullRequest`).
- Functions, variables and plain objects: camelCase (`writeReport`).
- SQL tables and columns: snake_case (`review_findings`, `created_at`).
- Environment variables: UPPER_SNAKE_CASE (`LLM_API_KEY`).

## Commits

Conventional Commits: `<type>(<scope>): <subject>`.

- Types: `feat`, `fix`, `chore`, `docs`, `refactor`, `test`, `build`, `ci`.
- The subject says what changed, in the imperative, under 72 characters.
- The body explains why, when the reason is not obvious from the subject.
- One logical change per commit. A subject that needs an "and" is two commits.

## Branches

- `feat/<slug>` for a feature, `fix/<slug>` for a fix, `chore/<slug>` for
  maintenance.
- The slug is short, lowercase and hyphenated.
- One branch, one pull request.

## Docs home

- Documentation lives in `docs/`. In a monorepo, an app that ships on its own
  keeps `<app>/docs/`.
- The repo copy is the source of truth. A vault or a separate documentation
  repository is a mirror, and the repo copy ships with the change.
- The changelog is `docs/changelog.md` (`<app>/docs/changelog.md` in a
  monorepo), newest first, one section per version. The changelog entry and
  the version bump ride in the same commit as the change they describe.

## Secrets

- A secret value never lands in a file: not in the repo, not in a scratch
  file, not in a commit, not in a tracked `.env`.
- A secret value never lands in a log, a CI output, a review finding or a
  chat message. Reference it by name and read it from the environment.
- A key that was committed once is leaked. Rotate it, then delete it.
  Deleting alone is not a fix.

## Tests and verification

- Every change is covered by the repo's checks, and every claim in the pull
  request is evidenced.
- A project without a test runner says so on purpose, in
  `test-preferences.json` or the governing spec, and gates on typecheck plus
  a runtime verification instead.
- The checks run again after a rebase, and the local code review gate runs on
  the final HEAD.
