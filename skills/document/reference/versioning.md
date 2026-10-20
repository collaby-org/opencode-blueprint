# Versions and changelogs

This rule applies to every repository and every product this workflow touches.
It is not tied to one path. A project's documentation home and its version
belong to the project, never to this blueprint, to a chat, or to a private
vault alone.

## 1. Resolve the docs home

In order:

1. The documentation home the project already uses: `docs/`, the app's
   `<app>/docs/` in a monorepo, a sibling or linked documentation repository or
   vault (`Obsidian-Documentation*`, `Documentation/`, `.docs/`). If the project
   keeps its docs in a separate repo, that repo is the docs home and its change
   ships with the PR, not after it.
2. If `docs/` is a published docs site (`docusaurus.config.*`, `.vitepress/`,
   `mkdocs.yml`, Astro Starlight, Nextra), the workflow base is `.workflow/` —
   the same base `/scope`, `/architect` and `/develop` already use. Keep site
   content and workflow records separate.
3. Nothing exists: create `docs/`.

Never keep the only record in a scratch folder, a personal note, or chat. A
vault that mirrors the repo is a copy; the repo's docs home is the source of
truth. If both exist, write the repo copy first, then mirror.

Required files, created when missing:

| File | Holds |
|---|---|
| `changelog.md` | one section per version, newest first |
| `roadmap.md` | done / in progress / next / dropped, dated |
| `specs/<slug>.md` | scope, spec, acceptance, status line |
| `architecture/<slug>.md` | decisions, trade-offs, diagram links |
| `reviews/<date>-<slug>.md` | local and GitHub review reports |

Existing repositories keep their existing names (`CHANGELOG.md`,
`ROADMAP.md`, …). Read them before writing. Never create a second changelog
beside an existing one.

## 2. Version source

Read the version from the project manifest: `package.json`, `composer.json`,
`pyproject.toml`, `Cargo.toml`, `*.csproj`, `pubspec.yaml`, or the app
manifest. With no manifest, create `docs/VERSION` with `1.0.0` and treat it as
the source.

The number belongs to the project, not to the blueprint. In a monorepo every
app that ships independently carries its own line; so does a frontend or a
mobile app that releases on its own. The changelog entry names the line it
belongs to.

## 3. Bump matrix

| Change | Bump | Example |
|---|---|---|
| First shippable state | baseline | `1.0.0` |
| Feature or architecture PR | minor | `1.2.0` → `1.3.0` |
| Fix, docs or chore PR | patch | `1.3.0` → `1.3.1` |
| Breaking change | major | `1.3.1` → `2.0.0` |
| Every further behaviour change while the PR is open | patch | `1.3.0` → `1.3.1` → `1.3.2` … |

A PR opens its line with the minor (or patch for a fix PR). Each change made
while the PR is open bumps the patch, so a PR with thirty-five changes lands as
`1.3.35`, not `1.3.0`. The next PR opens `1.4.0`.

Bump the manifest and write the changelog entry in the same commit as the
change. Never a separate "bump version" commit at the end, never a version that
moves without a changelog line.

## 4. Changelog entry

```md
## [1.3.2] - 2026-10-20

### Fixed
- Postgres MCP no longer starts with an empty connection string.
```

Newest first. Sections: Added, Changed, Fixed, Removed, Security. One bullet per
user-visible change, written from the diff, linking the PR or commit. No
"various fixes", no empty version headings. The heading version equals the
manifest version at that commit.

If the project keeps a hand-written changelog style, follow it. Never reformat
history you did not write.

## 5. Stop rule

At the end of a PR, and any time work pauses:

1. Every change since the last entry has a changelog line under the current
   version.
2. Roadmap status is updated: done, in progress, next, dropped.
3. The spec says what is correct, what is not, and what was deferred. Update
   the status line, do not rewrite the decision.
4. Architecture decisions made during the work are recorded.
5. The PR body states `version: before → after` and links the changelog
   section.

Code without its docs entry is not done. Ten PRs logged only in a local vault
and nothing in the project docs home means the docs home was resolved wrong,
not that the vault is the record.

## 6. Release

Tag `v<version>` from the merged commit only. Release notes are the changelog
section for that version, verbatim. Never tag a branch commit. Never bump the
version after the merge without a new PR.

## 7. Where each skill writes

- `/scope` resolves the docs home and the version line before planning, writes
  the scope under the resolved base, and records the target version for the
  work.
- `/architect` writes the spec and decision record under the same base and
  names the version impact (major / minor / patch).
- `/develop` bumps the patch and writes the changelog line with each behaviour
  change, and keeps the spec status truthful.
- `/document` writes the PR body, changelog, release note and postmortem from
  the real diff; the changelog heading is the manifest version.
- `/ship` checks the final state before opening the PR: version, changelog,
  roadmap, spec status, and the `before → after` line in the PR body.
