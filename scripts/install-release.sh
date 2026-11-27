#!/usr/bin/env sh
# TokenMoth CLI installer (public). Downloads a prebuilt `tokenmoth` binary from
# the latest GitHub Release (no Rust needed).
#
#   curl -fsSL https://get.tokenmoth.com/install.sh | sh
#
# Env: TOKENMOTH_BIN_DIR  (default ~/.local/bin)
#      TOKENMOTH_DIST_BASE (override the download base, e.g. a self-hosted mirror)
set -eu

BASE="${TOKENMOTH_DIST_BASE:-https://github.com/martin-dehlan/tokenmoth/releases/latest/download}"
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

# Pick a sha256 tool (macOS ships shasum; most Linux distros ship sha256sum).
if command -v sha256sum >/dev/null 2>&1; then
  sha_cmd="sha256sum"
elif command -v shasum >/dev/null 2>&1; then
  sha_cmd="shasum -a 256"
else
  echo "tokenmoth: need sha256sum or shasum to verify the download" >&2
  exit 1
fi

echo "→ downloading tokenmoth ($target)…"
tmp="$(mktemp -d)"
trap 'rm -rf "$tmp"' EXIT
artifact="tokenmoth-$target.tar.gz"

# Download tarball + .sha256 sidecar from one host ($1).
fetch() {
  curl -fSsL "$1/$artifact" -o "$tmp/$artifact" &&
    curl -fSsL "$1/$artifact.sha256" -o "$tmp/$artifact.sha256"
}
fetch "$BASE" || { echo "tokenmoth: download from $BASE failed (see curl error above)" >&2; exit 1; }

# Verify the tarball against the published checksum before extracting.
expected="$(awk '{print $1}' "$tmp/$artifact.sha256")"
actual="$($sha_cmd "$tmp/$artifact" | awk '{print $1}')"
if [ -z "$expected" ] || [ "$expected" != "$actual" ]; then
  echo "tokenmoth: SHA-256 MISMATCH for $artifact" >&2
  echo "  expected: $expected" >&2
  echo "  actual:   $actual" >&2
  echo "  The download is corrupted or has been tampered with. Aborting." >&2
  exit 1
fi
echo "  ✓ sha256 verified"

tar -xzf "$tmp/$artifact" -C "$tmp"
mkdir -p "$BINDIR"
install -m 0755 "$tmp/tokenmoth" "$BINDIR/tokenmoth"

echo "✓ installed → $BINDIR/tokenmoth"
case ":$PATH:" in
  *":$BINDIR:"*) : ;;
  *) echo "  add to your shell profile:  export PATH=\"$BINDIR:\$PATH\"" ;;
esac
echo "  next:  tokenmoth setup --key <your-key> --api-url https://api.tokenmoth.com"
