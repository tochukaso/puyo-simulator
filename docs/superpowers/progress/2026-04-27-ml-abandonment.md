# ML AI 開発の打ち止め(2026-04-27)

## 決定

機械学習ベースの AI(ml-ama-vN-search)の開発を **一度ここで打ち止め** する。
将来再開する可能性は残すが、現在のロードマップから外す。

## 経緯のサマリ

| iteration | アプローチ | KPI 結果(score / native ama, 200-move) |
|---|---|---|
| ml-ama-v1 (P-3 baseline) | 7ch / 1-ply policy 蒸留 | **0.008** |
| ml-ama-v2-search (P-15) | 11ch + canonicalize + 48× aug + K=6 expectimax | 0.056 |
| ml-ama-v3-search (B 案) | + value target を `final_score` から `topk[0].score` へ | **0.070** |

3 イテレーションで **0.008 → 0.070(~9× 改善)** を達成したが、KPI 0.50 には遥か遠い(~7×不足)。

## 打ち止めの理由

### 1. 構造的な天井

現アプローチは **「ama 蒸留 + 浅い search」** で、教師より強くなる仕組みがない。
- AlphaZero 系の self-play + RL でない限り、教師の劣化版が天井
- 0.20-0.30 までは A 案(N-step rollout value target)で届きうるが、それでも ama より大幅に弱い

### 2. 速度の利点が消滅

機械学習の本来の利点である「ブラウザでの高速推論」が、expectimax で消える:
- ml-ama-v3-search: 258 NN forward × ~10ms ≈ **~3 sec/move**
- ama-wasm: beam depth 16 / width 250 ≈ **~3 sec/move**

つまり「ama より弱くて、ama-wasm と同等に遅い」状態。役割が立たない。

### 3. 投資対効果が悪い

- 0.30 を狙うだけでも A 案(`dump_selfplay.cpp` 拡張 + データ再生成)で数日
- 0.50 を狙うなら AlphaZero 系で数週間 + 大幅な compute 投資
- 同じ時間を ama-wasm 高速化や GTR 訓練機能に充てた方が UX 改善幅が大きい

## 残してあるもの

PR #6 (`feat/ml-search-engine` ブランチ)で以下が動く形で commit 済み:

- 11ch encoding + 色正規化(Python + TS、byte-for-byte 一致)
- LR-flip + 24-perm color augmentation(48× データ)
- expectimax K=6 search engine(`ml-search-ai.ts`)
- value target を `final_score` / `topk[0].score` で切替可能(B 案 spec)
- eval-ai 拡張(`--preset standard`、`--baseline`、JSON 出力)
- model 成果物 `policy-ama-v2`(5.4 MB)、`policy-ama-v3`(5.4 MB)

## 学んだこと(将来再開時の参考)

1. **distillation だけでは教師超えは無理** — RL が必要
2. **value target が positional でない** と search は飾り(value head が定数を返したら beam の意味なし)
3. **eval が遅すぎて反復しにくい** — 1 試合 10 分は実験ループが回らない、まず eval harness の高速化が先
4. **ama-wasm は普通に強い** — ML が無い前提で UI / UX を組み立てた方が早い

## 次の方針(要相談)

- **A) ama-wasm 高速化に集中**(seed 並列、batching、Web Worker アーキ)
- **B) GTR 訓練モードの拡充**(他形・難易度・進捗可視化)
- **C) 別ジャンル**(対戦リプレイ、解析ツール、棋譜検索 etc.)

ML PR(#6)の扱いは別途相談。
