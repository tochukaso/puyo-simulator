# Value Target Rework — B 案(topk score 流用)設計

**作成日**: 2026-04-26
**前提**: P-15 で `ml-ama-v2-search` の score/ama 比 = 0.056(KPI 0.50 大幅未達)、原因として最有力は value head の training signal が positional に弱いこと。
**位置付け**: B 案(軽量実験)。本命は別 spec の A 案(N-step rollout、データ再生成必要)。B はその前段で「value target が真に主因か」を低コストで切り分ける。

---

## 1. ゴール & 検証目的

### 1.1 Goal

value head の training signal を「全 position 同一の `final_score`」から「ama の `topk[0].score`(position 依存の評価)」に置き換え、search engine の leaf 評価の質が KPI スコアに効くか測定する。

### 1.2 仮説

P-15 で score/ama=0.056 だった主因は value head が positional 識別できないこと。現状は同一ゲーム内のすべての position に同じ `final_score` がラベルされており、value head は「いまの局面が良いか」を学べない。`topk[0].score` は ama beam search が各 position から発射可能な連鎖の予測スコアで、position ごとに値が変わる。

### 1.3 KPI(B 単発の合格判定)

20 seeds (0..19) 固定、max-moves 200(native ama に揃え)。

- **score/ama 比 ≥ 0.30**: B 案で「value target が主因」と確定 → A 案を本格実装
- **0.10 ≤ X < 0.30**: 部分的、A は確実に必要、N の効果が大きい
- **< 0.10**: value target 単独では届かない、A 設計時に別軸も検討

### 1.4 制約

- 学習データ再生成しない(現 44K positions そのまま)
- model architecture 変更なし(11ch / 10 blocks)
- augmentation, temperature, alpha 据え置き
- 旧 `policy-ama-v2` 共存(v3 は別アーティファクト)

---

## 2. Architecture

### 2.1 変更箇所

`python/puyo_train/dataset_ama.py` の value_target だけ。`final_score` ベースから `topk[0].score` ベースへ。

`value_target_from_score(score, scale=50000.0)` に scale 引数を追加し、AmaDataset/`load_all` に `value_source: 'final_score' | 'topk_score'` パラメータ(default `'final_score'` で v2 互換)を追加。

`__getitem__` 内で:

```python
if self.value_source == 'topk_score':
    top = row['topk'][0].get('score', 0.0) if row.get('topk') else 0.0
    value = value_target_from_score(float(top), scale=200000.0)
else:
    value = value_target_from_score(float(row.get('final_score', 0.0)))
```

scale=200000.0 の選択理由: topk score の典型的な範囲が 50K-1M なので、`tanh(s/200000)` の有効領域(s が ~10K-500K で勾配が立つ)に合わせる。

### 2.2 変更しないもの

- model_v2.py(11ch / 10 blocks)
- augmentation.py(LR flip + 24-perm 色変換、48× 倍)
- distill.py の他のハイパーパラ(T=20, alpha=1.0, epochs=30 など)
- ml-search-ai.ts(modelUrl 経由でパラメータ化済み、新モデル指定で動作)

### 2.3 モデル成果物

- `python/checkpoints/policy-ama-v3.pt`(別名で並存、v2 上書きしない)
- `public/models/policy-ama-v3/`(TF.js export)
- 旧 `policy-ama-v2` も並存維持

### 2.4 AI 配線

- `AiKind` に `'ml-ama-v3-search'` 追加
- worker に v3 用シングルトン + dispatch
- Header に新 option

---

## 3. Implementation steps

### 3.1 Python 側

1. `puyo_train/dataset_ama.py`
   - `value_target_from_score(score: float, scale: float = 50000.0)` に scale 引数追加
   - `AmaDataset` `__init__` と `load_all` に `value_source: str = 'final_score'` 追加
   - `__getitem__` で分岐(2.1 のスニペット)

2. `puyo_train/distill.py`
   - `run_distillation` に `value_source: str = 'final_score'` 追加、`load_all` へ伝播

3. `train_ama.py`
   - `--value-source {final_score,topk_score}` 追加(default `final_score`)

### 3.2 学習 + Export

4. `python train_ama.py --out checkpoints/policy-ama-v3.pt --value-source topk_score`(~30-60 分、MPS)
5. `python -m puyo_train.export --ckpt checkpoints/policy-ama-v3.pt --out ../public/models/policy-ama-v3`

### 3.3 TS 側

6. `src/ai/types.ts` — `AiKind` に `'ml-ama-v3-search'` 追加
7. `src/ai/worker/ai.worker.ts` — v3 シングルトン `mlSearchInstanceV3` + `getOrInitMlSearchV3()` + dispatch ブランチ
8. `src/ui/components/Header/Header.tsx` — `<option value="ml-ama-v3-search">ML (ama-v3 + search)</option>` 追加 + VALID 配列更新

### 3.4 Eval

9. `scripts/eval-ai.ts` の `makeAi` に `'ml-ama-v3-search'` 分岐(`createNodeMlSearchAI('public/models/policy-ama-v3/model.json')`)
10. Eval run:
    ```bash
    npm run eval -- --preset standard --max-moves 200 \
      --ai ml-ama-v3-search --ai ama --baseline ama \
      --out data/eval-runs/v3-search-2026-04-26.json
    ```

### 3.5 ドキュメント

11. `docs/superpowers/progress/2026-04-26-ml-search-baseline.md` に v3 行 + KPI 判定追記
12. judgement に従って次アクション(A 案へ進む or 別軸検討)を doc 末尾に記載

### 3.6 テスト

- `python/tests/test_dataset_ama.py`: `value_source='topk_score'` の smoke test 追加(shape OK + value が non-zero、final_score を 0 にしても topk score から target が出ることを確認)

---

## 4. リスク

### 4.1 topk score の単位 / 分布

ama の beam search は固定 weight で動くが、preset によって score の絶対値が変わる(build preset と他で異なる)。今回は build preset データだけ使うので問題ないが、将来 gtr preset データを混ぜたら scale 再調整が必要。

### 4.2 eval stall

P-15 と同じく ml-search-ai は per-move ~3 秒 × 200 手 × 20 seeds で長時間。スコープ外でも、batching 化(Important #1 既知)を後で別タスクで対応すべき。

### 4.3 KPI 改善が見られない場合

§1.3 の 3 段判定どおり進める。X < 0.10 なら value target 単独では効かないので、A 案 + 別軸(model 容量増、policy も同時改善、search 深さ調整、等)を spec で検討。

### 4.4 v2 互換性

`value_source='final_score'` を default に保つことで、既存 v2 の再現性を維持。回帰テストで `value_source` を default で呼んだ場合の値が変わらないことを確認。

---

## 5. 実装順序(高レベル、詳細は writing-plans へ)

1. `value_target_from_score` に scale 引数追加 + tests
2. `AmaDataset` / `load_all` / `run_distillation` / `train_ama` に `value_source` 引数を伝播 + tests
3. 学習(background)
4. Export
5. TS 配線(types / worker / Header / eval-ai)
6. Eval run
7. Doc 追記 + KPI 判定 + commit
