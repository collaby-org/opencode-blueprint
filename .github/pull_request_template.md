<!--
One problem per pull request. Fill every section. "None" or "not applicable"
is a valid answer when it is true; an empty section is not.

Verification evidence means the exact commands you ran, their output, and what
you did not check. Do not summarize passing tests as "all green".

The version line uses real numbers, before and after this pull request.
-->

## Summary

<!-- What changed, in two or three plain sentences. -->

## Problem

<!-- What was broken, missing, or risky. Link the issue or the spec. -->

## Scope and approval

<!-- What is in scope, what is deliberately out of scope, and who approved a
change that goes beyond the original request. -->

## Verification evidence

<!--
Commands, copyable as written:
  $ command
  output

Then: what you did not check, and why. Screenshots for interface changes.
-->

## version: 1.3.9 → 1.4.0

<!-- Replace both numbers with the real version line, before and after this
pull request. Feature or architecture: minor. Fix, docs, chore: patch. Breaking:
major. A change made while this pull request is open bumps the patch again. -->

## Changelog

<!-- The line added to docs/changelog.md, and the manifest that was bumped. -->

## Risk and rollback

<!-- What can break, how you would notice, and how to roll back. -->

## Checklist

- [ ] No secrets, tokens, `.env` files, or customer data in the diff.
- [ ] Tests cover the change, and the suite passes locally.
- [ ] Docs, changelog, and version are updated in this pull request.
- [ ] The local code review and the Kodus review loop are clean.
- [ ] PR-Agent has no open comments, or every remaining comment has a reason.
