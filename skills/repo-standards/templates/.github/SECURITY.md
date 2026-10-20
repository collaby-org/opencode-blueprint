# Security policy

## Report privately

Do not open a public issue for a security problem. Report it to
{{SECURITY_CONTACT}} with:

- what is affected and how to reproduce it,
- the impact you believe it has,
- any proof of concept, with secrets and personal data removed.

You will get an acknowledgement, an assessment, and a fix plan. Please keep the
report private until a fix ships.

## Scope

In scope: this repository's code, its build and release configuration, and the
workflows in `.github/workflows`.

Out of scope: third party services and dependencies (report those upstream),
and findings that need a compromised machine or a secret the project never
issued.

## No public issues

Public issues are for bugs and features. A security report opened in public is
closed and the reporter is asked to use the private channel above. Never paste
`.env` files, tokens, keys, or customer data into an issue or a pull request.
