# Phase 5a: ヒューリスティック模倣学習による Policy/Value ネット — 設計書

**作成日**: 2026-04-24
**対象ブランチ**: `feature/puyo-mvp`(後続の実装は新ブランチで)
**前提文書**:
- `docs/superpowers/specs/2026-04-24-puyo-simulator-design.md`(全体設計)
- `docs/superpowers/progress/2026-04-24-mvp-state.md`(MVP 現状)

---

## 1. 目的

現行のヒューリスティック AI(ビームサーチ depth=4, width=10)の判断を模倣する小さな Policy/Value ネットを学習し、TF.js に変換してブラウザで動かす。これにより:

- 推論がヒューリスティックより高速になる(目標 < 30ms/call)
- 将来の Phase 5b(MCTS + 自己強化)の土台(policy/value ヘッドと入出力仕様)が固まる

**5a のゴール(Done の定義)**: ML 側が平均スコアでヒューリスティックの 95% 以上、Top-1 一致率 70% 以上を達成し、ブラウザで Heuristic と切替可能に見える形で動く。

---

## 2. 全体アーキテクチャ

```
┌──────────────────────────────────────────────────────────────────┐
│  Node.js (既存 TS ゲームロジック再利用)                          │
│                                                                  │
│    scripts/selfplay.ts  ── 現行 HeuristicAI で自己対戦            │
│         │                                                        │
│         ▼                                                        │
│    data/selfplay/*.jsonl  (盤面 + 教師手 + 最終スコア)            │
└──────────────────────────────┬───────────────────────────────────┘
                               │ JSONL ファイル渡し
                               ▼
┌──────────────────────────────────────────────────────────────────┐
│  Python (PyTorch, Apple Silicon MPS)                             │
│                                                                  │
│    python/train.py         ── policy + value 学習                │
│    python/dataset.py       ── JSONL ロード、tensor 化             │
│    python/model.py         ── CNN + FC デュアルヘッドモデル        │
│    python/export_tfjs.py   ── PyTorch → ONNX → TF.js              │
│         │                                                        │
│         ▼                                                        │
│    public/models/policy-v1/{model.json, *.bin}                   │
└──────────────────────────────┬───────────────────────────────────┘
                               │ static asset
                               ▼
┌──────────────────────────────────────────────────────────────────┐
│  ブラウザ(既存 React + Zustand + Web Worker)                    │
│                                                                  │
│    src/ai/ml/ml-ai.ts       ── PuyoAI 実装(TF.js 推論)           │
│    src/ai/worker/ai.worker.ts── MlAI / HeuristicAI 切替           │
│    src/ui/components/Header ── AI セレクタ(Heuristic / ML)      │
└──────────────────────────────────────────────────────────────────┘
```

---

## 3. データパイプライン

### 3.1 自己対戦(Node.js)

**場所**: `scripts/selfplay.ts`(既存 TS 資産再利用)

- 教師 = 現行 `HeuristicAI`(ビームサーチ depth=4, width=10)をそのまま使う
- `createInitialState(seed)` から始め、`HeuristicAI.suggest()` の top-1 手を `commitMove` で適用。ゲームオーバーまで
- `worker_threads` で 8 並列、各 worker が独立ゲームを回す
- 1 ゲーム平均 50 手想定 → **5,000 ゲームで約 25 万サンプル**
- 想定所要時間: 8 コアで 3-4 時間

### 3.2 JSONL スキーマ

各行 = 1 局面 = 1 サンプル。

```json
{
  "seed": 123456789,
  "game_id": 42,
  "move_index": 17,
  "field": [["R","B",null,...],...],
  "current_axis": "R",
  "current_child": "B",
  "next1_axis": "Y", "next1_child": "P",
  "next2_axis": "R", "next2_child": "R",
  "teacher_move": { "axisCol": 2, "rotation": 0 },
  "teacher_action_index": 8,
  "final_score": 18240,
  "final_max_chain": 4
}
```

- `field`: `ROWS × COLS` の 2 次元配列、各セルは `"R"|"B"|"Y"|"P"|null`
- `teacher_action_index`: 22 離散アクションのインデックス(`moveToActionIndex()`)
- `final_score`: そのゲームの最終合計スコア。value head の教師に使う
- `final_max_chain`: 参考情報(評価分析用、学習には使わない)

**保存先**: `data/selfplay/YYYYMMDD-HHmm-{seed}.jsonl`(`.gitignore` 対象)

### 3.3 アクション空間

既存仕様を踏襲:

- 22 アクション = {6 列 × 縦 2 方向} + {5 列 × 横 2 方向}
- `src/game/action.ts` に `moveToActionIndex(move)` / `actionIndexToMove(index)` を追加(Python 側と整合する SSOT 実装)

---

## 4. モデル

### 4.1 入力エンコーディング

**盤面テンソル** `board: [13, 6, 7]`:

| チャンネル | 内容                           |
| ---------- | ------------------------------ |
| 0-3        | R / B / Y / P の存在マップ     |
| 4          | 空マスマップ                   |
| 5          | 現ツモ軸色のブロードキャスト   |
| 6          | 現ツモ子色のブロードキャスト   |

**ツモ系ベクトル** `queue: [16]`:

- NEXT 軸 one-hot(4) + NEXT 子 one-hot(4) + NEXT-NEXT 軸(4) + NEXT-NEXT 子(4)

**合法手マスク** `legal_mask: [22]`:

- 到達可能な手は 1、不可は 0(`reachableTargets` ベース)
- 推論時はロジットに `legal_mask == 0 → -inf` を加えて softmax

### 4.2 ネットワーク

```
board [13,6,7]
  └─ Conv2d(7→32, 3×3, pad=1) + ReLU
  └─ Conv2d(32→64, 3×3, pad=1) + ReLU
  └─ Conv2d(64→64, 3×3, pad=1) + ReLU
  └─ Flatten → [13*6*64 = 4992]

queue [16]
  └─ FC(16→32) + ReLU

concat → [5024]
  └─ FC(5024→128) + ReLU
      ├─ policy head: FC(128→22)   logits
      └─ value head:  FC(128→1)    tanh
```

- パラメータ数: 約 150k
- TF.js 変換後ファイルサイズ目安: 約 600KB

### 4.3 損失

```
L = L_policy + α * L_value
  L_policy = CrossEntropy(policy_logits, teacher_action_index)
  L_value  = MSE(value_pred, value_target)
  α = 1.0 (初期値、後で調整)
```

**value_target の定義**: `tanh(final_score / VALUE_SCALE)`、`VALUE_SCALE = 20000`
(全ゲームスコアを -1〜+1 に押し込める。初期データの実観測中央値から決める)

---

## 5. 学習

### 5.1 環境

- Python 3.11+、PyTorch 2.x、device = `mps`(Apple Silicon)fallback `cpu`
- 依存: `torch torchvision numpy tqdm onnx tensorflowjs`
- `python/requirements.txt` で固定
- `python/pyproject.toml` で lint/format(ruff)

### 5.2 学習ループ

- バッチサイズ 256
- Optimizer: Adam lr=1e-3, weight_decay=1e-4
- Epoch: 30(5 回 ES で打ち切り可)
- 訓練/検証分割: 90% / 10%(seed 単位で分割してデータリーク防止)
- 評価指標: policy top-1 accuracy、value MSE
- 保存: `python/checkpoints/policy-v{N}.pt`(best val loss)

### 5.3 コマンド

```
python python/train.py \
  --data data/selfplay \
  --out python/checkpoints/policy-v1.pt \
  --epochs 30 --batch 256 --device mps
```

---

## 6. エクスポート(PyTorch → TF.js)

- `python/export_tfjs.py` が以下を実行:
  1. `policy-vN.pt` を読込、ダミー入力で `torch.onnx.export` → `policy-vN.onnx`
  2. `tensorflowjs_converter --input_format=onnx` で TF.js 化
  3. 出力: `public/models/policy-v1/{model.json, group1-shard1of1.bin}`
- サイズ目標: 2MB 未満。超えたら git-lfs 導入を検討

---

## 7. ブラウザ統合

### 7.1 MlAI 実装

`src/ai/ml/ml-ai.ts`:

```ts
export class MlAI implements PuyoAI {
  private model: tf.GraphModel | null = null;
  async load(): Promise<void> {
    this.model = await tf.loadGraphModel('/models/policy-v1/model.json');
  }
  suggest(state: GameState, topK: number): Suggestion[] {
    const { board, queue, mask } = encode(state);
    const [policyLogits, value] = this.model.predict([board, queue]) as tf.Tensor[];
    const masked = applyLegalMask(policyLogits, mask);
    const probs = tf.softmax(masked);
    return topKFromProbs(probs, topK, value);
  }
}
```

- `tfjs-backend-webgl` を優先、失敗時 `tfjs-backend-cpu` にフォールバック
- モデルは Worker 内で一度だけロードしキャッシュ
- 初回推論で JIT コンパイルが走るので、ロード直後に 1 回ダミー推論でウォームアップ

### 7.2 Web Worker

`src/ai/worker/ai.worker.ts`:

- メッセージ `{ type: 'set-ai', kind: 'heuristic' | 'ml' }` を追加
- 起動時デフォルト: `heuristic`(モデル未ロードでも動くため)
- `set-ai` で ML に切替時、非同期で `MlAI.load()` し、完了後から ML 応答を返す

### 7.3 UI(AI セレクタ)

- 場所: `src/ui/components/Header/Header.tsx`(新規)または `Controls` 拡張
- UI: `<select>` で `Heuristic` / `ML (v1)` を選択
- 保存: localStorage `puyo.ai.kind`。起動時に復元
- ML 未学習の時代は `<option disabled>` で見せておき、モデルが存在すれば有効化

### 7.4 候補リストの順位付け

- 生の policy 確率順で上位 K 手を候補に
- `reason` 表示: `p=0.42, v=+0.31` のように policy/value 両方を見せる(テキスト1行)
- **5b ではない**: MCTS を乗せた評価は Phase 5b で。5a はあくまで policy 直出力

---

## 8. 評価

### 8.1 自動評価スクリプト

`scripts/eval-ai.ts`:

```
npm run eval -- --a heuristic --b ml --games 100 --seed 1
```

- 同じ seed から両 AI に別々にプレイさせ、最終スコアの平均・標準偏差を比較
- 出力指標:
  - `avg_score_a`, `avg_score_b`, `avg_ratio = avg_b / avg_a`
  - `top1_match_rate`(同局面で A と B が選ぶ手の一致率)
  - `avg_max_chain_a / b`

### 8.2 パリティ条件(5a Done)

| 指標                   | 閾値                         |
| ---------------------- | ---------------------------- |
| 平均スコア比 ML/H       | ≥ 0.95                       |
| Top-1 一致率           | ≥ 0.70                       |
| ブラウザ推論レイテンシ | ≤ 30ms/call(Web Worker 上)  |
| モデルファイルサイズ   | ≤ 2MB                        |

満たさない場合の対応:
1. データ量を倍に(10,000 ゲーム)
2. CNN 幅を 32→64→64 から 48→96→96 に
3. 学習率/エポック数調整

---

## 9. ディレクトリ構成(差分)

```
puyo-simulator/
├─ src/
│  ├─ game/
│  │   └─ action.ts              (新規: moveToActionIndex)
│  └─ ai/
│      ├─ ml/
│      │   ├─ ml-ai.ts           (新規)
│      │   └─ encoding.ts        (新規: state → tensors)
│      └─ worker/ai.worker.ts    (更新)
├─ scripts/
│  ├─ selfplay.ts                (新規)
│  └─ eval-ai.ts                 (新規)
├─ python/
│  ├─ train.py
│  ├─ dataset.py
│  ├─ model.py
│  ├─ export_tfjs.py
│  ├─ encoding.py                (TS と同じ仕様のエンコーダ)
│  ├─ action.py                  (TS と同じ moveToActionIndex)
│  ├─ tests/test_encoding.py
│  ├─ tests/test_action.py
│  ├─ requirements.txt
│  └─ pyproject.toml
├─ data/
│  └─ selfplay/                  (.gitignore)
├─ public/
│  └─ models/
│      └─ policy-v1/
│          ├─ model.json
│          └─ group1-shard1of1.bin
└─ docs/superpowers/
    └─ specs/2026-04-24-phase5a-imitation-design.md  (本書)
```

---

## 10. TS ↔ Python 整合性

- `src/game/action.ts` と `python/action.py` の挙動が一致することを cross-test で保証
- 具体策: TS 側で固定シードから生成した「盤面 + 期待アクションインデックス」のテストケースを `src/shared/specs/action_spec.json` に書き出し、Python 側で同 JSON を読み同じアクションインデックスが出ることを `pytest` で検証
- 同様のことを state encoding(`encoding.ts` vs `encoding.py`)でも行う

---

## 11. テスト

### TS 側

- `action.test.ts`: 既存 22 手の双方向変換(move ↔ index)
- `encoding.test.ts`: 空盤面・1手打った盤面を tensor 化し shape と特定セルの値を確認
- `ml-ai.test.ts`: ダミー TF.js モデル(恒等関数に近いもの)で `suggest()` が spec 通り動くか
- `selfplay.integration.test.ts`: 小規模 3 ゲームで JSONL が出ること、各行が schema を満たすこと

### Python 側

- `test_encoding.py`: TS と同じ仕様の board/queue tensor 生成、shape 検証
- `test_action.py`: TS と同じ 22 手変換
- `test_model.py`: forward pass で shape が期待通り、損失が有限
- `test_dataset.py`: JSONL → tensor バッチの変換

### Cross

- `test_cross_spec.py` と `crossSpec.test.ts`: `action_spec.json` と `encoding_spec.json` を両側で読み、一致を確認

---

## 12. スコープ外(5b 以降で扱う)

- MCTS / 自己強化ループ
- Python 側での学習時評価対戦(5a では Node.js 側 `eval-ai.ts` のみ)
- Python への完全な env.py 移植(5a では不要)
- データ増やしての再学習自動化
- モデル蒸留・量子化
- モバイル端末の推論ベンチ(Phase 8 で)

---

## 13. リスクと緩和策

| リスク                                          | 緩和策                                                                 |
| ----------------------------------------------- | ---------------------------------------------------------------------- |
| ONNX → TF.js 変換が未対応 op に当たる           | CNN + FC のみで構成(標準 op)。tanh/softmax/relu のみ使用              |
| MPS バックエンドで PyTorch の op が欠ける       | 学習時の不足 op は `device='cpu'` fallback を許可                      |
| Node.js self-play が遅すぎる                    | `worker_threads` で並列化、ゲーム内の `HeuristicAI` は 1 worker 1 AI 使い回し(Worker 作成コスト削減) |
| モデルファイルが 2MB を超える                   | CNN 幅圧縮 → 再学習。それでもダメなら git-lfs 導入                     |
| TS と Python のエンコーディングずれ             | SSOT テストケース JSON を cross-test で検証                            |
| 学習中にスコア分布が極端で value head が飽和     | VALUE_SCALE を学習データから統計的に決める(中央値ベース)             |
| WebGL backend がモバイルで fallback する        | CPU backend でもブラウザで動くことを確認(遅い前提)                   |

---

## 14. 未決事項

なし(Q1-Q7 で全て決定済み)。

実装段階で出てくる小さな決めごと(CNN の pad/stride、lr schedule の詳細、AI セレクタの文言等)は計画ドキュメント側に入れる。
