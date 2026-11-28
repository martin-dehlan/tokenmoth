#!/usr/bin/env sh
# Build the API image, push it to GHCR and trigger a Render deploy.
#
#   scripts/deploy-api.sh
#
# Needs (environment or repo-root .env.tools):
#   GITHUB_TOKEN       — PAT with write:packages (GHCR push)
#   RENDER_API_KEY     — Render API key
#   RENDER_SERVICE_ID  — srv-… of the image-backed web service
# Optional: TOKENMOTH_IMAGE (default ghcr.io/martin-dehlan/tokenmoth-api:latest),
#           GHCR_USER (default martin-dehlan).
#
# Migrations are embedded in the binary and run on startup, so a deploy also
# applies any new backend/migrations/*.sql.
set -eu

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
if [ -f "$ROOT/.env.tools" ]; then set -a; . "$ROOT/.env.tools"; set +a; fi
: "${GITHUB_TOKEN:?set GITHUB_TOKEN (write:packages)}"
: "${RENDER_API_KEY:?set RENDER_API_KEY}"
: "${RENDER_SERVICE_ID:?set RENDER_SERVICE_ID (srv-…)}"
IMAGE="${TOKENMOTH_IMAGE:-ghcr.io/martin-dehlan/tokenmoth-api:latest}"
GHCR_USER="${GHCR_USER:-martin-dehlan}"

cd "$ROOT"
# Render runs amd64; force it when building on Apple Silicon.
docker build --platform linux/amd64 -t "$IMAGE" .
printf '%s' "$GITHUB_TOKEN" | docker login ghcr.io -u "$GHCR_USER" --password-stdin >/dev/null
docker push "$IMAGE"

code="$(curl -s -o /dev/null -w '%{http_code}' -X POST \
  "https://api.render.com/v1/services/$RENDER_SERVICE_ID/deploys" \
  -H "Authorization: Bearer $RENDER_API_KEY" -H "Content-Type: application/json" -d '{}')"
case "$code" in
  2*) echo "✓ Render deploy triggered ($code). Check: curl https://api.tokenmoth.com/health" ;;
  *) echo "deploy-api: Render API returned $code" >&2; exit 1 ;;
esac
