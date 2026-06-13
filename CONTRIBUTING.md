# Contributing to TokenMoth

Thanks for your interest in contributing! This document covers how to get a local
environment running and the conventions we follow.

By contributing you agree that your contributions are licensed under the
[Apache License 2.0](./LICENSE).

## Project layout

```
backend/crates/api    Rust (Axum) ingestion API
backend/crates/cli    Rust CLI (`tokenmoth`) — installs the Claude Code hook
backend/migrations    Postgres schema (sqlx migrate)
frontend/             Next.js dashboard
npm/                  thin npm wrapper that installs the CLI binary
scripts/              deploy + demo-recording helpers
```

Read [`AUDIT.md`](./AUDIT.md) before touching the hook/CLI/ingestion path — it
documents why usage is parsed from the transcript, not the hook payload.

## Local development

Requires Docker (OrbStack/Docker Desktop) and Rust (`rustup`).

```bash
# Backend + DB (API self-runs migrations, bootstraps a dev key)
docker compose up -d --build          # API on http://localhost:8080

# …or run the API directly
cd backend && cargo run -p tokenmoth-api

# Frontend
cd frontend && npm install && npm run dev   # http://localhost:3000
```

## Before opening a pull request

- **Backend:** `cargo fmt`, `cargo clippy --all-targets`, `cargo test`
- **Frontend:** `npm run lint` and a successful `npm run build`
- Keep secrets out of the diff — the `gitleaks` hook/CI will block real ones.
- Write a clear commit message; we use Conventional-Commit-style prefixes
  (`feat:`, `fix:`, `docs:`, `chore:`…).

## Pull requests

1. Fork and create a feature branch off `main`.
2. Keep PRs focused; explain the *why*, not just the *what*.
3. Make sure CI is green.

## Reporting bugs / requesting features

Open an issue using the templates under `.github/ISSUE_TEMPLATE`. For security
issues, follow [`SECURITY.md`](./SECURITY.md) instead — do not file a public issue.
