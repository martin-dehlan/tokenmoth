#!/usr/bin/env sh
# TokenMoth CLI installer (public). Downloads a prebuilt `tokenmoth` binary from
# the public S3 distribution bucket (repo stays private; no Rust needed).
#
#   curl -fsSL https://tokenmoth-dist.s3.eu-central-1.amazonaws.com/install.sh | sh
#
# Env: TOKENMOTH_BIN_DIR (default ~/.local/bin)
set -eu

BASE="https://tokenmoth-dist.s3.eu-central-1.amazonaws.com"
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
curl -fsSL "$BASE/tokenmoth-$target.tar.gz" | tar -xz -C "$tmp"
mkdir -p "$BINDIR"
install -m 0755 "$tmp/tokenmoth" "$BINDIR/tokenmoth"

echo "✓ installed → $BINDIR/tokenmoth"
case ":$PATH:" in
  *":$BINDIR:"*) : ;;
  *) echo "  add to your shell profile:  export PATH=\"$BINDIR:\$PATH\"" ;;
esac
echo "  next:  tokenmoth setup --key <your-key> --api-url https://api.tokenmoth.com"
