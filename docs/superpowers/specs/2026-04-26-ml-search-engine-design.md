# ML AI を expectimax search エンジン化 + 表現力強化 + 色正規化

**作成日**: 2026-04-26
**ベース**: 既存 `policy-ama-v1`(model_v2 ResNet 8×64ch、1-ply policy 推論)
**スコープ**: 中規模(1〜3 日)、第一弾。第二弾の余地は §6 リスクに記載。

---

## 1. ゴール & 成功基準

### 1.1 ゴール

ML AI のプレイ品質(平均 score / 平均 maxChain)を底上げする。具体的には推論を **policy 1-shot から 3-ply expectimax search に置き換え**、入力エンコーディングを強化し、色対称性を活用したデータ拡張で実質サンプル数を 48 倍に増やす。`val_top1` は副指標。

### 1.2 主要 KPI

`scripts/eval-ai.ts`(拡張後、§2 参照)で seed 0..19 の 20 試合を回した結果に対して:

- **対 ama-wasm の平均 score 比 ≥ 0.5** — 主要ライン
- **対 ama-wasm の平均 maxChain 比 ≥ 0.7** — 連鎖の質はスコアより乖離が小さくなる傾向
- **回帰なし**: 同 seed セットで現行 `ml-ama-v1` を平均 score で上回る(下限ライン)

### 1.3 制約

- **TF.js モデルサイズ ≤ 6 MB**(現状 policy-ama-v1 は 4.8 MB。v2 で stem 拡張(+9 KB)+ ResBlock 2 個追加(+590 KB)= 約 +600 KB → 5.4 MB 程度を見込み、6 MB に緩和)
- **AI 1 手提案レイテンシ ≤ 1500 ms**(K=6 expectimax の試算 800〜1400 ms に余裕を持たせた値)

### 1.4 成功ライン未達時の運用

ベースライン計測は eval harness の最初の実行で取得。「現状 X% かもしれない、80% かもしれない」が分からないまま強気目標を置いている。第一弾終了時に対 ama 比が

- **≥ 0.5**: 完了。打ち止め。
- **0.3 ≤ X < 0.5**: 中間目標 `(X + 0.5) / 2` に再設定し、第二弾(§6 リスク項目の rework)を起動。
- **< 0.3**: 設計の前提を疑う。spec を書き直す。

---

## 2. Eval harness

### 2.1 配置

既存 `scripts/eval-ai.ts` を拡張。新規ファイルは作らず、フラグを足して構造化出力に対応させる(`scripts/ml-ai-node.ts` の resolver も path 対応で少し足す)。

### 2.2 新フラグ

```
--ai <kind|path>          複数指定可。kind: heuristic | ml-v1 | ml-ama-v1 |
                          ml-ama-v2-search | ama-wasm | <model.json への絶対/相対パス>
--seeds 0,1,2,…           seed リスト直接指定
--seed-base 0 --count 20  または base+count で連番(default: base=0, count=20)
--baseline ama-wasm       これに対する score 比を comparisons に追加
--out data/eval-runs/<file>.json  構造化出力(指定なければ stdout のみ)
--max-moves 500           既存と同じデフォルト
--preset standard         scripts/eval-presets.ts の STANDARD を使う(seeds 0..19, max-moves 500)
```

### 2.3 出力 JSON

```json
{
  "timestamp": "2026-04-26T13:00:00Z",
  "git_sha": "315d152",
  "seeds": [0, 1, 2, ..., 19],
  "ais": [
    {
      "kind": "ml-ama-v2-search",
      "version": "policy-ama-v2-search",
      "model_url": "/models/policy-ama-v2/model.json",
      "games": [
        { "seed": 0, "score": 12340, "maxChain": 5, "totalChains": 8,
          "moves": 47, "gameover": true }
      ],
      "aggregate": {
        "avgScore": 12340, "medianScore": 11000,
        "avgMaxChain": 4.2, "maxScore": 38000
      }
    }
  ],
  "comparisons": [
    { "baseline": "ama-wasm", "ai": "ml-ama-v2-search",
      "avgScoreRatio": 0.62,
      "perSeed": [{"seed":0, "ratio":0.7}, ...] }
  ]
}
```

### 2.4 保存先

`data/eval-runs/`(`.gitignore` に追加、ローカル蓄積用)。コミットしないが履歴は残る。

### 2.5 プリセット

`scripts/eval-presets.ts` に `STANDARD = { count: 20, base: 0, maxMoves: 500 }` を 1 個だけ定数で置く。プリセットは 1 個だけ(分岐を増やさない、YAGNI)。回帰検出は自動化しない。

---

## 3. エンコーディング + 色正規化

### 3.1 入力チャンネル(7ch → 11ch)

| ch | 意味 |
|---|---|
| 0..3 | 各色(R, B, Y, P 正規化後の "color 0..3")の one-hot |
| 4 | 空セル |
| 5 | axis 色(broadcast、0..1 に正規化)|
| 6 | child 色(broadcast、0..1 に正規化)|
| 7 | 列ごとの高さ(0..1 正規化、broadcast 横方向)|
| 8 | 各セルが「同色 4 連結」に既に属しているかフラグ |
| 9 | 列の天井段(row 0)が埋まっているフラグ(broadcast)|
| 10 | デンジャー列(row 1 が埋まっているか)(broadcast)|

queue は 16 のまま、構造同じ、色 ID は正規化後。

### 3.2 色正規化(canonicalization)

ぷよぷよは 4 色完全対称(R/B/Y/P が役割上同等)なので、正規化により equivalence class を 1 つに集約できる。

**ルール**:

1. フィールドを **下から上、左から右** にスキャン
2. 続けて **current.axis、current.child、next1.axis、next1.child、next2.axis、next2.child** の順にスキャン
3. 初出現順に新 ID `0, 1, 2, 3` を割り当て
4. 出現しない色は ID を消費しない(後続でまだ未使用 ID から割り当て)

例: 盤面に Y のみ → Y=0。current が (R, P) → R=1, P=2。next1 が (B, B) → B=3。

**冪等性**: 正規化後に同じ正規化を適用しても結果は同じ(unit test で保証)。

**action は色非依存**(axisCol + rotation のみ)なので、正規化による action マッピング変換は不要。

### 3.3 Augmentation(学習時のみ)

- **左右反転**(field・current・next mirror、列インデックス 0↔5, 1↔4, 2↔3、rotation 1↔3)
- **色順列ランダム置換**(24 通りからランダム 1)
- 組み合わせて実質 **48 倍**(44K → 2.1M effective サンプル)
- 確率: LR flip 50%、color permutation は毎バッチランダム選択

---

## 4. Search engine(推論を expectimax 化)

### 4.1 探索木

```
depth 1 (current,  既知): 22 placements → policy 上位 K=6 のみ展開
  depth 2 (next1,  既知): 22 placements → policy 上位 K=6 のみ展開
    depth 3 (next2, 既知): 22 placements → policy 上位 K=6 のみ展開
      depth 4 chance (4th, 未知):
        - 同色代表 (color 0, color 0) で重み 0.25
        - 異色代表 (color 0, color 1) で重み 0.75
        leaf: ML value head で評価
```

### 4.2 ビーム幅 K=6

- leaf 数 = 6³ × 2(chance) = 432
- NN forward 合計 = 1 + 6 + 36 + 432 = **475 calls**
- TF.js batched 推論で **800〜1400 ms / 1 手提案**(KPI 1500 ms 内)

K=5 / K=8 と比較した精度・性能は §3 の評価でクロスチェック(K を変えた eval を 1 回追加)。policy の top-K hit 率次第で「K=6 で頭打ち感」が出るはずなので、第一弾は K=6 固定で確定。

### 4.3 chance node の確率モデル

標準 puyo の 4 色一様サンプリングだと:
- 同色ペア (axis = child) = 4/16 = **25%**
- 異色ペア (axis ≠ child) = 12/16 = **75%**

これを **2 個の代表ペアに集約**:

| 代表 | 例 | 重み |
|---|---|---|
| 同色 | (color 0, color 0) | 0.25 |
| 異色 | (color 0, color 1) | 0.75 |

色は正規化後の ID を使う。同色 vs 異色の構造は色 ID に依らないため正規化と相性が良い。

### 4.4 推論パイプライン(worker 側)

1. 現状態を canonicalize → 入力 tensor 作成
2. depth 1 の root state で 1 forward → policy(22) + value 取得
3. policy 上位 6 を採用、各々で次状態を計算 → 6 leaves
4. depth 2: 6 状態を batch で forward(6 calls) → 各々 top-6 採用 = 36 grandchildren
5. depth 3: 36 状態を batch で forward(36 calls) → 各々 top-6 採用 = 216 great-grandchildren
6. depth 4 chance: 216 × 2 = 432 leaves を **1 回の batch で forward** → value 取得
7. 後ろ向きに `value × 重み` を集計、depth 1 の各候補のスコアを得る
8. argmax で最善手を返す

leaf 評価 = `value`(value head 出力)。chain 発火による即時 score は path の途中の即時報酬として加算可能(γ=1)。

### 4.5 モデル側変更

- 入力 7ch → **11ch**、queue 16 のまま
- model_v2 の stem を `Conv2d(11, 64, ...)` に置換
- ResNet 8 ブロック → **10 ブロック**(容量微増、追加 +590 KB で全体 ~5.4 MB、6 MB 制約内)
- 既存 `policy-ama-v1`(4.8 MB)は据え置き(共存、回帰検出用)
- 新モデルは **`policy-ama-v2`** として export

### 4.6 Worker 側ファイル変更

- `src/ai/ml/ml-ai.ts` → `src/ai/ml/ml-policy-ai.ts` にリネーム(従来の 1-ply 推論版、内容変更なし)
- `src/ai/ml/ml-search-ai.ts`(新規)— ExpectimaxAI 実装
- `src/ai/types.ts` — `AiKind` に `'ml-ama-v2-search'` を追加
- `src/ai/worker/ai.worker.ts` — 新 kind の dispatch
- `src/ui/components/Header/Header.tsx` — セレクタに新オプション追加

---

## 5. Training pipeline 更新

### 5.1 Python 側変更

**`puyo_train/encoding.py`** — 7ch → 11ch
- `BOARD_CHANNELS = 11`
- ch 7-10 を追加
- 関数 `canonicalize_colors(state) -> (state', perm)` 新設

**`puyo_train/augmentation.py`**(新規)
- `apply_lr_flip(board, queue, policy_target)` — 列反転 + action マッピング
- `apply_color_permutation(board, queue, policy_target, perm)` — channels 0..3 + queue 並び替え

**`puyo_train/dataset_ama.py`**
- `__getitem__` で encoding 前に `canonicalize_colors` 適用
- 学習時のみ確率的 augmentation: LR flip 50%、color permutation ランダム

**`puyo_train/distill.py`**
- temperature デフォルト 100 → **20**
- α(value 損失重み)はそのまま 1.0

**`puyo_train/model_v2.py`**
- `BOARD_C: 7 → 11`
- `BLOCKS: 8 → 10`

**`train_ama.py`**
- `--temperature` default 20
- `--out` default `checkpoints/policy-ama-v2.pt`
- `--no-augment` オプション(検証用、デフォルト augment ON)

### 5.2 Export

`puyo_train/export.py`: 入力 shape `(1, 13, 6, 11)` に対応、出力先 `public/models/policy-ama-v2/`(v1 と並存)。

### 5.3 TS 側変更

**`src/ai/ml/encoding.ts`** — 11ch エンコーディング + canonicalize(Python と完全一致)
**`src/ai/ml/ml-policy-ai.ts`**(`ml-ai.ts` をリネーム)— 既存 1-ply policy、変更なし
**`src/ai/ml/ml-search-ai.ts`**(新規)— K=6 expectimax
**`src/ai/types.ts`** — `'ml-ama-v2-search'` 追加
**`src/ai/worker/ai.worker.ts`** — 新 kind dispatch
**`src/ui/components/Header/Header.tsx`** — セレクタ追加

### 5.4 データ生成

**第一弾は新規データ生成なし**。color permutation 24× + LR flip 2× = effective 2.1M サンプル。これで足りなければ第二弾で `--games 50000` 追加。

### 5.5 テスト

- `python/tests/test_encoding.py`: 11ch の各チャンネル
- `python/tests/test_canonicalize.py`: 色正規化の冪等性・順序
- `python/tests/test_augmentation.py`: LR flip / color permutation の正しさ + 不変性
- `src/ai/ml/__tests__/encoding.test.ts`: TS 版が Python と一致(JSON で同一サンプルを通す)
- `src/ai/ml/__tests__/canonicalize.test.ts`: TS 版正規化
- `src/ai/ml/__tests__/ml-search-ai.test.ts`: 探索結果の sanity

### 5.6 既存テストへの影響

- `src/ai/ml/__tests__/encoding.test.ts` は更新必須(7ch → 11ch、canonicalize 適用)
- `src/ai/ml/__tests__/ml-ai.test.ts` は ml-policy-ai.test.ts にリネーム
- `Header.test.tsx` を新セレクタ option に追従
- model JSON のスキーマ変更により policy-ama-v1 を読む既存コードは継続動作(URL 別)

---

## 6. リスク

### 6.1 value head の質が search 結果に直結

Search engine の leaf 評価で value head に依存。現状の value target は teacher の top-1 score を `tanh(s/50000)` したもの。第一弾はこれを据え置くが、eval で「policy 一致率は上がったが score が伸びない」となったら **第二弾で teacher の N 手プレイ後実 score に rework** する。

### 6.2 推論レイテンシ超過

K=6 / 475 NN forward / TF.js batched で 800〜1400 ms 試算。1500 ms KPI 内のはずだが、ベンチで超過したら:
- batch サイズ調整
- K=5 にダウングレード
- chance node の代表を 1 個に集約(同色を捨てる)

### 6.6 モデルサイズが 6 MB を超えた場合

ResBlock 拡張で +590 KB の試算が外れて 6 MB を超えた場合:
- ResNet ブロック数を 8 のままに戻す(+0 KB)
- CHANNELS を 64 → 56 に減らす
- 量子化(int8)の検討(別タスク扱い)

### 6.3 11ch エンコーディングの TS/Python 一致性

両側で完全に同じエンコードを実装する必要がある。**JSON 同一サンプルでの一致テスト**を必須化(§5.5)。乖離は静かに精度を毀損する。

### 6.4 色正規化の equivalence

「`canonicalize` 後の同一表現は同一行動を生む」という不変条件を保つ。canonicalize 関数自体に冪等性テスト + 元のサンプルと permute 後で argmax が一致するテストを追加。

### 6.5 KPI ≥ 0.5 が強気

ベースライン計測前。最初の eval 結果次第で目標値を再設定する運用とする(§1.4)。

---

## 7. 実装順序(高レベル、詳細は writing-plans へ)

1. **eval harness 拡張**(seeds, --out JSON, --preset)— 計測基盤を先に作る
2. **ベースライン計測**:現行 ml-ama-v1, heuristic, ama-wasm の score / maxChain を JSON 保存
3. **Python 側 encoding 11ch + canonicalize + augmentation 実装 + tests**
4. **モデル model_v2 の入力 dim 拡張 + 学習(temperature 20)**
5. **export → public/models/policy-ama-v2/**
6. **TS 側 encoding + canonicalize 実装 + tests**(Python と一致確認)
7. **`ml-search-ai.ts` 実装(K=6 expectimax)+ worker 配線 + tests**
8. **Header セレクタ option 追加**
9. **eval を 'ml-ama-v2-search' で実行 → KPI 判定**
10. **§1.4 の運用に従って継続/打ち止めを決定**
