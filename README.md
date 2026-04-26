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
