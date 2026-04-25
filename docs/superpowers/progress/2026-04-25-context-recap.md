# Puyo Simulator — Context Recap (2026-04-25)

post-compact 後でも続きが即再開できるよう、現時点までの全体像と次のフェーズ(C 案 = ama WASM 化)へのブリッジを残す。

---

## 1. ブランチ / コミット状況

- worktree: `.worktrees/puyo-mvp`
- branch: `feature/puyo-mvp`(origin に push 済み、`d8f6e80`)
- main 未マージ(全機能はこのブランチ上)
- ama リポ: `/Users/yasumitsuomori/git/ama` 別 repo、main に `tools/dump_selfplay.cpp` 追加コミット(`f015a20`)
- テスト: 22 ファイル / 109 TS テスト passing、Python 13 テスト passing、tsc clean

## 2. これまでに通ったフェーズ

### Phase 0-3: MVP(完了)

- 6×13 puyo、22 離散アクション、beam search ヒューリスティック AI、Canvas + React + Zustand UI、PWA
- spec: `docs/superpowers/specs/2026-04-24-puyo-simulator-design.md`
- 状態保持(undo 100手)、3-phase 連鎖アニメ、跨ぎ禁止 (reachability BFS)、ML 拡張用の PuyoAI plugin

### Phase 5a: 模倣学習(完了)

- spec: `docs/superpowers/specs/2026-04-24-phase5a-imitation-design.md`
- plan: `docs/superpowers/plans/2026-04-24-phase5a-imitation.md`
- self-play 5000 ゲーム → 163k samples → 蒸留学習 → `policy-v1`(381k params, 1.5MB)
- 結果: avg score 2,443 / Heuristic 比 1.86x(`docs/superpowers/progress/2026-04-24-phase5a-run.md`)

### Phase 5b: AlphaZero(spec のみ、保留)

- spec: `docs/superpowers/specs/2026-04-25-phase5b-mcts-az-design.md`
- 「目標 7-8 連鎖、Colab Pro+ で 1-2 ヶ月」設計したが「時間かかりすぎ」で保留
- 将来 RL に進むときに参照

### Phase 5c-1: ama 蒸留(完了、ama 級は未達)

- spec: `docs/superpowers/specs/2026-04-25-phase5c-1-ama-distillation-design.md`
- plan: `docs/superpowers/plans/2026-04-25-phase5c-1-ama-distillation.md`
- run report: `docs/superpowers/progress/2026-04-25-phase5c-1-run.md`
- ama を教師に top-K soft policy + value 蒸留
- self-play 1,047 games / 43,801 samples(worker SIGKILL で 100k 目標未達)
- model_v2 = ResNet 8 blocks × 64ch、1.24M params、4.8MB
- 結果: vs Heuristic 8.27x ✅ / vs ml-v1 1.37x ❌ / vs ama 0.7% ❌
- 学び: **蒸留路線単独で ama 級(13 連鎖)は届かない**。原因は教師の探索深度 + 形パターン認識の総合 = 単純な policy net で再現困難

## 3. 主要ファイルと責務

### TypeScript / ブラウザ

| Path | 役割 |
| --- | --- |
| `src/game/rng.ts` | Puyo eSport 互換 queue(LCG + 3 段シャッフル + 256-pair の mode 1 採用) |
| `src/game/types.ts` | `GameState.queueIndex` を持つ |
| `src/game/state.ts` | `getEsportQueue(seed)` から取り出し、`spawnNext` で `queueIndex` 進行 |
| `src/game/action.ts` | 22 離散アクション ↔ Move 変換、`legalActionMask`(reachability) |
| `src/ai/ml/encoding.ts` | `[13, 6, 7]` NHWC + `[16]` queue ベクトル |
| `src/ai/ml/ml-ai.ts` | `MlAI(modelKind: 'v1' \| 'ama-v1')` で URL 切替 |
| `src/ai/worker/ai.worker.ts` | `set-ai` で 3 種(heuristic / ml-v1 / ml-ama-v1)切替 |
| `src/ui/components/Header/Header.tsx` | 3 択セレクタ、デフォルト `ml-ama-v1`、localStorage 保存 |
| `src/ui/hooks/useAiSuggestion.ts` | シングルトン Worker、`setAiKind(kind)` を export |
| `src/shared/specs/{action,encoding,rng}_spec.json` | TS ↔ Python cross-test fixtures |
| `scripts/selfplay.ts` | 旧:Heuristic self-play(残置、現状未使用) |
| `scripts/ama-selfplay.ts` | ama subprocess 並列 self-play、`--early-stop-chain` 対応 |
| `scripts/eval-ai.ts` | 4-way 対戦(heuristic / ml-v1 / ml-ama-v1 / ama) |
| `scripts/ml-ai-node.ts` | tfjs-node 経由 PuyoAI(評価用、Node 24 polyfill 含む) |
| `scripts/tsx-register.mjs` | Worker thread に tsx loader を install するブートストラップ |

### Python

| Path | 役割 |
| --- | --- |
| `python/puyo_train/action.py` | TS と同仕様の 22 action |
| `python/puyo_train/encoding.py` | TS と同仕様の board/queue tensor |
| `python/puyo_train/env_rng.py` | Puyo eSport 互換 queue(TS と完全一致、cross-test 5 ケース) |
| `python/puyo_train/dataset.py` | 旧 5a 用 SelfPlayDataset(残置) |
| `python/puyo_train/dataset_ama.py` | top-K soft policy 対応の AmaDataset、JSON 破損行スキップ |
| `python/puyo_train/model.py` | 5a の小モデル PolicyValueNet(381k params) |
| `python/puyo_train/model_v2.py` | 5c-1 の中モデル PolicyValueNetV2(ResNet 8x64, 1.24M params) |
| `python/puyo_train/distill.py` | 蒸留学習ループ(soft cross-entropy + MSE + cosine lr) |
| `python/puyo_train/export.py` | `_NCHWExport` で onnx2tf を NHWC 維持、`_detect_model_cls` で v1/v2 自動判定 |
| `python/train.py` | 旧 5a の hard label 学習(残置) |
| `python/train_ama.py` | 5c-1 蒸留学習エントリ |

### ama リポジトリ(別 repo)

- `/Users/yasumitsuomori/git/ama` (MIT, citrus610)
- 追加: `tools/dump_selfplay.cpp` JSONL 出力ハーネス
- 追加: `makefile` に `dump_selfplay` target
- 修正: `ai/search/beam/form.h` で `_countof` → `std::size`(macOS clang 対応)
- ビルド: `make dump_selfplay` で `bin/dump_selfplay/dump_selfplay.exe`(Apple Silicon native OK)
- CLI: `--games N --seed S --weights {build|ac|fast|freestyle} --out file.jsonl --topk 5 --early-stop-chain N`

### モデル成果物

| Path | サイズ | 用途 |
| --- | --- | --- |
| `public/models/policy-v1/` | 1.5MB | 5a 模倣学習(Heuristic 比 1.86x) |
| `public/models/policy-ama-v1/` | 4.8MB | 5c-1 ama 蒸留(Heuristic 比 8.27x、5a 比 1.37x、ama の 0.7%) |
| `python/checkpoints/policy-v1.pt` | 1.5MB | gitignored |
| `python/checkpoints/policy-ama-v1.pt` | 4.8MB | gitignored |

## 4. 重要な定数 / 規約

### 色マッピング(ours と ama)

- ours: `R, B, Y, P`(R=Red, B=Blue, Y=Yellow, P=Purple)
- ama: `RED, YELLOW, GREEN, BLUE`(0..3)
- マップ: ama R↔ours R / ama Y↔ours Y / ama G↔ours P / ama B↔ours B
- 実装: `tools/dump_selfplay.cpp` の `to_ours_char()`、TS 側 `rng.ts` の `COLOR_MAP = ['R','Y','P','B']`(ama 0..3 順)

### Action index(22 離散)

- index 0..5: rotation=0, axisCol=0..5(child 軸の上)
- index 6..11: rotation=2, axisCol=0..5(child 軸の下)
- index 12..16: rotation=1, axisCol=0..4(child 右)
- index 17..21: rotation=3, axisCol=1..5(child 左)

### state encoding [13, 6, 7]

- ch 0..3: 色の存在マップ R/B/Y/P
- ch 4: 空マスマップ
- ch 5: 現ツモ軸色 / 3.0 ブロードキャスト
- ch 6: 現ツモ子色 / 3.0 ブロードキャスト

### RNG (Puyo eSport 互換)

- LCG: `seed = (seed * 0x5D588B65 + 0x269EC3) & 0xFFFFFFFF`
- 5 回空回し
- 3 つの 256 個 queue (3/4/5 色)、3 段シャッフル(15×8 shift28、7×16 shift27、3×32 shift26)
- mode 1 と 2 の最初 4 マスを mode 0 で置換(最初 2 ペア = 3 色限定)
- 採用: mode 1(4 色)、128 ペアに整形

### 学習ハイパーパラメータ(5c-1)

- model: PolicyValueNetV2 (ResNet 8 × 64ch, ~1.24M params)
- loss: soft cross-entropy(KL with ama top-5 distribution) + MSE(value)
- value target: `tanh(final_score / 50000)`
- temperature: 100(top-5 score を分布化)
- optimizer: Adam lr=1e-3 wd=1e-4 + cosine decay 30 epoch
- batch 256、val_fraction 0.1、device MPS
- 過学習が早期(epoch 5-6)で発生 → best_val checkpoint で対応

### eval 計測

- `npm run eval -- --games 100 --seed 1 --a {kind} --b {kind}`
- kind: `heuristic | ml-v1 | ml-ama-v1 | ama`(ama は subprocess)
- ama 100 ゲームは 80 分前後(beam width=250 depth=16、game-over しないので 200 手 × 50ms × 100 = 800 秒近く)

## 5. 詰まりどころと対策(運用ノウハウ)

### tsx + Node.js worker_threads

- Node 24 で tsx の loader が worker_threads に inheritしない
- 解決: `scripts/tsx-register.mjs` で `register()` を call、Worker の `execArgv: ['--import', './scripts/tsx-register.mjs']`

### tfjs-node + Node 24

- `util.isNullOrUndefined` が削除されて tfjs-node 4.22 が import 失敗
- 解決: `scripts/ml-ai-node.ts` 先頭で `require('util')` 経由に polyfill 注入

### onnx2tf vs PyTorch NHWC permute

- PyTorch forward が `permute(0,3,1,2)` で NHWC→NCHW すると、onnx2tf の最適化で TF.js 入力 shape が `[B, 6, 7, 13]` に化ける
- 解決: `_NCHWExport` ラッパで NCHW 直入力 ONNX を生成 → onnx2tf が自然な NHWC `[B, 13, 6, 7]` を保持

### onnx 1.19 vs ml_dtypes 0.3.2

- 新 onnx が `ml_dtypes.float4_e2m1fn` 要求、TF が ml_dtypes 0.3.2 に固定
- 解決: `requirements.txt` に `onnx<1.19` を pin

### setuptools 81+ で pkg_resources 削除

- `tensorflowjs` 内部が pkg_resources 要求
- 解決: `setuptools<81` を venv に pin

### onnx2tf 周辺パッケージ

- `onnx_graphsurgeon`, `psutil`, `ai-edge-litert` を追加 install 必要(requirements には未記載 → 必要なら追加すべき)

### ama Apple Silicon ビルド

- `_countof` (MSVC マクロ)が macOS clang で見つからない → `std::size` に置換
- `-msse4 -mbmi2 -march=native` は Apple Silicon clang で no-op として通る、Rosetta 不要
- PEXT は無効でも OK

### ama beam 速度

- default `width=250 depth=16` で 1 手 ~250ms。200 手 game-over しない → 1 ゲーム 50 秒
- 5000 ゲーム / 8 並列 ≈ 87 時間(SIGKILL 等で完走しない)
- 対策: `--early-stop-chain N` で N+ 連鎖発火時に終了 → ゲーム長 200→42 手平均

### oversubscription

- ama `search_multi` 内部 5 thread × 2 process = 10 threads → CPU 競合で 1.5x しか速くならない(理論 2x)
- M1 8 コアで 2 並列が現実最適

## 6. 次のフェーズ:C 案(ama WASM 化)

### 目的

ama 本体(C++ + SSE4 + 形パターン + beam search)を WebAssembly に変換し、ブラウザで **ama 級の強さを直接体験できる** AI モードとして提供する。蒸留した ml-ama-v1 と並列に共存(セレクタで切替)。

### 想定構成

- `Heuristic`(現状)
- `ML (policy-v1)`(5a、軽量)
- `ML (ama-distilled-v1)`(5c-1、中)
- **`Ama (WASM)`(新、強)**

### 技術検討ポイント(brainstorming で詰める)

- Emscripten で `core/ + ai/` をビルド
  - ama は SSE4 / BMI2 を使う → WASM SIMD への移植が必要(Emscripten の `-msimd128`)
  - PEXT は WASM SIMD に直接ない、`_pext_u32/u64` の polyfill が要る(softemu)
  - ファイルサイズ: C++20 + テンプレート + SIMD intrinsics で、WASM サイズは 2-5MB 想定
- JS バインディング設計
  - input: 盤面 + tsumo queue、output: 22-action のスコア配列(または top-1 placement)
  - メモリレイアウト: ama Field の bitfield をコピー or share(JS Uint8Array → Wasm linear memory)
  - 1 手あたりレイテンシ目標: ブラウザで < 200ms(beam depth=16 width=250 のまま)
- レジューム性
  - WASM module は IndexedDB キャッシュ
  - 初回ロード時の進捗バー(2-5MB なら ~1-3 秒)
- ライセンス
  - ama は MIT、クレジット表記必要(About 画面 or ヘッダ)

### 想定実装ステップ

1. ama を Emscripten でビルドできるようにする(SSE4 → WASM SIMD 移植、PEXT polyfill)
2. JS バインディング層を `tools/wasm_api.cpp` のような形で追加(現 dump_selfplay.cpp とは別)
3. ブラウザ側 `src/ai/wasm-ama/wasm-ama-ai.ts` 実装(`PuyoAI` 準拠)
4. Worker に kind `ama-wasm` 追加、Header セレクタに 4 択目
5. eval-ai.ts に WASM AI 実装も追加(Node でも WASM 実行可能)
6. パフォーマンス計測(レイテンシ、サイズ、PvP モード対応の有無)

### 期待値

- WASM 推論レイテンシ: 1 手 100-300ms(ブラウザ WASM SIMD で C++ ネイティブの 1.5-2x 遅程度)
- 強さ: ama ネイティブと完全互換(蒸留と違って情報損失なし)
- ファイルサイズ: 2-5MB(蒸留モデルと同オーダー、許容)

### リスク

- SSE4 → WASM SIMD への置換が ama の SIMD 多用箇所(field.cpp, fieldbit.cpp)で広範
- PEXT は polyfill が遅く、ama の chain detection が beam search 性能を律速する可能性
- Apple Silicon でクロスコンパイル設定が複雑(Emscripten + clang)
- ama 上流のメンテと差分が広がる(fork 分岐管理)

## 7. 推奨フロー

C 案を進める前に brainstorming で:

1. WASM ビルドの最小再現確認(まず `core/` だけビルドできるか試す)
2. SIMD 戦略決定:
   - 全面 WASM SIMD 移植(時間かかる、性能良い)
   - or `-mno-sse4 -DUSE_SCALAR_FALLBACK` 的なフラグでスカラー版 build(早い、性能 2-5x 落ちる)
3. JS バインディング API 設計(suggest 単発 vs バッチ)
4. ブラウザ統合の UX(初回ロード進捗、IndexedDB キャッシュ)
5. eval-ai での測定方法(WASM AI を Node でも回せるか)

C 案の spec → plan → 実装は 5-10 日想定。

## 8. 参考リンク / 内部ファイル

- 全体設計: `docs/superpowers/specs/2026-04-24-puyo-simulator-design.md`
- 5a spec: `docs/superpowers/specs/2026-04-24-phase5a-imitation-design.md`
- 5b spec(将来): `docs/superpowers/specs/2026-04-25-phase5b-mcts-az-design.md`
- 5c-1 spec: `docs/superpowers/specs/2026-04-25-phase5c-1-ama-distillation-design.md`
- 5a plan: `docs/superpowers/plans/2026-04-24-phase5a-imitation.md`
- 5c-1 plan: `docs/superpowers/plans/2026-04-25-phase5c-1-ama-distillation.md`
- 5a run: `docs/superpowers/progress/2026-04-24-phase5a-run.md`
- 5c-1 run: `docs/superpowers/progress/2026-04-25-phase5c-1-run.md`
- ama: `/Users/yasumitsuomori/git/ama`(別 repo, MIT)

## 9. 次のセッションで最初にやること

1. このメモを読む
2. `git log --oneline -10` で最新状態確認
3. brainstorming スキルで C 案(ama WASM)の設計に入る
4. Emscripten 環境確認(`brew install emscripten` 済みか?)
