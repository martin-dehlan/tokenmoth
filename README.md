# 🐀 tokenrat

Track, aggregate and visualize **Claude Code** token usage & cost — per Git repo, in
real time. A premium micro-SaaS: tiny Rust ingestion API, a zero-setup Rust CLI that
installs a Claude Code hook, and a neo-brutalist Next.js dashboard styled like an
analog breaker fuse box (*Sicherungskasten*).

> ⚠️ Read [`AUDIT.md`](./AUDIT.md) first. Claude Code hook payloads do **not** carry
> token counts — usage is parsed from the session transcript. The architecture here is
> the corrected design, not the naive "forward the hook payload" one.

## How it works

```
Claude Code session ends
        │  SessionEnd hook  (settings.json)
        ▼
tokenrat report  ──reads──► transcript JSONL  (sums message.usage)
        │                   derives repo via git
        │  POST /v1/telemetry   Authorization: Bearer tf_...
        ▼
tokenrat-api (Axum)  ──upsert (UNIQUE session_id)──►  Postgres
        ▲
        │  GET (dashboard)
Next.js fuse-box dashboard
```

## Repo layout

```
backend/
  crates/api/      Axum + SQLx ingestion API   (POST /v1/telemetry, /health)
  crates/cli/      tokenrat CLI                 (setup + report subcommands)
  migrations/      Postgres schema (sqlx migrate)
  seed.sql         dev user + API key
frontend/          Next.js + Tailwind neo-brutalist dashboard
AUDIT.md           architecture audit & corrections
```

## Use it yourself (durable local stack)

The fastest way to actually track your own Claude Code usage. Requires Docker
(OrbStack/Docker Desktop) and Rust (`rustup`).

```bash
# 1. bring up an always-on Postgres + API (restart: unless-stopped).
#    The API self-runs migrations and bootstraps the key in docker-compose.yml.
docker compose up -d --build          # API on http://localhost:8080

# 2. install the CLI and register the Claude Code hook.
./scripts/install.sh tf_user_123 http://localhost:8080

# 3. finish a Claude Code session in any git repo — it logs on SessionEnd.
#    remove anytime:  tokenrat uninstall
```

Open the dashboard (`frontend`, below) and your repos appear as you work. Change
`TOKENRAT_BOOTSTRAP_KEY` in `docker-compose.yml` to your own secret. Data persists in
the `tokenrat_pg` volume across restarts. For a cloud deploy instead, see **Hosting**.

## Backend — run locally (without Docker)

Requires Rust (`rustup`) and Postgres.

```bash
cd backend
cp .env.example .env            # set DATABASE_URL
createdb tokenrat               # or point DATABASE_URL at any Postgres
cargo run -p tokenrat-api       # runs migrations, listens on :8080
psql "$DATABASE_URL" -f seed.sql   # creates dev key tf_user_123
```

### Endpoints

| Method | Path             | Auth            | Body                         |
|--------|------------------|-----------------|------------------------------|
| GET    | `/health`        | none            | —                            |
| POST   | `/v1/telemetry`  | `Bearer <key>`  | aggregated session usage JSON |

## CLI — install the hook

```bash
cd backend
cargo install --path crates/cli      # installs `tokenrat`
tokenrat setup --key tf_user_123 --api-url http://localhost:8080
```

This deep-merges a `SessionEnd` hook into `~/.claude/settings.json`
(use `--local` for the project's `.claude/settings.json`), **preserving all existing
settings**. The installed hook runs `tokenrat report --detach`, which re-spawns in the
background and returns instantly so SessionEnd never blocks — the orphaned child parses
the transcript and POSTs usage. Repo name is auto-detected per project.

Remove the hook cleanly with `tokenrat uninstall` (touches only tokenrat's entry).

## Frontend — run the dashboard

```bash
cd frontend
npm install
cp .env.example .env.local     # set TOKENRAT_API_URL + TOKENRAT_API_KEY
npm run dev                    # http://localhost:3000
```

The dashboard fetches per-repo rollups from the API's `GET /v1/repos` (server
component, `Bearer` auth). With no key set it renders **demo mode** (a banner +
sample data) so it always works offline. Set `TOKENRAT_API_KEY` / `TOKENRAT_API_URL`
to switch to **live** mode (`● LIVE` indicator).

### Style

PostHog-vibe neo-brutalism: deep charcoal `#0d0d0d`, JetBrains Mono, `border-4
border-black`, zero rounding, zero shadows. Accents: PostHog yellow `#fccd04`, toxic
green `#00ff66`.

## Hosting

Not Vercel. Backend → Fly.io / Railway / self-host (single static Rust binary +
Postgres). Frontend → any Node host or static export behind your own CDN.

## Status

MVP scaffold. See the GitHub milestones & issues for the roadmap.
