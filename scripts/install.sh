#!/usr/bin/env bash
# tokenmoth installer — build + install the CLI, then register the Claude Code hook.
#
#   ./scripts/install.sh <api-key> [api-url]
#
# Defaults the API URL to the local durable stack (docker compose up -d).
set -euo pipefail

KEY="${1:-}"
API_URL="${2:-http://localhost:8080}"
HERE="$(cd "$(dirname "$0")/.." && pwd)"

if [ -z "$KEY" ]; then
  echo "usage: $0 <api-key> [api-url]" >&2
  echo "  e.g. $0 tm_user_123 http://localhost:8080" >&2
  exit 1
fi

if ! command -v cargo >/dev/null 2>&1; then
  echo "error: cargo (Rust) not found. Install from https://rustup.rs" >&2
  exit 1
fi

echo "→ building + installing the tokenmoth CLI…"
cargo install --path "$HERE/backend/crates/cli" --force

echo "→ registering the Claude Code SessionEnd hook…"
tokenmoth setup --key "$KEY" --api-url "$API_URL"

echo
echo "✓ tokenmoth installed. Finish a Claude Code session in any git repo to log it."
echo "  Remove anytime with:  tokenmoth uninstall"
