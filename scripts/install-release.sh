#!/usr/bin/env sh
# TokenMoth CLI installer (public). Downloads a prebuilt `tokenmoth` binary from
# the public distribution host (repo stays private; no Rust needed).
#
#   curl -fsSL https://get.tokenmoth.com/install.sh | sh
#
# Env: TOKENMOTH_BIN_DIR  (default ~/.local/bin)
#      TOKENMOTH_DIST_BASE (override the dist host)
set -eu

# Branded dist domain (CloudFront → S3, see issue #124); raw S3 is the
# transitional fallback if the branded host is unreachable.
BASE="${TOKENMOTH_DIST_BASE:-https://get.tokenmoth.com}"
FALLBACK="https://tokenmoth-dist.s3.eu-central-1.amazonaws.com"
BINDIR="${TOKENMOTH_BIN_DIR:-$HOME/.local/bin}"

os="$(uname -s)"
arch="$(uname -m)"
target=""
case "$os" in
  Darwin) case "$arch" in
    arm64) target="aarch64-apple-darwin" ;;
    x86_64) target="x86_64-apple-darwin" ;;
  esac ;;
  Linux) case "$arch" in
    x86_64) target="x86_64-unknown-linux-gnu" ;;
    aarch64 | arm64) target="aarch64-unknown-linux-gnu" ;;
  esac ;;
esac
[ -n "$target" ] || { echo "tokenmoth: unsupported platform $os/$arch" >&2; exit 1; }

echo "→ downloading tokenmoth ($target)…"
tmp="$(mktemp -d)"
trap 'rm -rf "$tmp"' EXIT
artifact="tokenmoth-$target.tar.gz"
if ! curl -fsSL "$BASE/$artifact" | tar -xz -C "$tmp" 2>/dev/null; then
  echo "  $BASE unreachable — falling back to S3…" >&2
  curl -fsSL "$FALLBACK/$artifact" | tar -xz -C "$tmp"
fi
mkdir -p "$BINDIR"
install -m 0755 "$tmp/tokenmoth" "$BINDIR/tokenmoth"

echo "✓ installed → $BINDIR/tokenmoth"
case ":$PATH:" in
  *":$BINDIR:"*) : ;;
  *) echo "  add to your shell profile:  export PATH=\"$BINDIR:\$PATH\"" ;;
esac
echo "  next:  tokenmoth setup --key <your-key> --api-url https://api.tokenmoth.com"
