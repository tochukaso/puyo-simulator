#!/usr/bin/env bash
set -euo pipefail

AMA_REPO="${AMA_REPO:-/Users/yasumitsuomori/git/ama}"
DEST_DIR="$(cd "$(dirname "$0")/.." && pwd)/public/wasm"

if [ ! -d "$AMA_REPO" ]; then
  echo "AMA_REPO not found at $AMA_REPO" >&2
  exit 1
fi
if ! command -v emcc >/dev/null 2>&1; then
  echo "emcc not found. Install with: brew install emscripten" >&2
  exit 1
fi

(cd "$AMA_REPO" && make wasm)

mkdir -p "$DEST_DIR"
cp "$AMA_REPO/bin/wasm/ama.wasm" "$DEST_DIR/"
cp "$AMA_REPO/bin/wasm/ama.js" "$DEST_DIR/"

echo "ama WASM built and copied to $DEST_DIR"
ls -lh "$DEST_DIR"
