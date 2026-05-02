#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
# Default to a sibling checkout (../ama relative to puyo3 root). Override via
# AMA_REPO env if your clone lives elsewhere; CI sets it explicitly.
AMA_REPO="${AMA_REPO:-$ROOT/../ama}"
VENDOR="$ROOT/src-tauri/vendor/ama"

if [ ! -d "$AMA_REPO" ]; then
  echo "AMA_REPO not found at $AMA_REPO (set AMA_REPO=/path/to/ama)" >&2
  exit 1
fi

case "${1:-}" in
  --all-targets)
    TARGETS=(x86_64-apple-darwin aarch64-apple-darwin aarch64-linux-android x86_64-linux-android)
    ;;
  --target=*)
    TARGETS=("${1#--target=}")
    ;;
  "")
    TARGETS=("$(rustc -vV | sed -n 's/host: //p')")
    ;;
  *)
    echo "usage: $0 [--all-targets | --target=<triple>]" >&2
    exit 2
    ;;
esac

mkdir -p "$VENDOR"

for T in "${TARGETS[@]}"; do
  echo "=== building libama_native.a for $T ==="
  case "$T" in
    x86_64-apple-darwin)    (cd "$AMA_REPO" && make native-x86-darwin) ;;
    aarch64-apple-darwin)   (cd "$AMA_REPO" && make native-arm-darwin) ;;
    aarch64-linux-android)
      if [ -z "${NDK_HOME:-}" ]; then echo "NDK_HOME not set" >&2; exit 3; fi
      (cd "$AMA_REPO" && NDK_HOME="$NDK_HOME" make native-arm-android)
      ;;
    x86_64-linux-android)
      if [ -z "${NDK_HOME:-}" ]; then echo "NDK_HOME not set" >&2; exit 3; fi
      (cd "$AMA_REPO" && NDK_HOME="$NDK_HOME" make native-x86-android)
      ;;
    *)
      echo "unknown target $T" >&2; exit 4 ;;
  esac
  mkdir -p "$VENDOR/$T"
  cp "$AMA_REPO/bin/native/$T/libama_native.a" "$VENDOR/$T/"
  echo "→ $VENDOR/$T/libama_native.a"
done

cp "$AMA_REPO/config.json" "$VENDOR/"
echo "→ $VENDOR/config.json"

ls -lh "$VENDOR"/*/libama_native.a "$VENDOR/config.json"
