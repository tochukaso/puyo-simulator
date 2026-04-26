# GTR 訓練モード 実装ハンドオフ (2026-04-26)

post-compact 後に Phase 1+2 を一気に着手するための引き継ぎ。

---

## 1. このセッションでやったこと(全て commit 済み)

### Phase C デバッグ完了 → ama-wasm が native と同等に動くようになった
- ama-wasm seed=1 → score 467,380 / max_chain 14(native ama 357,940 / 14 と同等)
- ama 側に診断 API (`ama_diag_field`, `ama_diag_weight`) を追加して仮説検証
- 真因は **シミュレータ側のバグ 2 件**
  - `findConnectedGroups` が天井段(row 0)も 4 連結に含めていた
  - `lockActive` が満タン時に null → ゲームオーバーになっていた(本来は黙って捨てる)
- 詳細: `docs/superpowers/progress/2026-04-26-phase-c-resolution.md`

### UI 改修(`feature/puyo-mvp` ブランチに 14 コミット)
- `e8e1a9a` AI 思考中は候補/ゴーストをクリア
- `56a705b` NEXT 表示を盤面右側へ縦並び(本家ぷよぷよ準拠)
- `4723ff6` タッチ操作を本家準拠に(右/左フリック=移動、下フリック=高速、左右半分タップ=回転)
- `a37e700` 同色隣接ぷよの「首」接続バー描画
- `8883732` AI 候補手をトップ正規化 % 表示(0% 固定だったのを修正)
- `2bf8b9b` ゴースト表示 ON/OFF トグル
- `9e9cfc7` 「★ AI最善」ワンクリック確定ボタン
- `be5202b` 連鎖時に「Nれんさ!」フローティングテキスト(2 秒フェード)
- `f46ca58` 着地ぷよの squash-stretch 弾みアニメ
- `d2a6729` GitHub Actions の SHA 固定 + Header テスト localStorage シム

### 現状
- puyo-simulator: `feature/puyo-mvp` が origin と同期済み
- ama: `main` が origin より 9 commits 先行(未 push)
- テスト: 112/114 通過(2 skip)、4 件失敗→0 件に修正済み
- 開発サーバ: `http://localhost:5173/` で稼働中

---

## 2. 次にやること: GTR 訓練モード Phase 1+2

### 経緯
ユーザは「GTR の土台を **作る練習**」をしたい。3 案を提示して **C 案(自動誘導)** を選択。Phase 1+2 を一気に作る方針。

### ama 側の重要発見 — GTR は ama が既に知っている

**`/Users/yasumitsuomori/git/ama/ai/search/beam/form.h`** に 4 形状パターン定義済み:
```cpp
constexpr Data GTR  = ...;  // 大ちゃん流 GTR
constexpr Data SGTR = ...;  // 新 GTR
constexpr Data FRON = ...;  // フロン
constexpr Data MERI = ...;  // メリー(list 未登録)

constexpr Data list[] = { GTR, FRON, SGTR };  // 3 個が評価対象
constexpr usize COUNT = std::size(list);
```

各 `Data` は `form[6][6]` の int 配列(色グループ ID で形を表現)+ `matrix` で隣接関係を持つ。

**`ai/search/beam/eval.cpp:17-35`** で評価:
```cpp
if (w.form > 0) {
    i32 form = -100;
    if (no_garbage && depth >= 1) {
        form = 0;
        for (i32 i = 0; i < form::COUNT; ++i) {
            form = std::max(form, form::evaluate(node.field, heights, form::list[i]));
        }
    }
    node.score.eval += form * w.form;
}
```

つまり ama は「現在のフィールドが list の中で一番近い形にどれだけ合致するか」を評価して、`w.form` 倍してスコアに足している。

**config.json の form 重み**: build = 50。これを 200〜500 に上げれば「GTR を作ろうとする ama」になる(と推測)。`form::list` を `{ GTR }` だけにすれば「GTR 専用 ama」。

これが C 案の seed bank 生成にも使える(gtr-ama で selfplay → 高スコア seed を抽出)。

### GTR 形状の素材(JS 側で再現するためのデータ)

```cpp
// dform は HEIGHT-1-y で並んでいるので可視化すると(0=空、数字=色グループ):
// (form.h の dform を上下反転したもの)
{ 2, 2, 5, 0, 0, 0 },  // ← 一番上(row HEIGHT-1)
{ 1, 1, 2, 5, 0, 0 },
{ 1, 2, 5, 0, 0, 0 },
{ 3, 3, 3, 4, 0, 0 },
{ 4, 4, 4, 0, 0, 0 },
{ 0, 0, 0, 0, 0, 0 },  // ← 一番下(row 0 in form 座標)
```
`HEIGHT = 6`。フィールドは下から積む。色グループ ID は ama 内部の表現で、JS 側に持ってくるときは「ID → 色」の割り当てを ツモから動的に決める or 固定で決める。

### Phase 1: GTR 寄りの ama プリセット追加

**目的**: form を強く重み付けした ama-wasm を用意し、訓練モード時に切り替え可能にする。

**変更ファイル**:
1. **`/Users/yasumitsuomori/git/ama/config.json`** — `gtr` プリセット追加
   ```json
   {
     "build": { ... 既存 ... },
     "gtr": {
       "chain": 1000, "y": 289, "key": -200, "chi": 200,
       "shape": -100, "well": -100, "bump": -100,
       "form": 400,        ← 大幅増(build は 50)
       "link_2": 150, "link_3": 250, "waste_14": -50,
       "side": 0, "nuisance": -250, "tear": -250, "waste": -250
     }
   }
   ```
   注: `from_json(js[name], g_weight)` の `name` を引数化する必要があるので次の改修と一緒に。

2. **`/Users/yasumitsuomori/git/ama/tools/wasm_api.cpp`** — `ama_init` を preset 名対応に
   ```cpp
   EMSCRIPTEN_KEEPALIVE
   int ama_init_preset(const char* name) {
       std::ifstream f("config.json");
       if (!f.good()) return -1;
       nlohmann::json js; f >> js;
       std::string key = (name && *name) ? name : "build";
       if (!js.contains(key)) return -2;
       int build_keys = (int)js[key].size();
       from_json(js[key], g_weight);
       g_inited = true;
       return build_keys;
   }
   // 後方互換のため ama_init() は残し、内部で ama_init_preset("build") を呼ぶ
   ```

3. **`/Users/yasumitsuomori/git/ama/Makefile`** — `_ama_init_preset` を EXPORTED_FUNCTIONS に追加

4. **WASM 再ビルド + コピー**
   ```bash
   cd /Users/yasumitsuomori/git/ama && make wasm
   cp bin/wasm/ama.js /Users/yasumitsuomori/git/puyo-simulator/.worktrees/puyo-mvp/public/wasm/ama.js
   cp bin/wasm/ama.wasm /Users/yasumitsuomori/git/puyo-simulator/.worktrees/puyo-mvp/public/wasm/ama.wasm
   cp bin/wasm/ama.js /Users/yasumitsuomori/git/puyo-simulator/.worktrees/puyo-mvp/src/ai/wasm-ama/_glue/ama.js
   ```

5. **`src/ai/wasm-ama/wasm-loader.ts`** — `ama_init_preset` 経由でのロードを追加(現行 `ccall('ama_init', ...)` を `ccall('ama_init_preset', 'number', ['string'], [presetName])` に置換)

6. **`src/ai/wasm-ama/wasm-ama-ai.ts`** — コンストラクタに preset 名を受け取れるようにする(default = 'build')
   ```typescript
   constructor(private preset: string = 'build') {}
   ```

7. **検証**: `npx tsx scripts/dump-ama-weights.ts` を preset 引数取れるようにして `gtr` の値を確認 → form=400 になっているか

### Phase 2: GTR 訓練モードの UI

**目的**: トグル ON で「GTR の見本表示 + GTR 寄り ama + 達成度メーター」を有効化する。

**変更ファイル**:

1. **新規 `src/ui/gtr/template.ts`** — GTR テンプレートの JS 表現
   ```typescript
   // ama の form.h GTR を JS 化。row 0..5 はテンプレ内の y、グループ ID は ama 内部値。
   // フィールドへの貼り付けは row=12-y, col=x で行う。
   export const GTR_TEMPLATE_HEIGHT = 6;
   export const GTR_TEMPLATE_GROUPS = [
     [0, 0, 0, 0, 0, 0],  // top
     [4, 4, 4, 0, 0, 0],
     [3, 3, 3, 4, 0, 0],
     [1, 2, 5, 0, 0, 0],
     [1, 1, 2, 5, 0, 0],
     [2, 2, 5, 0, 0, 0],  // bottom (row 5 in template = row 12-(6-1-5)=12 in field? need check)
   ];
   // → ama の dform 並びは「上→下」なので、フィールド行への貼り付け処理を
   //   調整する必要あり。form.h を再確認しつつ実装。
   ```
   ※ ama 内部のグループ ID は「色」ではなく抽象。色割り当ては Phase 2 で:
   - 案 a) 固定色: グループ 1=赤, 2=青, 3=黄, 4=緑(紫) など
   - 案 b) ツモ依存: 最初に出てきたペアの色を順に割り当て(本家っぽい)
   - とりあえず **案 a 固定色** で良い

2. **新規 `src/ui/hooks/useTrainerMode.ts`** — `useUiPrefs.ts` 同様のシングルトン+listener
   ```typescript
   export type TrainerMode = 'off' | 'gtr';
   const STORAGE_KEY = 'puyo.trainer.mode';
   // get / set / useTrainerMode hook
   ```

3. **`src/ui/components/Header/Header.tsx`** — トグル追加
   - 「ゴースト」の隣に「訓練: [off / GTR]」セレクタ

4. **`src/ui/hooks/useAiSuggestion.ts`** — TrainerMode が `gtr` のとき WasmAmaAI を `gtr` プリセットで再ロード
   - getWorker() のシングルトン管理が絡むので、worker に `set-ai` メッセージで preset 名も渡す

5. **`src/ai/worker/ai.worker.ts`** — `set-ai` で `kind: 'ama-wasm', preset: 'gtr'` を受け取れるように拡張
   - kind と preset の組合せでインスタンスを使い分け or 都度再 init

6. **`src/ui/components/Board/Board.tsx`** — 訓練モード ON のとき、テンプレを薄い枠線で描画
   - `drawConnectors` の前あたりに `drawGtrTemplate(ctx, cell)` を入れる
   - 各セルは「外枠だけ + 色名 1 文字 or 色付き半透明四角」程度

7. **訓練達成度メーター**(Stats 周辺に追加)
   - 計算ロジック: `template[r][c]` が非 0 のセルで、現在のフィールドが「同じグループ ID 同士で同色なら正解」と判定
   - 「正解セル / 期待セル数」を %表示
   - 案 a 固定色なら判定が単純: `field[r][c] === EXPECTED_COLOR_BY_GROUP[template[r][c]]`

8. **訓練終了条件**
   - GTR の主要セル(グループ 1〜5 の出現セル全部)が埋まったら「GTR 完成!」
   - 13 手経過 or ゲームオーバーで「未完成」

### Phase 2 で迷ったら聞きたいこと

- 色割り当ては固定色 OK か?(案 a / b)
- テンプレ表示のスタイル: 枠線のみ / 半透明色塗り / 文字
- 訓練終了後の挙動: 自動リセット / 通常モードに戻る / 結果ダイアログ

---

## 3. 着手順

1. `cd /Users/yasumitsuomori/git/ama` で Phase 1 から:
   1. config.json に `gtr` プリセット追加
   2. wasm_api.cpp に `ama_init_preset` 追加
   3. Makefile の EXPORTED_FUNCTIONS 更新
   4. `make wasm` → public/wasm へコピー(3 箇所:`public/wasm/{ama.js,ama.wasm}` + `src/ai/wasm-ama/_glue/ama.js`)
   5. wasm-loader.ts を `ama_init_preset` 呼び出しに変更
   6. dump-ama-weights.ts で値確認 (form=400 になってるか)
   7. eval-ai で `gtr` プリセットの ama-wasm を 1 ゲーム回し、c0/c4 などに偏らないか確認
2. Phase 2 の UI:
   1. `template.ts` で GTR テンプレ JS 化(form.h の dform をそのまま転記して row 反転)
   2. `useTrainerMode` hook
   3. Header トグル
   4. ai.worker.ts と useAiSuggestion.ts で preset 切替
   5. Board に template 描画追加
   6. 達成度メーター(Stats か新規 panel)

---

## 4. 注意点

- ama 側コミットは未 push(9 個先行)。GTR 関連も同 main に積むか、push 前にまとめるか判断必要。
- `ama_init` を破壊変更すると Vite dev で古い WASM がキャッシュされていると謎の挙動になる(これまで何度かハマった)。`location.reload(true)` 必須。
- form グループ ID の意味は ama 内部の評価関数 `form::evaluate` を実装で確認すべき(`ai/search/beam/form.cpp`)。固定色割り当てのパターンを揃えるための参考に。
- 訓練モードでは undo / reset の扱い:訓練中の reset は GTR モードを維持したまま新 seed か?要決定。
- 既存テスト 112/114 pass を壊さないこと。新規追加分(template, useTrainerMode)は小さくて壊しにくい。

---

## 5. 関連ファイルクイック参照

| Path | 役割 |
| --- | --- |
| `/Users/yasumitsuomori/git/ama/ai/search/beam/form.h` | GTR / SGTR / FRON / MERI のテンプレ定義 |
| `/Users/yasumitsuomori/git/ama/ai/search/beam/form.cpp` | form::evaluate 実装(JS 側で同等の判定をするなら参考) |
| `/Users/yasumitsuomori/git/ama/ai/search/beam/eval.cpp:17-35` | form ウェイトの使い方 |
| `/Users/yasumitsuomori/git/ama/config.json` | プリセット重み |
| `/Users/yasumitsuomori/git/ama/tools/wasm_api.cpp` | C ABI(ama_init / ama_suggest / ama_diag_*) |
| `/Users/yasumitsuomori/git/ama/Makefile` | EXPORTED_FUNCTIONS リスト |
| `src/ai/wasm-ama/wasm-loader.ts` | WASM ロード + ama_init 呼び出し |
| `src/ai/wasm-ama/wasm-ama-ai.ts` | WasmAmaAI クラス(suggest 実装) |
| `src/ai/worker/ai.worker.ts` | Worker 側の AI ディスパッチ |
| `src/ui/hooks/useAiSuggestion.ts` | フックと set-ai postMessage |
| `src/ui/hooks/useUiPrefs.ts` | ゴーストトグルの参考実装(同じパターンで TrainerMode 作る) |
| `src/ui/components/Header/Header.tsx` | セレクタ/トグルの追加先 |
| `src/ui/components/Board/Board.tsx` | テンプレ描画の追加先 |
| `scripts/dump-ama-weights.ts` | 重み読み出し検証スクリプト |
| `scripts/eval-ai.ts` | AI 比較ベンチ(--a heuristic --b ama-wasm) |
