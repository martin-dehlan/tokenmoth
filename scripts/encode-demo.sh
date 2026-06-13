#!/usr/bin/env bash
# Encode the recorded product tour into shippable assets.
#
#   scripts/encode-demo.sh [in.webm] [out-basename]
#
# Defaults: recordings/demo.webm  ->  docs/demo/tokenmoth-demo.{mp4,gif}
#
# - MP4: H.264, +faststart (web-streamable), yuv420p (Safari/QuickTime safe).
# - GIF: two-pass palettegen/paletteuse for a clean, dithered palette. Tuned to
#   ~15 fps and ~1000px wide to keep the file small enough for README/social.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
IN="${1:-$ROOT/recordings/demo.webm}"
OUT_BASE="${2:-$ROOT/docs/demo/tokenmoth-demo}"
OUT_DIR="$(dirname "$OUT_BASE")"

# Defaults chosen so a ~22s tour lands the GIF under GitHub's ~10MB inline cap.
GIF_FPS="${GIF_FPS:-11}"
GIF_WIDTH="${GIF_WIDTH:-760}"

command -v ffmpeg >/dev/null 2>&1 || { echo "ffmpeg not found on PATH" >&2; exit 1; }
[ -f "$IN" ] || { echo "input not found: $IN (run scripts/record-demo.mjs first)" >&2; exit 1; }
mkdir -p "$OUT_DIR"

echo "[encode] $IN -> $OUT_BASE.mp4"
ffmpeg -y -i "$IN" \
  -movflags +faststart \
  -pix_fmt yuv420p \
  -c:v libx264 -preset slow -crf 20 \
  -vf "scale=trunc(iw/2)*2:trunc(ih/2)*2" \
  -an \
  "$OUT_BASE.mp4"

echo "[encode] $IN -> $OUT_BASE.gif (fps=$GIF_FPS width=$GIF_WIDTH)"
PALETTE="$(mktemp -u).png"
ffmpeg -y -i "$IN" \
  -vf "fps=$GIF_FPS,scale=$GIF_WIDTH:-1:flags=lanczos,palettegen=stats_mode=diff" \
  "$PALETTE"
ffmpeg -y -i "$IN" -i "$PALETTE" \
  -lavfi "fps=$GIF_FPS,scale=$GIF_WIDTH:-1:flags=lanczos[x];[x][1:v]paletteuse=dither=sierra2_4a" \
  "$OUT_BASE.gif"
rm -f "$PALETTE"

echo "[encode] done:"
ls -lh "$OUT_BASE.mp4" "$OUT_BASE.gif" | awk '{print "  " $5 "  " $9}'
