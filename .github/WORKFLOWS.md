# Workflows

This repository treats two checks as required and two review jobs as advisory.

## Required

- `ci.yml` parses every script in `bin/` and `skills/*/scripts/`, runs the repo
  standards check (`node bin/standards.mjs --check .`) and prints the disk
  hygiene report. It runs on every pull request and on every push to the
  default branch, needs no secret, and therefore runs on fork pull requests.
- `secret-scan.yml` runs gitleaks on every pull request, on every push to the
  default branch, and once a week. A leak fails the job. The report is uploaded
  as an artifact even when the job fails. The gitleaks version is pinned in the
  workflow, and every action is pinned to a commit.

## Advisory

- `kodus.yml` runs the Kodus review when `KODUS_TEAM_KEY` exists. It skips
  itself otherwise.
- `pr-agent.yml` runs PR-Agent when `LLM_API_KEY` exists. It skips itself
  otherwise.

Advisory jobs inform the review. They never replace the local gate:
`/check verify`, the local code review, and the Kodus loop run before the
commit.

## Forks and secrets

Pull requests from forks never receive repository secrets. GitHub runs the
workflow from the base branch and withholds `GITHUB_TOKEN` permissions and all
secrets, so the advisory jobs skip themselves. Required jobs must therefore
pass without any secret. Never add a secret to a required job.
