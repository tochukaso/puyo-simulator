#!/usr/bin/env bash
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
OUT="$ROOT/third-party"
mkdir -p "$OUT"

echo "→ npm production deps"
(cd "$ROOT" && npx license-checker --production --json --out "$OUT/npm-licenses.json")
(cd "$ROOT" && npx license-checker --production --csv  --out "$OUT/npm-licenses.csv")

echo "→ Cargo deps (Tauri side)"
(cd "$ROOT/src-tauri" && cargo about generate about.hbs > "$OUT/rust-licenses.html")

echo "→ vendored C++ deps + Apache-2.0 NOTICE files"
for f in ama-MIT sse2neon-MIT nlohmann-MIT rapidhash-BSD2 tauri-NOTICE tfjs-NOTICE; do
  cp "$ROOT/LICENSES/$f.txt" "$OUT/"
done

ls -la "$OUT"
