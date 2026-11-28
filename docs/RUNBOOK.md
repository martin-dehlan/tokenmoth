# TokenMoth — Operations Runbook

How the hosted TokenMoth is deployed, and how to move it to other accounts with no
data loss. Everything is rebuilt from source; the only stateful pieces are the
**Supabase Postgres** (users, api_keys, token_logs, repo_aliases) and the
**runtime environment variables**.

All deploys run from the CLI or API. No platform is connected to the GitHub repo for
auto-deploys.

## What lives where

| Piece | Location | Deploy / portable how |
|---|---|---|
| Schema + data | Supabase Postgres (eu-west-1) | migrations run on API start · `scripts/db-dump.sh` / `db-restore.sh` |
| Auth | Supabase Auth (Google, GitHub) | re-create providers + URL config by hand |
| API | Render web service (Frankfurt), Docker image from GHCR | `scripts/deploy-api.sh` |
| Dashboard + `get.` host | Vercel (Hobby) | `scripts/deploy-web.sh` |
| CLI binaries | GitHub Releases (`cli-v<version>`) | `.github/workflows/release.yml` |
| npm wrapper | npmjs.com `tokenmoth` | published by `release.yml` |
| DNS | Namecheap | see below |

### DNS (Namecheap)

| Host | Record | Target |
|---|---|---|
| `@` | A | `76.76.21.21` (Vercel) |
| `app` | CNAME | `cname.vercel-dns.com.` |
| `get` | CNAME | `cname.vercel-dns.com.` |
| `api` | CNAME | `<service>.onrender.com` |

`get.tokenmoth.com` only redirects: `/install.sh` and `/install.ps1` go to the scripts
on GitHub, and artifact paths go to GitHub Release assets (`frontend/next.config.mjs`).
Older npm versions and existing one-liners keep working that way.

## Secrets and env

Secrets never enter the repo. Locally they live in two gitignored files at the repo
root:

- `.env`: runtime values, the same ones set on Render (`DATABASE_URL`,
  `SUPABASE_URL`, `SUPABASE_JWT_SECRET`, `TOKENMOTH_ADMIN_TOKEN`,
  `TOKENMOTH_RATE_PER_MIN`, `TOKENMOTH_DB_MAX_CONN`, …)
- `.env.tools`: operator tokens for the deploy scripts (`GITHUB_TOKEN` with
  `write:packages`, `RENDER_API_KEY`, `RENDER_SERVICE_ID`, `VERCEL_TOKEN`, …)

Load both with `set -a; . ./.env.tools; . ./.env; set +a`.

Vercel env (Production): `TOKENMOTH_API_URL`, `NEXT_PUBLIC_TOKENMOTH_API_URL`
(= `https://api.tokenmoth.com`), `NEXT_PUBLIC_SUPABASE_URL`,
`NEXT_PUBLIC_SUPABASE_ANON_KEY`. `NEXT_PUBLIC_*` values are baked in at build time,
so redeploy after changing them.

## Deploy

### API

```sh
scripts/deploy-api.sh
curl https://api.tokenmoth.com/health        # ok
```

The script builds the image for `linux/amd64` (needed on Apple Silicon), pushes it to
`ghcr.io/martin-dehlan/tokenmoth-api:latest` and triggers a Render deploy. Migrations
are embedded in the binary and run at startup, so new `backend/migrations/*.sql` go
live with the deploy. Migrations must stay backward compatible with the running
version (expand first, contract later).

Render Free sleeps after 15 minutes idle; the first request after that takes a cold
start of roughly 30–60 s.

### Dashboard

```sh
scripts/deploy-web.sh
```

It runs `vercel deploy --prod --archive=tgz` from the repo root. `.vercelignore` limits
the upload to `frontend/`, and `--archive=tgz` keeps it to one file. Without that, the
Hobby plan's 5000-files-per-day upload cap runs out fast. The script masks tokens in
the CLI output.

### CLI release

1. Bump `backend/crates/cli/Cargo.toml` and `npm/package.json` to the new version,
   then merge to `main`.
2. Tag and dispatch:
   ```sh
   git tag cli-vX.Y.Z && git push origin cli-vX.Y.Z
   gh workflow run release.yml --ref main -f tag=cli-vX.Y.Z
   ```
3. The workflow builds 5 targets, attaches `tokenmoth-<target>.tar.gz` plus `.sha256` to
   the GitHub Release (marked latest), then publishes npm when the repo variable
   `PUBLISH_NPM=true`. That step needs the secret `NPM_TOKEN`, a granular token with
   write access to `tokenmoth`. An `E404` on `PUT registry.npmjs.org/tokenmoth`
   means the token has expired.
4. Check: `npx -y tokenmoth@latest --version`.

## Moving to new accounts

1. **Dump the data:** `scripts/db-dump.sh tokenmoth.sql` (reads `DATABASE_URL`).
2. **New Supabase project.** Note the **session pooler** URL (`:5432`), then restore:
   ```sh
   TOKENMOTH_TARGET_DB_URL='postgresql://…pooler…:5432/postgres' scripts/db-restore.sh tokenmoth.sql
   ```
   Auth: set the Site URL and redirect to `https://app.tokenmoth.com`, and add the Google
   and GitHub OAuth apps. Their callback is
   `https://<ref>.supabase.co/auth/v1/callback`. JWTs are ES256, so there is no
   secret to copy: the API reads the new project's JWKS via `SUPABASE_URL`.
3. **API host.** Create an image-backed web service from the GHCR image, set the
   `.env` values as its env, and put the new service id in `RENDER_SERVICE_ID`.
   Any container host works; the image listens on `BIND_ADDR` (default `0.0.0.0:8080`).
4. **Dashboard.** Run `vercel link` at the repo root, set the four env vars above,
   then `scripts/deploy-web.sh`. Add `tokenmoth.com`, `app.` and `get.` as domains.
5. **DNS.** Repoint the records in the table above.
6. **Verify**
   ```sh
   curl https://api.tokenmoth.com/health                                   # ok
   curl -o /dev/null -w '%{http_code}' https://api.tokenmoth.com/v1/repos  # 401
   ```
   Log in on `app.tokenmoth.com` and confirm that data shows and a new session arrives.

## Notes

- Use the Supabase **session pooler** (`:5432`). The pooler caps clients at 15, so
  keep `TOKENMOTH_DB_MAX_CONN` small.
- The API connects as the owner of the tables. RLS is on for every app table
  (migration 0016) with no policies, so Supabase's Data API roles (`anon`,
  `authenticated`) can't read or write. Owners bypass RLS. New tables must enable it
  in their own migration.
- API keys are stored hashed and survive a dump/restore, so installed CLI hooks keep
  working after a cutover as long as the API URL stays the same.
