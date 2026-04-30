# Puyo Training Simulator

A Puyo Puyo training web app with an AI advisor (mobile-friendly PWA).

## Status

MVP (Phase 0-4 complete): heuristic-AI advice version.

## Development

```
npm install
npm run dev      # Development server
npm run test     # Unit tests
npm run e2e      # E2E smoke tests
npm run build    # Production build
npm run lint     # Lint
```

## Supply chain security (Takumi Guard)

NPM and PyPI installs are routed through the
[Takumi Guard](https://flatt.tech/takumi/features/guard) registry proxy,
which blocks known-malicious packages.

- NPM: `.npmrc` at the repo root sets `registry=https://npm.flatt.tech/`
- Python: `python/requirements.txt` (`--index-url`) and `python/pip.conf`
  point to `https://pypi.flatt.tech/simple/`
- CI: `.github/workflows/ci.yml` uses `flatt-security/setup-takumi-guard-npm@v1`
  (acquires a short-lived token via OIDC)

## Documentation

- Design spec: `docs/superpowers/specs/2026-04-24-puyo-simulator-design.md`
- MVP implementation plan: `docs/superpowers/plans/2026-04-24-puyo-mvp.md`

## Next phases

Phase 5-7: Python pre-training DQN
Phase 8: Deployment and polish

## Bundled software

- [ama](https://github.com/citrus610/ama) (MIT) by citrus610 — bundled as
  WebAssembly under the `ama (WASM)` AI option. License: `LICENSES/ama-MIT.txt`.

## Rebuilding ama WASM (optional)

The `public/wasm/ama.wasm` artifact is committed to this repo (the matching
emscripten glue is regenerated into `src/ai/wasm-ama/_glue/ama.js` and is
gitignored). To rebuild from source:

1. Install Emscripten: `brew install emscripten` (~5GB, 10-20 min)
2. Clone ama: `git clone https://github.com/citrus610/ama /path/to/ama`
3. Build: `AMA_REPO=/path/to/ama npm run build:ama-wasm`

## Tauri native app (macOS / Android)

A native desktop / mobile build using Tauri 2 + Rust FFI is available for
faster ama suggestions. The native app links the same ama beam search as a
static C++ library and reaches < 500ms / move on Intel Mac and Android arm64.

Measured on Intel Mac (Apple Clang -O3 -msse4.1 -mbmi2): mean ~57 ms /
suggestion in batch (Phase 5 full-sweep), 128 ms p99 in
single-process bench (Phase 6 Task 6.3). See
`docs/superpowers/progress/2026-04-29-ama-native-bench-results.md`.

### Prerequisites

- macOS: Xcode CLT, Rust stable, both `x86_64-apple-darwin` and
  `aarch64-apple-darwin` Rust targets
- Android (deferred): Android Studio + NDK r26+, Java 17, Rust Android targets

### Build ama static libraries

```bash
AMA_REPO=/path/to/ama \
  bash scripts/build-ama-native.sh --all-targets
# or, host only:
AMA_REPO=/path/to/ama npm run build:ama-native
```

### Run dev / build

```bash
npm run tauri:dev                         # macOS
npm run tauri:build                       # macOS .app + .dmg (universal)
# Android variants (npm run tauri:dev:android / tauri:build:android)
# require the deferred Android setup above.
```

### Native AI option in the UI

Inside the Tauri app, the AI selector exposes an `ama (Native) ⚡` option
(hidden in browsers / PWA where it isn't applicable). It bypasses the Web
Worker entirely and calls the C++ ama library through a Rust FFI command.

### Distribution

The default flow ships unsigned artifacts via GitHub Releases. macOS users
will need to right-click → Open the first time. Production / commercial
distribution requires Apple Developer Program ($99/yr) for macOS notarization
and Google Play ($25 one-time) for Android — see the design spec
(`docs/superpowers/specs/2026-04-27-ama-native-tauri-design.md`) for the full
flow.

## Intellectual property note

The product name and game terminology are placeholders. Before any commercial
distribution, **Sega/Compile holds the "ぷよぷよ"/Puyo trademark**; rebrand
the product name and any in-app glossary that uses "puyo"/"ぷよ" before
shipping. Game rules themselves are not copyrightable. See spec Section 9.2
for the full risk breakdown.
