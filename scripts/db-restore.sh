#!/usr/bin/env sh
# Restore a TokenMoth dump into a target Postgres (new-account cutover).
#
#   TOKENMOTH_TARGET_DB_URL=postgresql://… scripts/db-restore.sh [--force] dump.sql
#
# Use the destination's Supabase SESSION pooler (:5432) URL.
#
# The dump is created with --clean (db-dump.sh), so restoring DROPS existing
# objects in the target. To guard against fat-fingered cutovers:
#   * an interactive y/N confirmation is required (skip with --force, e.g. CI);
#   * if the target host equals the PROD host (DATABASE_URL in Secrets Manager
#     tokenmoth/prod, same lookup as db-dump.sh), --force is mandatory.
set -eu

FORCE=0
IN=""
for arg in "$@"; do
  case "$arg" in
    --force) FORCE=1 ;;
    *) IN="$arg" ;;
  esac
done
[ -n "$IN" ] || { echo "usage: db-restore.sh [--force] <dump.sql>" >&2; exit 1; }
[ -f "$IN" ] || { echo "db-restore: no such file: $IN" >&2; exit 1; }
: "${TOKENMOTH_TARGET_DB_URL:?set TOKENMOTH_TARGET_DB_URL to the destination Postgres}"

# Host portion of a postgres URL (strip credentials, then port/path).
url_host() {
  printf '%s\n' "$1" | sed -e 's|.*@||' -e 's|[:/].*||'
}
TARGET_HOST="$(url_host "$TOKENMOTH_TARGET_DB_URL")"

# Resolve the prod host the same way db-dump.sh does (best-effort: no AWS
# creds / no secret access just skips the prod check, it never blocks dev use).
PROD_URL="$(aws secretsmanager get-secret-value \
  --secret-id tokenmoth/prod --region "${AWS_REGION:-eu-central-1}" \
  --query SecretString --output text 2>/dev/null \
  | python3 -c 'import sys,json;print(json.load(sys.stdin)["DATABASE_URL"])' 2>/dev/null \
  || true)"
if [ -n "$PROD_URL" ]; then
  PROD_HOST="$(url_host "$PROD_URL")"
  if [ "$TARGET_HOST" = "$PROD_HOST" ] && [ "$FORCE" -ne 1 ]; then
    echo "db-restore: REFUSING — target host '$TARGET_HOST' is the PRODUCTION database." >&2
    echo "  This restore runs a --clean dump (drops existing objects)." >&2
    echo "  Re-run with --force if you really mean to overwrite prod." >&2
    exit 1
  fi
fi

if [ "$FORCE" -ne 1 ]; then
  if [ ! -t 0 ]; then
    echo "db-restore: refusing to run non-interactively without --force" >&2
    exit 1
  fi
  printf "About to restore '%s' into host: %s\n" "$IN" "$TARGET_HOST"
  printf "This DROPS existing objects in the target (--clean dump). Continue? [y/N] "
  read -r ans
  case "$ans" in
    y | Y | yes | YES) ;;
    *) echo "aborted."; exit 1 ;;
  esac
fi

PSQL="$(brew --prefix libpq 2>/dev/null)/bin/psql"
[ -x "$PSQL" ] || PSQL=psql

"$PSQL" "$TOKENMOTH_TARGET_DB_URL" -v ON_ERROR_STOP=1 -f "$IN"
echo "✓ restored ← $IN"
