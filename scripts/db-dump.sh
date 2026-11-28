#!/usr/bin/env sh
# Dump the TokenMoth Postgres (schema + data) for backup / account cutover.
#
#   scripts/db-dump.sh [out.sql]
#
# Source: TOKENMOTH_DB_URL, else DATABASE_URL (from the environment or the
# repo-root .env). Use the Supabase SESSION pooler (:5432) URL.
set -eu

OUT="${1:-tokenmoth-dump-$(date +%Y%m%d-%H%M%S).sql}"
PGDUMP="$(brew --prefix libpq 2>/dev/null)/bin/pg_dump"
[ -x "$PGDUMP" ] || PGDUMP=pg_dump

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
if [ -z "${TOKENMOTH_DB_URL:-}${DATABASE_URL:-}" ] && [ -f "$ROOT/.env" ]; then
  set -a; . "$ROOT/.env"; set +a
fi
URL="${TOKENMOTH_DB_URL:-${DATABASE_URL:-}}"
[ -n "$URL" ] || { echo "db-dump: set TOKENMOTH_DB_URL or DATABASE_URL (or add it to .env)" >&2; exit 1; }

"$PGDUMP" "$URL" --no-owner --no-privileges --clean --if-exists -f "$OUT"
echo "✓ dumped → $OUT  ($(wc -l < "$OUT") lines)"
