#!/usr/bin/env bash
# Deploy the dashboard (frontend/) to Vercel production via the CLI.
#
#   scripts/deploy-web.sh
#
# Needs VERCEL_TOKEN (environment or repo-root .env.tools) and a linked
# .vercel/project.json at the repo root (`vercel link`). .vercelignore limits
# the upload to frontend/; --archive=tgz keeps it to one file so the Hobby
# plan's daily upload cap is not burned. The CLI can echo the token in errors,
# so its output is masked.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
if [ -f "$ROOT/.env.tools" ]; then set -a; . "$ROOT/.env.tools"; set +a; fi
: "${VERCEL_TOKEN:?set VERCEL_TOKEN}"
[ -f "$ROOT/.vercel/project.json" ] || { echo "deploy-web: run 'vercel link' at the repo root first" >&2; exit 1; }

cd "$ROOT"
vercel deploy --prod --yes --archive=tgz --token "$VERCEL_TOKEN" 2>&1 \
  | sed -E 's/vc[a-z]_[A-Za-z0-9]+/vc*_***/g'
