#!/usr/bin/env bash
set -euo pipefail

AMA_REPO="${AMA_REPO:-/Users/yasumitsuomori/git/ama}"
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
PUBLIC_DIR="$ROOT/public/wasm"
GLUE_DIR="$ROOT/src/ai/wasm-ama/_glue"

if [ ! -d "$AMA_REPO" ]; then
  echo "AMA_REPO not found at $AMA_REPO" >&2
  exit 1
fi
if ! command -v emcc >/dev/null 2>&1; then
  echo "emcc not found. Install with: brew install emscripten" >&2
  exit 1
fi

(cd "$AMA_REPO" && make wasm)

mkdir -p "$PUBLIC_DIR" "$GLUE_DIR"
cp "$AMA_REPO/bin/wasm/ama.wasm" "$PUBLIC_DIR/"
cp "$AMA_REPO/bin/wasm/ama.js" "$GLUE_DIR/"

echo "ama WASM built:"
echo "  $PUBLIC_DIR/ama.wasm  (committed; fetched at runtime)"
echo "  $GLUE_DIR/ama.js      (gitignored; imported by TS via _glue/ama.js)"
ls -lh "$PUBLIC_DIR/ama.wasm" "$GLUE_DIR/ama.js"
