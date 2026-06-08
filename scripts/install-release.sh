#!/usr/bin/env sh
# TokenMoth installer — downloads a prebuilt `tokenmoth` binary from the latest
# GitHub release (no Rust toolchain needed).
#
#   curl -fsSL https://raw.githubusercontent.com/martin-dehlan/tokenmoth/main/scripts/install-release.sh | sh
#
# Env:
#   TOKENMOTH_BIN_DIR   install dir (default: ~/.local/bin)
#   TOKENMOTH_VERSION   release tag (default: latest)
set -eu

REPO="martin-dehlan/tokenmoth"
BINDIR="${TOKENMOTH_BIN_DIR:-$HOME/.local/bin}"
VERSION="${TOKENMOTH_VERSION:-latest}"

os="$(uname -s)"
arch="$(uname -m)"
target=""
case "$os" in
  Darwin)
    case "$arch" in
      arm64) target="aarch64-apple-darwin" ;;
      x86_64) target="x86_64-apple-darwin" ;;
    esac ;;
  Linux)
    case "$arch" in
      x86_64) target="x86_64-unknown-linux-gnu" ;;
      aarch64 | arm64) target="aarch64-unknown-linux-gnu" ;;
    esac ;;
esac
[ -n "$target" ] || { echo "tokenmoth: unsupported platform $os/$arch" >&2; exit 1; }

if [ "$VERSION" = "latest" ]; then
  url="https://github.com/$REPO/releases/latest/download/tokenmoth-$target.tar.gz"
else
  url="https://github.com/$REPO/releases/download/$VERSION/tokenmoth-$target.tar.gz"
fi

echo "→ downloading tokenmoth ($target)…"
tmp="$(mktemp -d)"
trap 'rm -rf "$tmp"' EXIT
curl -fsSL "$url" | tar -xz -C "$tmp"
mkdir -p "$BINDIR"
install -m 0755 "$tmp/tokenmoth" "$BINDIR/tokenmoth"

echo "✓ installed → $BINDIR/tokenmoth"
case ":$PATH:" in
  *":$BINDIR:"*) : ;;
  *) echo "  add to your shell profile:  export PATH=\"$BINDIR:\$PATH\"" ;;
esac
echo "  next:  tokenmoth setup --key <your-key> --api-url <your-api-url>"
