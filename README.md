# 🦋 TokenMoth

**See where your Claude Code tokens actually go** — per Git repo, down to the single
session. A tiny Rust ingestion API, a zero-setup CLI that installs a Claude Code hook,
and a clean light/dark Next.js dashboard.

<p align="center">
  <a href="https://tokenmoth.com"><img src="https://img.shields.io/badge/live-tokenmoth.com-1a7f64" alt="Live"></a>
  <img src="https://img.shields.io/badge/license-Apache--2.0-1a7f64.svg" alt="License: Apache 2.0">
  <img src="https://img.shields.io/npm/v/tokenmoth?color=cf6a1f&label=npm" alt="npm version">
  <img src="https://img.shields.io/badge/Claude%20Code-SessionEnd%20hook-cf6a1f" alt="Claude Code hook">
</p>

<p align="center">
  <a href="./docs/demo/tokenmoth-demo.mp4">
    <img src="./docs/demo/tokenmoth-demo.gif" alt="TokenMoth product tour — dashboard, per-repo drill-down and per-session cost anatomy" width="760">
  </a>
  <br>
  <em>The dashboard on demo data — <a href="./docs/demo/tokenmoth-demo.mp4">watch the MP4</a>. Built with <a href="./scripts/README.md"><code>scripts/record-demo.mjs</code></a>.</em>
</p>

> ⚠️ Read [`AUDIT.md`](./AUDIT.md) first. Claude Code hook payloads do **not** carry
> token counts — usage is parsed from the session transcript. The architecture here is
> the corrected design, not the naive "forward the hook payload" one.

## Why

- **Per-repo attribution** — usage and cost split by Git project, not one global number.
- **Optimizer** — which MCP servers load every session vs actually get *called*; drop the dead ones.
- **Per-session anatomy** — input / output / cache, per model, per plugin, per run.
- **Hook & plugin cost** — what each injection quietly costs you per month.
- **Privacy-first** — transcripts parsed locally; only an aggregated, whitelisted summary leaves your machine.
- **Self-hostable** — point the CLI at your own API; your data never leaves your stack.

## How it works

```
Claude Code session ends
        │  SessionEnd hook  (settings.json)
        ▼
tokenmoth report  ──reads──► transcript JSONL  (sums message.usage)
        │                   derives repo via git
        │  POST /v1/telemetry   Authorization: Bearer tf_...
        ▼
tokenmoth-api (Axum)  ──upsert (UNIQUE session_id)──►  Postgres
        ▲
        │  GET (dashboard)
Next.js dashboard
```

## Privacy — what leaves your machine

Transcripts are parsed **locally**; one aggregated summary per session is sent:
session id, repo **basename** (never the absolute path), model names, token counts,
hook/MCP names with overhead counts, and a downsampled per-turn token series.
Never sent: transcript content, prompts, code, file paths, usernames, env vars.
The payload is a whitelist enforced by a unit test
(`telemetry_body_only_whitelisted_fields_no_absolute_path`). Full dev-readable
breakdown: [tokenmoth.com/data](https://tokenmoth.com/data). Zero-trust option:
self-host (below) and point the CLI at your own API.

Verify it yourself — prints the exact payload for your most recent session,
needs no key, sends nothing:

```bash
npx tokenmoth report --dry-run
```

## Repo layout

```
backend/
  crates/api/      Axum + SQLx ingestion API   (POST /v1/telemetry, /health)
  crates/cli/      tokenmoth CLI                 (setup + report subcommands)
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
./scripts/install.sh tm_user_123 http://localhost:8080

# 3. finish a Claude Code session in any git repo — it logs on SessionEnd.
#    remove anytime:  tokenmoth uninstall
```

Open the dashboard (`frontend`, below) and your repos appear as you work. Change
`TOKENMOTH_BOOTSTRAP_KEY` in `docker-compose.yml` to your own secret. Data persists in
the `tokenmoth_pg` volume across restarts. For a cloud deploy instead, see **Hosting**.

## Backend — run locally (without Docker)

Requires Rust (`rustup`) and Postgres.

```bash
cd backend
cp .env.example .env            # set DATABASE_URL
createdb tokenmoth               # or point DATABASE_URL at any Postgres
cargo run -p tokenmoth-api       # runs migrations, listens on :8080
psql "$DATABASE_URL" -f seed.sql   # creates dev key tm_user_123
```

### Endpoints

| Method | Path             | Auth            | Body                         |
|--------|------------------|-----------------|------------------------------|
| GET    | `/health`        | none            | —                            |
| POST   | `/v1/telemetry`  | `Bearer <key>`  | aggregated session usage JSON |

## CLI — install the hook

All paths ship the same prebuilt `tokenmoth` binary — **no Rust toolchain, no
compile** needed to use it. Pick one:

**npm** (every Claude Code user already has Node — lowest friction):

```bash
npx tokenmoth setup --key <your-key>     # one-off, no install
npm install -g tokenmoth                  # or install globally
```

**curl / PowerShell** (no Node):

```bash
curl -fsSL https://get.tokenmoth.com/install.sh | sh          # macOS / Linux
irm  https://get.tokenmoth.com/install.ps1 | iex              # Windows (PowerShell)
```

Then register the hook:

```bash
tokenmoth setup --key <your-key> --api-url https://api.tokenmoth.com
```

Installers download the right binary for your OS/arch (macOS + Linux arm64/x64,
Windows x64) from the branded dist host (`get.tokenmoth.com`, CloudFront → S3;
see [#124](https://github.com/martin-dehlan/tokenmoth/issues/124)), with the raw
S3 bucket as a transitional fallback. Build + publish: `.github/workflows/release.yml`.
npm wrapper lives in [`npm/`](./npm).

**From source:**

```bash
cd backend
cargo install --path crates/cli      # installs `tokenmoth`
tokenmoth setup --key tm_user_123 --api-url http://localhost:8080
```

This deep-merges a `SessionEnd` hook into `~/.claude/settings.json`
(use `--local` for the project's `.claude/settings.json`), **preserving all existing
settings**. The installed hook runs `tokenmoth report --detach`, which re-spawns in the
background and returns instantly so SessionEnd never blocks — the orphaned child parses
the transcript and POSTs usage. Repo name is auto-detected per project.

Remove the hook cleanly with `tokenmoth uninstall` (touches only tokenmoth's entry).

## Frontend — run the dashboard

```bash
cd frontend
npm install
cp .env.example .env.local     # set TOKENMOTH_API_URL + TOKENMOTH_API_KEY
npm run dev                    # http://localhost:3000
```

The dashboard fetches per-repo rollups from the API's `GET /v1/repos` (server
component, `Bearer` auth). With no key set it renders **demo mode** (a banner +
sample data) so it always works offline. Set `TOKENMOTH_API_KEY` / `TOKENMOTH_API_URL`
to switch to **live** mode (`● LIVE` indicator).

### Style

Light, editorial "notebook" surface (`--canvas #fbfbfa`) with near-black ink
(`#1f2328`), a teal accent used sparingly (`#1a7f64`) and a copper moth-body highlight
(`#cf6a1f`). JetBrains Mono for figures. Full light **and** dark theme.

## Hosting

Self-host anywhere — nothing here is platform-specific:

- **API** — a single static Rust binary + Postgres, so any container or VM host works
  (Fly.io, Railway, a VPS, or AWS as shown below).
- **Frontend** — a standard Next.js app: any Node host, or a static export behind your CDN.

## Status

Live at [tokenmoth.com](https://tokenmoth.com). Open source under Apache-2.0.
See the GitHub issues & milestones for the roadmap — contributions welcome.

## Security — secret scanning

[gitleaks](https://github.com/gitleaks/gitleaks) guards against committing secrets:

```bash
brew install gitleaks            # one-time
git config core.hooksPath .githooks   # enable the pre-commit hook in this clone
```

- **Pre-commit hook** (`.githooks/pre-commit`) blocks any commit containing a secret.
- **CI** (`.github/workflows/gitleaks.yml`) re-scans every push/PR as a backstop.
- All `.env` / `.env.local` files are gitignored — keep real keys there, never in tracked files.

## Deploy (AWS Lambda + Supabase) — scale-to-zero

Hosted on **AWS**: Rust API on **Lambda** (arm64, behind a public
**API Gateway HTTP API**), Postgres + Auth on **Supabase**, frontend on **AWS Amplify**.
Idle cost ≈ €0 (pay-per-request). All resources tagged `Project=tokenmoth`.

```bash
# 1. create the runtime secret (placeholder), then POPULATE it yourself
scripts/deploy-aws.sh secret
aws secretsmanager put-secret-value --secret-id tokenmoth/prod --region eu-central-1 \
  --secret-string '{
    "DATABASE_URL": "postgresql://postgres.<ref>:<db-pw>@aws-0-<region>.pooler.supabase.com:5432/postgres",
    "SUPABASE_JWT_SECRET": "<Supabase → Settings → JWT>",
    "TOKENMOTH_ADMIN_TOKEN": "<openssl rand -hex 24>"
  }'

# 2. build the arm64 Lambda + deploy behind API Gateway (env injected from the secret)
cd backend && cargo lambda build --release --arm64 --features lambda -p tokenmoth-api && cd ..
scripts/deploy-lambda.sh        # prints the public API URL

# 3. point the CLI hook at the cloud
tokenmoth setup --key tm_user_123 --api-url https://<api-id>.execute-api.eu-central-1.amazonaws.com
```

Gotchas (codified in `scripts/deploy-lambda.sh`): use the Supabase **session pooler
(:5432)** — the transaction pooler (6543) breaks sqlx prepared statements; we front the
Lambda with **API Gateway** (Function URLs can be disabled by org SCPs and give a less
stable endpoint); the Lambda entrypoint is feature-gated (`--features lambda`),
local/compose stays `axum::serve`.

Secrets live **only** in AWS Secrets Manager (`tokenmoth/prod`), operator-set — never in
the repo. **Project isolation:** everything is tagged `Project=tokenmoth`, so a
resource-tag IAM condition can scope access per teammate.
