# Puyo Training Simulator

AIアドバイザ付きぷよぷよトレーニングWebアプリ(スマホ対応PWA)

## 状態

MVP(Phase 0-4 完了): ヒューリスティックAIによるアドバイス表示版。

## 開発

```
npm install
npm run dev      # 開発サーバ
npm run test     # 単体テスト
npm run e2e      # E2E スモークテスト
npm run build    # 本番ビルド
npm run lint     # Lint
```

## サプライチェーンセキュリティ (Takumi Guard)

NPM と PyPI のインストールを [Takumi Guard](https://flatt.tech/takumi/features/guard)
レジストリプロキシ経由にすることで、既知の悪性パッケージをブロックします。

- NPM: ルートの `.npmrc` で `registry=https://npm.flatt.tech/` を指定
- Python: `python/requirements.txt` の `--index-url` および `python/pip.conf`
  で `https://pypi.flatt.tech/simple/` を指定
- CI: `.github/workflows/ci.yml` で `flatt-security/setup-takumi-guard-npm@v1`
  を使用 (OIDC 経由で短命トークンを取得)

## ドキュメント

- 設計書: `docs/superpowers/specs/2026-04-24-puyo-simulator-design.md`
- MVP 実装計画: `docs/superpowers/plans/2026-04-24-puyo-mvp.md`

## 次のフェーズ

Phase 5-7: Python事前学習DQN
Phase 8: デプロイと仕上げ

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
