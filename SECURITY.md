# Security Policy

## Reporting a vulnerability

**Please do not open a public issue for security vulnerabilities.**

Report privately via GitHub's [private vulnerability reporting](https://github.com/martin-dehlan/tokenmoth/security/advisories/new)
(Security → Report a vulnerability). If you cannot use that, email
**security@tokenmoth.com**.

Please include:

- a description of the issue and its impact,
- steps to reproduce (proof-of-concept if possible),
- affected component (CLI, ingestion API, web dashboard) and version/commit.

We aim to acknowledge reports within **72 hours** and to provide a remediation
timeline after triage. Please give us a reasonable window to ship a fix before
any public disclosure.

## Scope

In scope: the Rust ingestion API (`backend/crates/api`), the CLI
(`backend/crates/cli`), and the Next.js dashboard (`frontend/`).

Out of scope: third-party services we depend on (Supabase, Vercel, Stripe,
PostHog) — report those to the respective vendor.

## Handling secrets

This repository must never contain real secrets. All credentials are supplied at
runtime via environment variables / AWS Secrets Manager. A `gitleaks` pre-commit
hook and CI workflow scan every change. If you find a committed secret, treat it
as a vulnerability and report it privately as above.
