# Phase 5b: MCTS + 自己強化学習(AlphaZero 流)— 設計書

**作成日**: 2026-04-25
**前提文書**:
- `docs/superpowers/specs/2026-04-24-puyo-simulator-design.md`(全体設計)
- `docs/superpowers/specs/2026-04-24-phase5a-imitation-design.md`(5a 設計)
- `docs/superpowers/progress/2026-04-24-phase5a-run.md`(5a 実績)

---

## 1. 目的

5a の模倣学習モデル(`policy-v1`、平均スコア 2,443・max_chain 2.31、Heuristic の 1.86x)を出発点に、**MCTS + 自己強化学習**で人間上級者級(目標 max_chain 7-8、avg_score 30k+)へ引き上げる。

**5b の Done(目標 C)**:
- 100 ゲーム評価で `max_chain >= 6` の出現率 ≥ 30%
- 100 ゲーム評価で `max_chain == 7` 以上が時々発生
- 平均スコアが 5a の 5x 以上(>= 12,000)
- ブラウザで 3 段階(Heuristic / ML-fast / ML-full)を切替可能、ML-fast の推論が < 30ms

---

## 2. 全体アーキテクチャ

```
┌──────────────────────────────────────────────────────────────────┐
│  Python(ローカル開発 + Colab Pro+ A100 で本番学習)             │
│                                                                  │
│  python/puyo_train/                                              │
│    env/         ── puyo ゲームを Python 移植(Numba JIT)         │
│    mcts/        ── chance node 付き MCTS                          │
│    az/          ── AlphaZero ループ(self-play, train, eval)     │
│    distill/     ── teacher → student 蒸留                        │
│    model_v2.py  ── 16 ブロック ResNet 96ch(~5M params)          │
│    model.py     ── 5a の小モデル(student と policy-v1)         │
│                                                                  │
│  scripts/colab/                                                  │
│    upload_data.py / download_ckpt.py(Drive 同期)                │
│    az_loop.ipynb(Colab で本番学習)                            │
└──────────────────────────────┬───────────────────────────────────┘
                               │ Cloudflare R2 / GitHub Releases
                               ▼
┌──────────────────────────────────────────────────────────────────┐
│  ブラウザ                                                         │
│    Header AI セレクタ: Heuristic / ML-fast / ML-full              │
│      ML-fast = 蒸留 student(~2MB、起動即時)                    │
│      ML-full = フルモデル(~20MB、初回 download → IndexedDB)    │
│    src/ai/ml/ml-ai.ts: 既存(model URL を切替)                   │
│    src/ai/ml/full-loader.ts: 進捗付き download + IDB cache(新規) │
└──────────────────────────────────────────────────────────────────┘
```

---

## 3. ゲームエンジンの Python 移植

### 3.1 移植対象

`src/game/` 配下を `python/puyo_train/env/` に手書きポート。

| TS 元 | Python 先 | 中身 |
| --- | --- | --- |
| `constants.ts` | `env/constants.py` | ROWS/COLS/SPAWN_COL 等 |
| `types.ts` | `env/types.py` | dataclass: `Pair`, `ActivePair`, `GameState` |
| `field.ts` | `env/field.py` | `create_empty_field`, `with_cell` |
| `pair.ts` | `env/pair.py` | 回転 / 壁キック / canPlace |
| `landing.ts` | `env/landing.py` | 軸/子の最下空マス降下 |
| `chain.ts` | `env/chain.py` | 4-connect pop、スコア、`ChainStep` |
| `reachability.ts` | `env/reachability.py` | BFS reachable targets |
| `state.ts` | `env/state.py` | `create_initial_state`, `commit_move`, `spawn_next` |
| `rng.ts` | `env/rng.py` | mulberry32(seed 互換) |
| `moves.ts` | `env/moves.py` | `enumerate_legal_moves` |

### 3.2 高速化: Numba JIT

- `chain.py` の pop 検出(BFS で 4-connect 連結成分)と重力落下を `@njit(cache=True)` 化
- numpy 表現:`field` を `np.int8[ROWS, COLS]`(0=空, 1=R, 2=B, 3=Y, 4=P)
- ChainStep だけは Python オブジェクトで返す(self-play で全ステップが必要なわけではない)
- 期待性能: 1 chain resolve < 0.1ms(Pure Python の 20-50x)

### 3.3 整合性検証

- `python/tests/test_env_cross.py`:
  - 既存の `data/selfplay/*.jsonl` から 1000 サンプルピックアップ
  - 同 seed/move sequence を Python 側 `commit_move` で再生し、最終スコア & max_chain が TS 結果と一致すること
- `src/shared/specs/game_spec.json`(新規):
  - `[{"seed", "moves": [...], "expected": {"score", "max_chain"}}]` の小規模ケース 50 件
  - TS 側 `game_spec.test.ts` と Python 側 `test_game_spec.py` で両方が pass

---

## 4. ネットワーク(model-v2)

### 4.1 入力

5a と完全互換:
- `board: [13, 6, 7]` NHWC(色4 + 空 + 現ツモ軸/子)
- `queue: [16]`(NEXT/NEXT-NEXT 各 axis/child の one-hot)

### 4.2 アーキテクチャ

```
board [13,6,7]
  └─ Conv2d(7→96, 3×3, pad=1) + BN + ReLU                                        # stem
  └─ ResBlock × 16:                                                                # body
       Conv2d(96→96, 3×3, pad=1) + BN + ReLU
       Conv2d(96→96, 3×3, pad=1) + BN
       skip add → ReLU
  └─ Flatten → [13*6*96 = 7488]

queue [16]
  └─ FC(16→64) + ReLU

concat → [7488 + 64]
  └─ FC → 256 + ReLU
       ├─ policy head: FC(256 → 22) logits
       └─ value head:  FC(256 → 64) + ReLU + FC(64 → 1) + tanh
```

- パラメータ数: 約 5M
- TF.js 変換後: 約 20MB(float32)

### 4.3 損失

```
L = L_policy + α * L_value + β * ||θ||²

L_policy = -Σ π_target(a) * log softmax(policy_logits)(a)        # MCTS 由来の方策分布で蒸留
L_value  = (value - value_target)²                                # 期待スコアの tanh 値
α = 1.0, β = 1e-4
```

### 4.4 初期化(policy-v1 → model-v2 蒸留)

5a で残した `data/selfplay/selfplay-20260424.jsonl`(163k samples)を使い、新 ResNet を policy-v1 の出力に教師あり学習させる:

```
target_policy_v1 = softmax(policy_v1.forward(state).logits)
target_value_v1  = policy_v1.forward(state).value
loss_distill     = KL(softmax(model_v2.policy_logits) || target_policy_v1)
                 + MSE(model_v2.value, target_value_v1)
```

- 5-10 epochs、Adam lr=1e-3、Colab 1 時間程度
- 出力: `python/checkpoints/model-v2-distilled.pt`

---

## 5. MCTS(stochastic chance node 版)

### 5.1 ノード構造

2 種類のノード:

- **Decision node**: プレイヤーが手を選ぶノード。子は 22 アクション
- **Chance node**: 手を打った後、次のツモがランダムに決まるノード。NEXT/NEXT-NEXT が消費されてもう 1 つ先のツモが必要なときに登場。子は 16 通り(軸 4 色 × 子 4 色、各 1/16 確率)

### 5.2 アルゴリズム

PUCT(AlphaZero と同じ)を chance node 対応に拡張:

```
def select_action(node):  # decision node
  return argmax_a [Q(s,a) + c_puct * P(s,a) * sqrt(sum_b N(s,b)) / (1 + N(s,a))]

def chance_value(node):  # chance node
  return Σ_outcome P(outcome) * V(outcome_child)         # 期待値
  # 16 outcomes、各 1/16
```

NEXT-NEXT までは将来ツモが既知なので decision node のみで深く探索。3 手目以降は chance node を経由。

### 5.3 確率処理の最適化

- 16 outcomes 全部展開はメモリ食う → 上位 K=4 outcomes(色の組み合わせの上位)だけ実展開、残りは expected value で圧縮(progressive widening)
- これで chance node の枝数が 16 → 4 に
- value 評価は変わらないが N(visit count)や Q が安定しやすい

### 5.4 シミュレーション数

- 学習中の self-play: **400 sims/move**(深い探索で良いデータ)
- 評価時: 400 sims(再現可能性のため固定)
- 推論時(ブラウザ): MCTS なし、policy 直出力(レイテンシ優先)

### 5.5 Dirichlet noise

ルートノードの policy prior に `α=0.3` の Dirichlet noise を加える(AlphaZero 標準、探索多様性確保)。評価時は noise なし。

---

## 6. 学習ループ

### 6.1 イテレーション 1 回 = 4 ステージ

```
[1] self-play(20,000 ゲーム × 400 sims)
    ├─ Python multiprocessing で 8-16 並列
    ├─ 各ステップで (state, π_target, z_value) を replay buffer に追加
    └─ Colab A100 で約 6-12 時間想定(MCTS が NN forward の塊)
[2] train(replay buffer から学習)
    ├─ batch=512、5 epoch、Adam lr=1e-3 → cosine decay
    ├─ Colab A100 で 30-60 分
    └─ 出力: model-v2-iterN.pt
[3] eval(現バージョン vs 前バージョン、現バージョン vs 5a baseline)
    ├─ 各 100 ゲーム
    ├─ 勝ち越し条件: avg_score(現) >= avg_score(前) * 0.95
    └─ 不合格なら checkpoint を破棄して前イテレーションに戻る
[4] log(score 分布、max_chain 分布、loss を W&B または JSON にダンプ)
```

### 6.2 イテレーション数

- **目標 16 イテレーション**(320,000 ゲーム合計)
- 各 iter ≈ 8-13 時間 → 全体 5-9 日(Colab Pro+ で連続稼働した場合)
- 中断耐性: checkpoint + replay buffer を Drive に保存、再開可能

### 6.3 Replay buffer

- 容量: 直近 5 イテレーション分(最大 100k ゲーム ≈ 3M サンプル)
- 取得時: 一様サンプル(reservoir で十分、データの古さは acceptable な範囲)
- 形式: `.npy`(board)、`.npy`(queue)、`.npy`(policy_target)、`.npy`(value_target)

### 6.4 value target

- `value_target = tanh(final_score / 30000)`
- chance node の value は子の期待値(各 outcome 確率 ×子 V の和)
- `final_score` は **ゲーム終了時の累積スコア**(self-play で各局面に付与)

---

## 7. 蒸留(model-v2 → student-v2)

### 7.1 目的

ブラウザのデフォルト推論用に、5a と同サイズの軽量モデルを model-v2 から蒸留する。

### 7.2 蒸留設定

- 教師: model-v2(20MB)
- 生徒: 5a と同じ `PolicyValueNet`(381k params, 1.5MB)
- データ: model-v2 が MCTS+自己対戦で生成した 100k ゲーム(replay buffer の最終世代)
- 損失: `KL(student.policy || teacher.policy_with_mcts) + MSE(student.value, teacher.value)`
- temperature: 教師 logits は素のまま使用(温度なし)
- 出力: `public/models/student-v2/{model.json, *.bin}`

### 7.3 想定強度

蒸留は教師の 70-90% 性能を再現できるのが定説。よって student-v2 は概ね max_chain 5-6 級。fast モードでも十分強い。

---

## 8. ブラウザ統合

### 8.1 配信

- **ML-fast(蒸留 student-v2)**: `public/models/student-v2/` に commit、初回からキャッシュ済み
- **ML-full(model-v2)**: GitHub Releases に zip 配布(`policy-model-v2-iterN.zip`)、初回ダウンロード時に IndexedDB キャッシュ

### 8.2 コード変更

**`src/ai/ml/full-loader.ts`(新規)**:

```ts
const DB_NAME = 'puyo-models';
const STORE = 'tfjs-shards';

export async function loadModelFromIDBOrFetch(
  url: string,
  manifestKey: string,
  onProgress?: (loaded: number, total: number) => void,
): Promise<tf.GraphModel>;
```

- IndexedDB に shards をキャッシュ
- 未キャッシュなら fetch + 進捗イベント通知
- model.json の `weightsManifest` を見て複数 shard 対応

**`src/ai/ml/ml-ai.ts`**: コンストラクタに `modelKind: 'fast' | 'full'` を追加し、URL 切替

**`src/ui/components/Header/Header.tsx`**: セレクタを 3 択に拡張、`ML-full` 選択時に進捗モーダル表示

**`src/ui/components/ModelDownloadModal/`(新規)**:
- 「初回 ML-full モデルをダウンロード中…(N MB / 20 MB)」
- 完了したらモーダル閉じて推論開始

### 8.3 推論レイテンシ目標

| モデル | サイズ | デスクトップ | モバイル |
| --- | --- | --- | --- |
| ML-fast | 1.5 MB | < 30 ms | < 80 ms |
| ML-full | 20 MB | < 100 ms | 受け入れ難い場合は disable |

モバイル WebGL で ML-full レイテンシが 200ms 超なら fast 強制 fallback。

---

## 9. 評価

### 9.1 自動評価(各イテレーション)

`python/scripts/eval_iter.py` を本番ループに組み込み:

- vs 前イテレーション: 100 ゲーム
- vs 5a baseline: 100 ゲーム
- vs Heuristic: 50 ゲーム(ベースラインの絶対スコアを継続記録)

メトリクス:
- avg_score, max_score
- avg_max_chain, max_chain ヒストグラム(0-10+)
- top_k 連鎖一致率(現 vs 前)

### 9.2 評価データの公開

各イテレーション終了時に `docs/superpowers/progress/2026-04-25-phase5b-iter{N}.md` を生成し、上記メトリクスを記録。グラフは Markdown に画像として埋め込み。

---

## 10. ディレクトリ構成(差分)

```
python/
├─ puyo_train/
│  ├─ env/                       # 新規: ゲーム移植
│  │  ├─ constants.py
│  │  ├─ types.py
│  │  ├─ field.py
│  │  ├─ pair.py
│  │  ├─ landing.py
│  │  ├─ chain.py                # @njit
│  │  ├─ reachability.py
│  │  ├─ state.py
│  │  ├─ rng.py                  # mulberry32
│  │  └─ moves.py
│  ├─ mcts/                      # 新規: MCTS
│  │  ├─ node.py                 # Decision/Chance node
│  │  ├─ search.py               # PUCT + chance value
│  │  └─ batch_evaluator.py      # NN forward を batch 化
│  ├─ az/                        # 新規: AlphaZero ループ
│  │  ├─ self_play.py
│  │  ├─ replay.py
│  │  ├─ train.py
│  │  ├─ eval.py
│  │  └─ loop.py                 # 1 イテレーションを束ねる
│  ├─ distill/                   # 新規: 蒸留
│  │  ├─ from_v1.py              # policy-v1 → model-v2 初期化
│  │  └─ to_student.py           # model-v2 → student-v2
│  ├─ model_v2.py                # 新規: ResBlock, PolicyValueNet_v2
│  └─ ...(既存ファイル)
├─ tests/
│  ├─ test_env/                  # ゲームポートのユニット + cross-test
│  ├─ test_mcts/
│  ├─ test_az/
│  └─ test_distill/
└─ scripts/colab/
   ├─ az_loop.ipynb              # Colab 用
   ├─ upload_data.py             # ローカル → Drive
   └─ download_ckpt.py           # Drive → ローカル

src/
├─ shared/specs/
│  └─ game_spec.json             # 新規: ゲームロジック cross-spec
├─ game/__tests__/
│  └─ game_spec.test.ts          # 新規: 上記の TS 側検証
└─ ai/ml/
   ├─ full-loader.ts             # 新規: IndexedDB + fetch + progress
   └─ ml-ai.ts                   # modelKind 'fast'|'full' 切替

public/models/
├─ policy-v1/                    # 既存(将来削除可能)
└─ student-v2/                   # 新規(蒸留結果、commit)
```

---

## 11. 実装フェーズ(順序)

5b は規模が大きいので 4 フェーズに分割:

| フェーズ | 内容 | 期間 | 出力 |
| --- | --- | --- | --- |
| **5b-1** | ゲーム移植 + Numba 高速化 + cross-test | 3-5 日 | `python/puyo_train/env/`、TS-Python 整合 |
| **5b-2** | MCTS + model-v2 ResNet + policy-v1 蒸留初期化 | 4-6 日 | `mcts/`, `model_v2.py`, distill 済み ckpt |
| **5b-3** | AlphaZero ループ(self-play/train/eval)とローカル smoke run | 4-6 日 | `az/loop.py`、3 iter のミニ run |
| **5b-4** | Colab で本番 16 iter + 蒸留 + ブラウザ統合 | 3-5 週間 | model-v2、student-v2、UI 3 択セレクタ |

各フェーズ独立に動作確認できる。

---

## 12. リスクと緩和

| リスク | 緩和 |
| --- | --- |
| Numba JIT が macOS / Colab で挙動差 | cross-test で TS と一致を毎度確認 |
| MCTS の chance node でメモリ爆発 | progressive widening(K=4)、ノードプール |
| 16 iter 完走前に Colab credit 消費 | 各 iter ごと checkpoint、再開可能、進捗悪ければ早期打切り |
| value target tanh のスケールがズレ | 1-2 iter ごとに `final_score` 分布を確認、必要なら VALUE_SCALE 再調整 |
| 蒸留で大幅に弱化 | student サイズを 1.5MB → 3MB に倍増オプション(まだ < 5MB ブラウザ閾値) |
| ブラウザ ML-full のモバイル推論が遅すぎる | モバイル UA 検出で fast 強制 + 警告表示 |
| 学習が 5-6 連鎖で頭打ちで C 目標未達 | 「目標未達でも 5a より明確に強いモデル」を ship、続編 5c に拡張案を記録 |
| Python ↔ TS のロジックずれ | `game_spec.json` の cross-test を CI に組込み(PR で常時検証) |

---

## 13. スコープ外(本フェーズで扱わない)

- **複数プレイヤー対戦(おじゃま落下)** - 元ゲームの2P要素は未対応
- **オフライン学習データの公開**(replay buffer の外部公開) - 著作権・運用面で先送り
- **モバイルでの ML-full サポート** - WebGL 性能上限のため
- **MuZero 流のモデルベース計画** - 環境 known なので不要
- **LLM 連携での「読み筋解説」** - 別構想

---

## 14. 未決事項

なし。実装段階で出てくる微調整(具体の lr schedule、Dirichlet alpha、c_puct、batch size の最終値)は 5b-2 / 5b-3 の実装ノートに残す。
