# Workflows

This repository treats two checks as required. The advisory review jobs below
are not part of this scaffold: they exist only when the opencode GitHub
integration added them.

## Required

- `ci.yml` runs install, lint, test, and build on every pull request and on
  every push to the default branch. A step whose command is empty is skipped,
  so a repository without a lint script is not red for a missing script.
- `secret-scan.yml` runs gitleaks on every pull request, on every push to the
  default branch, and once a week. A leak fails the job. The report is uploaded
  as an artifact even when the job fails. The gitleaks version is pinned in the
  workflow, and every action is pinned to a commit.

## Advisory

These are added by the opencode GitHub integration, not by this scaffold. When
they are present:

- `kodus.yml` runs the Kodus review when `KODUS_TEAM_KEY` exists. It skips
  itself otherwise.
- `pr-agent.yml` runs PR-Agent when `LLM_API_KEY` exists. It skips itself
  otherwise.

Advisory jobs inform the review. They never replace the local gate:
`/check verify` and the Kodus loop run before the commit, and the local code
review runs on the final HEAD, after the rebase and before the pull request.

## Forks and secrets

Pull requests from forks never receive repository secrets. GitHub runs the
workflow from the base branch and withholds `GITHUB_TOKEN` permissions and all
secrets, so the advisory jobs skip themselves. Required jobs must therefore
pass without any secret. Never add a secret to a required job.
