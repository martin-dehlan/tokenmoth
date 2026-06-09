#!/usr/bin/env sh
# Restore a TokenMoth dump into a target Postgres (new-account cutover).
#
#   TOKENMOTH_TARGET_DB_URL=postgresql://… scripts/db-restore.sh dump.sql
#
# Use the destination's Supabase SESSION pooler (:5432) URL.
set -eu

IN="${1:?usage: db-restore.sh <dump.sql>}"
: "${TOKENMOTH_TARGET_DB_URL:?set TOKENMOTH_TARGET_DB_URL to the destination Postgres}"

PSQL="$(brew --prefix libpq 2>/dev/null)/bin/psql"
[ -x "$PSQL" ] || PSQL=psql

"$PSQL" "$TOKENMOTH_TARGET_DB_URL" -v ON_ERROR_STOP=1 -f "$IN"
echo "✓ restored ← $IN"
