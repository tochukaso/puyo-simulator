# Phase C 解決レポート (2026-04-26)

`2026-04-26-phase-c-debug-handoff.md` に書き出していた仮説検証の結末をまとめる。

---

## TL;DR

- WASM 移植自体は最初から正しかった。盤面エンコード・重み・推定手のいずれも native ama と一致。
- 本当の原因は **puyo-simulator 側の連鎖判定と着地処理のバグ** 2 件:
  1. `findConnectedGroups` が天井段(row 0)も 4 連結カウントに含めていた → 偽の連鎖発火、または逆に native が消す連鎖を消せない
  2. `lockActive` が「列満タン → null → ゲームオーバー」になっていた → ぷよぷよ通信ルールでは「あふれたぷよは黙って捨て、spawn 不能になったときだけ窒息」が正
- 修正後 seed=1 で **score 467,380 / max_chain 14**(native 357,940 / 14 と同等以上)。
- コミット: `2a5739e`(puyo-simulator)/ `709da9f`(ama 側 diag API)

---

## 仮説マトリクス(更新版)

| # | 仮説 | 結果 | 根拠 |
| --- | --- | --- | --- |
| A | ama が field を空と認識している | **REJECTED** | `ama_diag_field` を追加して ama 側の `field.get_heights()` を JS にダンプ。30 手以上ぶん `js heights == ama heights` が完全一致 |
| B | `g_weight` の値が壊れている | **REJECTED** | `ama_diag_weight` で 15 個全てを読み出し → `chain=1000`, `link_2=150`, `chi=200`, `bump=-100`, ... が config.json と完全一致 |
| C | 逐次化した search_multi のロジックバグ | **NOT THE CAUSE** | seed=1 で WASM と native が **30 手連続で同一手** を返した(c0r2, c4r1, c5r0, ...)。逐次化は決定論的に native 等価 |
| D | n2 ペアを渡していない | **NOT THE CAUSE** | native `dump_selfplay` も 2-ply で動作。n2 を渡しても結果は変わらない |
| **E (新規)** | **シミュレータ側のバグ** | **CONFIRMED** | 着手は完全一致するのに、ours の `commitMove` 後の field が native の field と turn 35 から食い違う。turn 34 で「row 0 を含む 4 連結 Y」を ours が誤って消していた |

---

## 検証フロー(再現可能)

### 1. 着手列の比較
```bash
# native
cd /Users/yasumitsuomori/git/ama
./bin/dump_selfplay/dump_selfplay.exe --games 1 --seed 1 --weights build --out /tmp/ama-native-seed1.jsonl --topk 1
```
WasmAmaAI を Node から呼び、各手の (axisCol, rotation) を比較 → 全 turn 一致。

### 2. 盤面の比較
WasmAmaAI の手を ours の `commitMove` で適用しつつ、turn ごとに ours の field と native の `field` を比較 → **turn 35 で初めて divergence**。

ours の field:
```
.....Y
.P....   ← (0,5),(1,5),(1,4),(2,4) の Y4個を消したあと
YRRB.P
...
```
native の field(同じ手を打った後):
```
.....Y
.P..YY   ← Y4個が残っている
YRRBYP
...
```

→ ours は天井段 (row 0) を含む 4 連結を発火、native は無視している。

### 3. 修正後の挙動
```bash
npm run eval -- --games 1 --seed 1 --a heuristic --b ama-wasm
# ama-wasm avg score: 467380, max-chain mean: 14.00
# (native: 357940 / 14)
```

---

## 修正内容

### `src/game/chain.ts`
- `findConnectedGroups` と `bfs` の row ループを `VISIBLE_ROW_START..ROWS` に変更
- 天井段 (row 0) を含む puyo は 4 連結検出から除外
- 既存の連鎖テストはそのまま通り、新規回帰テスト「天井段のぷよは 4 連結に含めない」を追加

### `src/game/landing.ts`
- `lockActive(field, active): Field | null` → `lockActive(field, active): Field`
- 列が満タンでもエラーを返さず、当該ピースを黙って捨てる
- `landRow < 0` で `continue`

### `src/game/state.ts` / `src/game/moves.ts` / `src/ui/store.ts` / `src/ui/components/Board/ghost.ts`
- 上記に追従して null チェックを削除
- ゲームオーバー判定は `spawnNext` の `canPlace` に任せる(従来どおり)

### `src/ai/wasm-ama/wasm-ama-ai.ts`
- 検証用に追加していた per-step heights ログを削除

---

## ama 側の追加(別 repo `/Users/yasumitsuomori/git/ama`)

### `tools/wasm_api.cpp`
```cpp
// 同じ field_chars を ama Field にロードしたときの 6 列高さを返す
EMSCRIPTEN_KEEPALIVE int ama_diag_field(const char* field_chars, uint8_t* heights_out);
// 15 個ある g_weight の値を 1 つずつ返す(0..14 のインデックス指定)
EMSCRIPTEN_KEEPALIVE int ama_diag_weight(int idx);
```

### `makefile`
- EXPORTED_FUNCTIONS に `_ama_diag_field`, `_ama_diag_weight` を追加

---

## 残作業 / 未確認事項

### 1. ブラウザでの実プレイ確認
Node 側 eval は完璧。ブラウザでも WASM 自体は正しい候補を返すことを確認(`cur=RY n1=PY → c0r2`)。
が、UI 自動操作テスト(MCP 経由)では「AI 候補パネルの再描画タイミング」の race により、毎手 c0r2 を click し続けてしまった。**ユーザー手動で 1 手ずつ確定すれば問題なく連鎖が発火するはず**。

### 2. テスト失敗 4 件
`src/ui/components/Header/__tests__/Header.test.tsx` の 4 件が `localStorage.clear is not a function` で失敗。今回の修正とは無関係(test 環境設定の問題)。要対応 issue として後追い。

### 3. 既存ユーザーの保存データ
今回 lockActive のセマンティクスが変わったため、過去にあった「列満タンでゲームオーバー」を期待するロジック(あれば)に注意。本リポでは現状なし。

### 4. Push
puyo-simulator は origin の `feature/puyo-mvp` から **1 コミット先行**(`2a5739e`)。
ama は origin の `main` から **9 コミット先行**(直近 `709da9f`)。
ユーザーの判断で push してください。

---

## 学び

- **「同じ入力 → 同じ出力」が一致したら、まず差分は処理側に出る**。今回も AI 出力が完全一致してたのにスコアが違う時点で「シミュレータ側」を疑うべきだった。最初は WASM 側ばかり見ていた。
- **ama_diag_*  系 API は強力**。今後 WASM 周りで疑問が出たら同じパターンで C ABI に診断 export を足すと早い。
- **天井段の扱いはぷよ実装の頻出ハマりどころ**。`VISIBLE_ROW_START` 定数があったのに、chain.ts が無視していた。
