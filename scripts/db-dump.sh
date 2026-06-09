#!/usr/bin/env sh
# Dump the TokenMoth Postgres (schema + data) for backup / account cutover.
#
#   scripts/db-dump.sh [out.sql]
#
# Reads DATABASE_URL from AWS Secrets Manager (tokenmoth/prod) unless
# TOKENMOTH_DB_URL is set. AWS_REGION defaults to eu-central-1.
set -eu

OUT="${1:-tokenmoth-dump-$(date +%Y%m%d-%H%M%S).sql}"
PGDUMP="$(brew --prefix libpq 2>/dev/null)/bin/pg_dump"
[ -x "$PGDUMP" ] || PGDUMP=pg_dump

URL="${TOKENMOTH_DB_URL:-$(aws secretsmanager get-secret-value \
  --secret-id tokenmoth/prod --region "${AWS_REGION:-eu-central-1}" \
  --query SecretString --output text \
  | python3 -c 'import sys,json;print(json.load(sys.stdin)["DATABASE_URL"])')}"

"$PGDUMP" "$URL" --no-owner --no-privileges --clean --if-exists -f "$OUT"
echo "✓ dumped → $OUT  ($(wc -l < "$OUT") lines)"
