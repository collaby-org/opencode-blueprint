# Versions and changelogs

This rule applies to every repository and every product this workflow touches.
It is not tied to one path. A project's documentation home and its version
belong to the project, never to this blueprint, to a chat, or to a private
vault alone.

This file is the single source of truth for the versioning and docs flow: the
version line a change belongs to, the bump it takes, the changelog it lands
in, and the docs home the PR uses. The skills point here; they do not restate
the rule.

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

Resolve the docs home once, before the work starts, and use that one answer
for the whole PR. The resolved folder then carries the app's changelog, the
roadmap status and the spec status. A PR that resolves the docs home twice,
in two places, splits its record across two homes.

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

The changelog lives at `docs/changelog.md`, or `<app>/docs/changelog.md` for an
app that ships on its own in a monorepo. That is the repo standard, and the
same path `docs/conventions.md` names.

An existing repository that already keeps a changelog under another name
(`CHANGELOG.md`, `ROADMAP.md`, …) keeps it: read it before writing and append
to it there. Never create a second changelog beside an existing one.

## 2. Version lines

Every app or workstream that ships on its own (frontend, API, mobile, worker)
has its own version line, in its own manifest or in its own `docs/VERSION`. A
repo-level version covers the repo itself; it never covers the workstreams
inside it.

Read the line from that workstream's own manifest: `package.json`,
`composer.json`, `pyproject.toml`, `Cargo.toml`, `*.csproj`, `pubspec.yaml`, or
the app manifest. With no manifest, create `docs/VERSION` with `1.0.0` next to
that workstream and treat it as the source.

- Repo level work: the repo manifest, or `docs/VERSION` at the repo root.
- A workstream that ships on its own: its own manifest, or its own
  `docs/VERSION`.

The number belongs to the project, not to the blueprint. In a monorepo every
app that ships independently carries its own line; so does a frontend or a
mobile app that releases on its own. The changelog entry names the line it
belongs to.

## 3. One PR, one bump

A PR bumps one version line: the line of the folder the PR touches.

| Change | Bump | Example |
|---|---|---|
| First shippable state | baseline | `1.0.0` |
| Feature or architecture PR | minor | `1.2.0` → `1.3.0` |
| Fix, docs or chore PR | patch | `1.3.0` → `1.3.1` |
| Breaking change | major | `1.3.1` → `2.0.0` |
| Every further behaviour change while the PR is open | patch | `1.3.0` → `1.3.1` → `1.3.2` … |

A PR opens its line with the minor (or patch for a fix PR). Each change made
while the PR is open bumps the patch on that same line, so a PR with
thirty-five changes lands as `1.3.35`, not `1.3.0`. The next PR opens `1.4.0`.

Bump the manifest and write the changelog entry in the same commit as the
change. Never a separate "bump version" commit at the end, never a version that
moves without a changelog line.

## 4. The changelog entry

The entry goes to the changelog of the folder worked in:

- Repo level work: `docs/changelog.md` at the repo root.
- One app in a monorepo: `<app>/docs/changelog.md`.
- The resolved docs home is a linked documentation repository or vault
  (`Obsidian-Documentation*`, `Documentation/`, `.docs/`): the changelog there.

Not one global file for everything. Two workstreams that ship on their own keep
two changelogs, and each entry names the line it belongs to.

```md
## [1.3.2] - 2026-10-20

### Fixed
- Postgres MCP no longer starts with an empty connection string.
```

Newest first. Sections: Added, Changed, Fixed, Removed, Security. One bullet per
user-visible change, written from the diff, linking the PR or commit. No
"various fixes", no empty version headings. The heading version equals the
version line the change was bumped on.

If the project keeps a hand-written changelog style, follow it. Never reformat
history you did not write.

## 5. Stop rule

At the end of a PR, and any time work pauses:

1. Every change since the last entry has a changelog line under the current
   version of the line it belongs to, in the changelog of the folder worked in.
2. Roadmap status is updated in the resolved docs home: done, in progress,
   next, dropped.
3. The spec says what is correct, what is not, and what was deferred. Update
   the status line, do not rewrite the decision.
4. Architecture decisions made during the work are recorded.
5. The PR body states `version: before → after` and links the changelog
   section.

Code without its docs entry is not done. Ten PRs logged only in a local vault
and nothing in the project docs home means the docs home was resolved wrong,
not that the vault is the record.

## 6. Release

Tag `v<version>` from the merged commit only, the version of the line that
shipped. Release notes are the changelog section for that version, verbatim.
Never tag a branch commit. Never bump the version after the merge without a
new PR.

## 7. Where each skill writes

- `/scope` resolves the docs home and the version line once, before planning,
  writes the scope under the resolved base, and records the target version for
  the work.
- `/architect` writes the spec and decision record under the same base and
  names the version impact (major / minor / patch).
- `/develop` bumps the patch on the version line of the folder it works in and
  writes the changelog line with each behaviour change, and keeps the spec
  status truthful.
- `/document` writes the PR body, the changelog of the folder worked in, the
  release note and the postmortem from the real diff; the changelog heading is
  the version line the change was bumped on.
- `/ship` checks the final state before opening the PR: version, changelog,
  roadmap, spec status, and the `before → after` line in the PR body.
