# Phase 5c-1: ama を教師とした蒸留学習 — 設計書

**作成日**: 2026-04-25
**前提文書**:
- `docs/superpowers/specs/2026-04-24-puyo-simulator-design.md`(全体設計)
- `docs/superpowers/specs/2026-04-24-phase5a-imitation-design.md`(5a 設計)
- `docs/superpowers/progress/2026-04-24-phase5a-run.md`(5a 実績)
- 5b spec(`2026-04-25-phase5b-mcts-az-design.md`)は将来参照、本フェーズでは保留

---

## 1. 目的

外部の強力な puyo AI **ama**(MIT、`/Users/yasumitsuomori/git/ama`、連鎖 7-9 級、SIMD bitfield + beam search + 形パターンマッチ)を教師にして、ML モデルを蒸留学習する。**ブラウザで ama の 80% 以上の強さを実現**することを目指す。将来的には RL で ama を超える(5c-2 以降)が、本フェーズはその起点となる「ama 模倣ベース」を確実に作る。

**5c-1 の Done(目標)**:
- 100 ゲーム評価で `ML(ama-distilled-v1)` が `ama` の **平均スコア比 ≥ 0.80**
- ML(ama-distilled-v1) vs Heuristic で **平均スコア比 ≥ 5.0**(現 5a が 1.86x なので大幅改善)
- ML(ama-distilled-v1) vs ML(policy-v1, 5a) で **平均スコア比 ≥ 2.5**
- ブラウザで AI セレクタが 3 択(Heuristic / ML v1 / ML ama-v1)に拡張、デフォルト = ama-v1
- 推論レイテンシ ≤ 50ms(モデル ~4MB のため、5a の 30ms から少し緩める)

---

## 2. 全体アーキテクチャ

```
┌──────────────────────────────────────────────────────────────────┐
│  ama (C++, /Users/yasumitsuomori/git/ama)                        │
│                                                                  │
│    既存: core/, ai/search/beam/, ai/ai.cpp(改変なし)            │
│    追加: tools/dump_selfplay.cpp(JSONL 吐き出しハーネス)        │
│    Makefile target: `make dump_selfplay`                         │
│    出力バイナリ: bin/dump_selfplay/dump_selfplay.exe              │
└──────────────────────────────┬───────────────────────────────────┘
                               │ JSONL ファイル
                               ▼
┌──────────────────────────────────────────────────────────────────┐
│  Python(Apple Silicon MPS で蒸留学習)                          │
│                                                                  │
│    python/puyo_train/                                            │
│      action.py(既存)                                            │
│      encoding.py(既存、queue ベクトル仕様は不変)                │
│      dataset_ama.py(新規: top-K soft target に対応)             │
│      model_v2.py(新規: ResNet 8 blocks × 64ch, ~1M params)      │
│      distill.py(新規: KL + MSE 損失で学習)                     │
│    python/train_ama.py(新規: エントリポイント)                  │
└──────────────────────────────┬───────────────────────────────────┘
                               │ TF.js GraphModel
                               ▼
┌──────────────────────────────────────────────────────────────────┐
│  ブラウザ                                                         │
│                                                                  │
│    public/models/policy-ama-v1/{model.json, *.bin}(commit)      │
│    src/ai/ml/ml-ai.ts: model URL を引数化                         │
│    src/ui/components/Header/Header.tsx: 3 択セレクタ              │
│    src/game/rng.ts: Puyo eSport 互換 queue 生成へ置換             │
└──────────────────────────────────────────────────────────────────┘
```

---

## 3. RNG 統一(Puyo eSport 互換)

### 3.1 動機

ama は **Puyo eSport の本物 RNG**(最初 2 ツモは 3 色限定 + 256 個の queue を 3 段シャッフル)を使う。我々の mulberry32 で生成する 4 色一様分布は **訓練と推論の状態分布をズラす**。本物のぷよぷよ訓練ツールとして RNG を本物に揃える。

### 3.2 移植

`src/game/rng.ts` の `randomPair` 系を Puyo eSport 互換の queue ベース実装に置換:

```ts
export interface Queue {
  next(): Pair; // 128 個の pre-computed queue を順に返す(cycle)
}

export function makeEsportQueue(seed: number): Queue {
  // ama/core/cell.h::create_queue を TS に port
  // - LCG: seed = (seed * 0x5D588B65 + 0x269EC3) & 0xFFFFFFFF
  // - rng() 5 回空回し
  // - 3-color / 4-color / 5-color の 3 つの 256 個 queue を 3 段シャッフル
  // - 4-color queue を採用、最初 4 個(2 ツモ)を 3-color queue で置換
  // - 128 ペアの array を返す(cycle で 128 ペア超えたら最初に戻る)
}
```

`createInitialState`, `spawnNext`(`src/game/state.ts`)は `Queue` インターフェースを使うように変更。`Pair` 型は変えない(色ラベル R/B/Y/P のまま)。

### 3.3 Python 側

`python/puyo_train/env_rng.py` を新規追加し、TS と完全同一の実装を提供。`game_spec.json` に「seed → 最初 5 ツモ」の cross-test を 5 ケース追加し、TS と Python で一致確認。

### 3.4 既存テストの再生成

- `src/game/__tests__/rng.test.ts`(あれば): seed→pair の期待値を新 RNG ベースに更新
- 5a の self-play で生成した `selfplay-20260424.jsonl` は **古い RNG ベース** だが、既に `policy-v1` 学習済みなので破棄。新 RNG では再生成不要(ama データに置換するため)
- `state.test.ts` などの seed 依存テストは pair 期待値を更新

### 3.5 色マッピング

ama: R / Y / G / B、ours: R / B / Y / P。蒸留時の対応:
- ama R ↔ ours R
- ama Y ↔ ours Y
- ama B ↔ ours B
- ama G ↔ ours P(Purple ↔ Green、見た目だけの label diff)

ハーネスの JSONL 出力では ours の色記号(R/B/Y/P)に変換して書く(Python 側を ama-naming を意識せずに済む)。

---

## 4. ama 側のハーネス

### 4.1 ファイル: `tools/dump_selfplay.cpp`

```cpp
// ama リポジトリに 1 ファイル追加(他は変更なし)
// - argv: --games N --seed S --weights ac/build/fast/freestyle
//          --out path/to/file.jsonl --topk 5
// - 各局面で beam::search_multi を呼び、Result.candidates の上位 K を取得
// - 1 行 1 局面の JSONL を吐く

// JSONL row schema:
{
  "game_id": int,
  "move_index": int,
  "field": [[col_chars]],         // 13×6 の "RBYP." で表現(ours の色)
  "current_axis": "R", "current_child": "B",
  "next1_axis": ..., "next1_child": ...,
  "next2_axis": ..., "next2_child": ...,
  "topk": [
    { "axisCol": 2, "rotation": 0, "score": 12345 },  // top-1
    { "axisCol": 3, "rotation": 0, "score": 11200 },  // top-2
    ...
  ],
  "final_score": int,
  "final_max_chain": int,
  "esport_seed": int               // ama の queue seed(再現用)
}
```

### 4.2 Makefile

`/Users/yasumitsuomori/git/ama/makefile` に target 追加:

```make
SRC_DUMP = core/*.cpp ai/*.cpp ai/search/*.cpp ai/search/beam/*.cpp

dump_selfplay: makedir
	@$(CXX) $(CXXFLAGS) $(SRC_DUMP) tools/dump_selfplay.cpp -o bin/dump_selfplay/dump_selfplay.exe
```

(Apple Silicon は PEXT 非対応なので `make dump_selfplay`(PEXT なし)で OK。SSE4 は Rosetta 必要かもしれず、必要なら `-arch x86_64` を加える)

### 4.3 並列化

- 1 プロセス = 1 ゲーム。Python 側で `subprocess.Popen` を 8 個並列に呼び、各々 `--games N/8 --seed seed_base+offset` を投げる
- 出力は別ファイルに分割し、後で concat
- 想定: 50k ゲーム / 8 並列 = 6,250 ゲーム/プロセス、ama beam ~10ms/move × 50 moves = 500ms/game = 1 時間/プロセス

### 4.4 色マッピング

ハーネス内で ama の `Type::RED → 'R'`, `YELLOW → 'Y'`, `GREEN → 'P'`(ours の Purple), `BLUE → 'B'` に変換して JSONL に書く。Python 側は ours のラベルだけを見る。

---

## 5. データ・教師ラベル

### 5.1 サンプル数

- 50,000 ゲーム × 平均 30-50 手 = **1.5M-2.5M サンプル**(ama は長く生き残るのでゲームが長い)
- ファイルサイズ目安: 1-2 GB JSONL(`.gitignore`)

### 5.2 Top-K(K=5)soft policy 分布

各サンプルで:
- ama が出した上位 5 手の `score` を取得
- これを 22 アクション分布に展開(top-5 のインデックスに softmax(score / temperature) を割り当て、残り 17 アクションは 0 確率)
- temperature: `T = (top1_score - top5_score) / 4` 程度の adaptive 設定にして「上位の差が小さい時は柔らかく、大きい時はシャープに」分布させる

```python
def make_soft_policy(topk_scores, topk_indices, temperature):
    p = np.zeros(22, dtype=np.float32)
    s = np.array(topk_scores, dtype=np.float32)
    # subtract max for numerical stability
    s = (s - s.max()) / max(temperature, 1e-3)
    e = np.exp(s)
    e /= e.sum()
    for idx, prob in zip(topk_indices, e):
        p[idx] = prob
    return p
```

### 5.3 value target

`value_target = tanh(final_score / 50000.0)`

5a は VALUE_SCALE=20000 だったが ama はより高い得点を取るので 50000 に。学習データの実分布で再調整可能。

### 5.4 訓練/検証分割

- 90% / 10%、`game_id` ベースで分割(同じゲームのサンプルは同じ split に)
- データリーク防止

---

## 6. モデル(model_v2)

### 6.1 アーキテクチャ

```
board [13,6,7]
  └─ Conv2d(7→64, 3×3, pad=1) + ReLU                                   # stem
  └─ ResBlock × 8:                                                      # body
       Conv2d(64→64, 3×3, pad=1) + BN + ReLU
       Conv2d(64→64, 3×3, pad=1) + BN
       skip add → ReLU
  └─ Flatten → [13*6*64 = 4992]

queue [16]
  └─ FC(16→32) + ReLU

concat → [5024]
  └─ FC(5024→128) + ReLU
       ├─ policy head: FC(128→22) logits
       └─ value head:  FC(128→1) tanh
```

- パラメータ数: ~1M
- TF.js 変換後: ~4MB(float32)

### 6.2 損失

```
L = L_policy + α * L_value + β * ||θ||²

L_policy = -Σ π_target(a) * log softmax(policy_logits)(a)        # KL に近い soft cross-entropy
L_value  = (value - value_target)²
α = 1.0, β = 1e-4
```

### 6.3 学習設定

- batch=256、Adam lr=1e-3 → cosine decay 30 epoch
- early stop: val_loss が 5 epoch 改善しなければ停止
- device: MPS(Apple Silicon)、CPU fallback
- 想定時間: 1-2 時間(5a の 30 分から増)
- ckpt: `python/checkpoints/policy-ama-v1.pt`

---

## 7. エクスポート

5a と同じ pipeline を再利用:

- PyTorch → ONNX(`torch.onnx.export` with `_NCHWExport` wrapper)
- ONNX → TF SavedModel(`onnx2tf -kat board -kat queue`)
- TF SavedModel → TF.js GraphModel(`tensorflowjs_converter`)
- 出力: `public/models/policy-ama-v1/{model.json, group1-shard1of1.bin}`(~4MB)

`python/puyo_train/export.py` の `export_full()` をそのまま使う(model クラスを引数化、または `--model-class` フラグで切替)。

---

## 8. ブラウザ統合

### 8.1 AI セレクタ拡張

`src/ui/components/Header/Header.tsx`:

```tsx
type Kind = 'heuristic' | 'ml-v1' | 'ml-ama-v1';
const STORAGE_KEY = 'puyo.ai.kind';
// デフォルトは 'ml-ama-v1'(新しい強い AI)
```

セレクタ表示:
- `Heuristic`
- `ML (policy-v1)` ※ 5a モデル、比較用
- `ML (ama-distilled-v1)` ※ デフォルト、強い

### 8.2 MlAI 改修

`src/ai/ml/ml-ai.ts`:

```ts
export class MlAI implements PuyoAI {
  constructor(private modelKind: 'v1' | 'ama-v1') {
    this.modelUrl = modelKind === 'v1'
      ? '/models/policy-v1/model.json'
      : '/models/policy-ama-v1/model.json';
  }
  // 以下 5a と同じ
}
```

`name` / `version` も `modelKind` で切替:
- `'v1'` → name: 'ml', version: 'policy-v1'
- `'ama-v1'` → name: 'ml', version: 'policy-ama-v1'

### 8.3 Worker 統合

`src/ai/worker/ai.worker.ts` の `set-ai` メッセージ kind を `'heuristic' | 'ml-v1' | 'ml-ama-v1'` に拡張。worker 内に `ml: { v1?: MlAI; amaV1?: MlAI }` の lazy-init マップを持つ。

---

## 9. 評価

### 9.1 スクリプト

`scripts/eval-ai.ts` を拡張(5a 既存):

```
# 3 通りの対戦を順次実行
npm run eval -- --a heuristic --b ml-ama-v1 --games 100
npm run eval -- --a ml-v1 --b ml-ama-v1 --games 100
npm run eval -- --a ml-ama-v1 --b ama --games 100   # ama は subprocess で
```

`ama` AI として ama バイナリを呼べるアダプタ `scripts/ama-ai-node.ts` を新規追加(stdin/stdout プロトコルで 1 手ずつ問い合わせ、または "this state → top-1 move" の単発呼出し)。

### 9.2 パリティ条件

| 比較 | 条件 |
| --- | --- |
| ML-ama-v1 vs Heuristic | 平均スコア比 ≥ 5.0 |
| ML-ama-v1 vs policy-v1 (5a) | 平均スコア比 ≥ 2.5 |
| ML-ama-v1 vs ama 本体 | 平均スコア比 ≥ 0.80(ama 同等の 80%) |
| 推論レイテンシ | ≤ 50ms |
| モデルサイズ | ≤ 5MB |

### 9.3 結果記録

`docs/superpowers/progress/2026-04-25-phase5c-1-run.md` に:
- 各対戦の平均スコア / 標準偏差 / max_chain 分布
- 推論レイテンシ計測(P50, P95)
- モデルサイズ
- ヒントになりそうな失敗ケース(ama 圧勝の seed をピックアップ、原因考察)

---

## 10. ディレクトリ構成(差分)

```
ama/(/Users/yasumitsuomori/git/ama)
└─ tools/
   └─ dump_selfplay.cpp           # 新規: ama リポに追加

puyo-mvp/
├─ src/
│  ├─ game/
│  │  └─ rng.ts                   # 修正: Puyo eSport 互換 queue
│  ├─ ai/ml/
│  │  ├─ ml-ai.ts                 # 修正: modelKind 引数化
│  │  └─ __tests__/
│  └─ ui/components/Header/
│     └─ Header.tsx               # 修正: 3 択
├─ scripts/
│  ├─ ama-selfplay.ts             # 新規: ama subprocess 並列実行ラッパ
│  ├─ ama-ai-node.ts              # 新規: 評価用 ama アダプタ
│  └─ eval-ai.ts                  # 修正: ama 対戦サポート
├─ python/
│  ├─ puyo_train/
│  │  ├─ dataset_ama.py           # 新規: top-K soft target Dataset
│  │  ├─ model_v2.py              # 新規: ResNet
│  │  ├─ distill.py               # 新規: 蒸留学習ループ
│  │  └─ env_rng.py               # 新規: Puyo eSport 互換 RNG
│  ├─ train_ama.py                # 新規: エントリ
│  └─ tests/
│     ├─ test_dataset_ama.py
│     ├─ test_model_v2.py
│     ├─ test_env_rng.py
│     └─ test_distill_smoke.py
├─ public/models/
│  ├─ policy-v1/                  # 既存(5a モデル、残置)
│  └─ policy-ama-v1/               # 新規: ama 蒸留モデル
└─ data/ama-selfplay/              # 新規(.gitignore)
```

---

## 11. 実装フェーズ

5c-1 を 5 ステップで分割、各ステップ独立検証可能:

| ステップ | 内容 | 期間 |
| --- | --- | --- |
| 5c-1-A | RNG 切替(Puyo eSport 互換)、TS+Python 整合確認、5a 既存テスト更新 | 1-2 日 |
| 5c-1-B | ama 側ハーネス追加(`tools/dump_selfplay.cpp`)、ローカルビルド・smoke run | 1-2 日 |
| 5c-1-C | Python 側 dataset_ama / model_v2 / distill 実装、smoke train(ミニデータで動作確認) | 1-2 日 |
| 5c-1-D | 本番 self-play(50k ゲーム)+ 蒸留学習(1-2h) + エクスポート | 半日 |
| 5c-1-E | ブラウザ統合(セレクタ 3 択、MlAI 改修) + eval スクリプト + 結果記録 | 1-2 日 |

合計 **5-9 日**。

---

## 12. リスクと緩和

| リスク | 緩和 |
| --- | --- |
| ama を Apple Silicon でビルド失敗(SSE4 / PEXT 依存) | `-arch x86_64` で Rosetta、PEXT は OFF。最悪は Linux Docker でビルド+run |
| Puyo eSport RNG 移植バグ | `game_spec.json` に「seed → 最初 5 ツモ」5 ケース追加、TS+Python 両側で一致テスト |
| ama subprocess 呼出しが遅い | 1 ゲーム / 1 プロセスで並列、stdin/stdout プロトコルではなく一括 JSONL 出力 |
| 1M params で ama を再現しきれない | 結果見て top-1 一致率 < 30% なら model_v2 を 12 blocks × 96ch に拡大、再蒸留 |
| ama の出す手の質がばらつく(temperature 効果) | top-5 を採用、soft label で柔らかく学習 |
| TF.js 4MB の推論が 50ms を超える | WebGL backend 確認、超えたら 8→6 ブロックに縮小 |
| ama の `ai/ai.cpp`(Enemy reading)が 1P 用にチューニングされてない | 1P モードは `beam::search_multi` 直呼び出しで足りる(ai.cpp は PvP 用)、ハーネスでは ai.cpp を使わず beam 直叩き |
| 既存 `policy-v1`(5a)が新 RNG で挙動変わる | 既存ブラウザでは新 RNG だが ML-v1 推論は state ベースなので影響なし。eval も新 RNG ベースで再測定すれば一貫 |

---

## 13. スコープ外(本フェーズで扱わない)

- ama を WebAssembly 化してブラウザ直積載(別検討、5c-2 や別フェーズで)
- ama を Python ctypes で呼ぶネイティブバインディング(subprocess で十分)
- AlphaZero / MCTS による self-improvement(5c-2 で扱う、ama 蒸留が起点)
- ama の eval breakdown を auxiliary head で学習(5c-2 で再評価)
- モバイル特化のさらなる蒸留(現状 4MB で許容範囲)

---

## 14. 未決事項

なし。実装段階の細部(temperature の具体値、batch size 微調整、ama 並列度)は 5c-1-C / D の実装ノートに残す。
