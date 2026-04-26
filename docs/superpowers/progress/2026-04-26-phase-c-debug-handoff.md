# Phase C デバッグ引き継ぎ (2026-04-26)

post-compact 後でも続きが即再開できるよう、Phase C(ama WASM)の現状・課題・次にやることをまとめる。

---

## 1. これまでの成果(Phase C 完了部分)

### 動作確認済み
- ama を Emscripten で WASM ビルド成功(`public/wasm/ama.wasm` 277K + glue 69K)
- ブラウザの 4 択 AI セレクタに `ama (WASM)` を追加 → ロード・初期化が通る
- WASM 初期化ログが期待通り出る:
  ```
  [ama-wasm] step 1-5 で glue を fetch + Blob URL 経由で import
  [ama-wasm] WASM instantiated in ~13ms
  [ama-wasm] ama_init returned 15 (weight keys) in ~3ms
  [ama-wasm worker] init() done in ~20ms
  ```
- PWA precache に `.wasm` を含む production build が成功
- ロード中は AI suggestion を停止、`ama-wasm 読み込み中…` 表示
- ぷよぷよ通信(eスポーツ)ルールに切替(reachability rule 削除済み)
- `lockActive` を「列満タンなら null → gameover」に修正(無限破棄 bug 修正)

### コミット履歴(直近)
puyo-simulator (feature/puyo-mvp):
- `a3622ac` debug(wasm-ama): log per-column heights for diagnosis
- `bfaf4db` fix(game): treat full column as game-over instead of silent puyo drop
- `d2afad0` feat(rules): switch to Puyo eSports rules — drop reachability check
- `aba3c9e` fix(wasm-ama): detect worker context as browser, not node
- `3f02be7` fix(wasm-ama): fetch glue from /wasm/ama.js, bypassing Vite entirely
- `bd7ea1a` Initial commit ... 全 30 commit

ama (main, /Users/yasumitsuomori/git/ama):
- `fc5fd90` debug(wasm): return weight key count from ama_init
- `9940346` fix(wasm): sequentialize search_multi for std::thread-less builds
- `5d9c9bd` build(wasm): exception catching + single-thread search for browser
- `fe80df9` build(wasm): emcc compatibility fixes (x86intrin->smmintrin, json.hpp auto*)

---

## 2. 現在の主要課題(=次セッションの目標)

### 致命バグ:WasmAmaAI が native ama と挙動が違う

| 指標 | Native ama (dump_selfplay binary) | WasmAmaAI (Node eval) |
| --- | --- | --- |
| seed=1 1 ゲーム max_chain | **14** | **1** |
| 最終 score | 357,940 | 40 |
| プレイ手数 | 200 (cap) | 7(gameover で終了) |

**`tools/wasm_api.cpp` 経由で同じ ama コードを呼んでいるはずなのに、強さが桁違いに違う。**

### 観察された具体的な異常挙動

ブラウザ console log(seed=1):
```
heights=0,0,0,0,0,0 cur=RP n1=YR -> moves= c0r0,c0r2,c4r1,c0r1,c1r2
heights=0,0,0,0,0,0 cur=RY n1=PY -> moves= c0r2,c0r0,c5r3,c1r0,c1r3
heights=2,0,0,0,0,0 cur=PY n1=YY -> moves= c0r2,c4r2,c4r1,c4r0,c5r2
```

- **空盤面**(heights=0) で cur が違うと違う手を返す → ama の探索は色情報を見ている
- ただし **常に列 0(c0)を 1 番目に推す**(列 1, 2, 3, 4, 5 は候補に入らない)
- `heights=2,0,0,0,0,0` でも `c0r2` を 1 番目 → さらに列 0 に積み重ねる
- 7 手で列 0 が満タンに到達 → gameover

### user 提案の有力仮説(未検証)

> **ama が「現在の盤面が空」だと思って動いている可能性**

これが正しければ、ama-wasm は毎回「空盤面に最適な手」(つまり c0 系)を返し続け、観察と一致する。

検証方法:
- WasmAmaAI が ama に渡す **`field_chars` を WASM 内で読み戻して JS にダンプ** → ours の field と一致するか確認
- または ama 内部の `field.get_height(x)` の戻り値を log

---

## 3. 想定される根本原因(優先順位順)

### 仮説 A:ama が field を空と認識している(user 提案、最有力)

`tools/wasm_api.cpp` の `ama_suggest()` 内で:
```cpp
Field field;
for (int r = 0; r < 13; r++) {
    for (int c = 0; c < 6; c++) {
        cell::Type t = to_ama(field_chars[r * 6 + c]);
        if (t != cell::Type::NONE) {
            int y = 12 - r;
            field.set_cell((i8)c, (i8)y, t);
        }
    }
}
```

- JS 側で書く byte と ama 側で読む byte がずれてる(エンディアン、layout)
- `set_cell((i8)c, (i8)y, t)` の引数順を ama が違う意味で受け取る
- emscripten の SSE emul で `Field.data[]` の bitfield が壊れる
- WASM linear memory の特性で、`field` ローカル変数の初期化が完全でない

### 仮説 B:`g_weight` の値が壊れている

`ama_init returned 15 (weight keys)` で **キー数は正しい**が、各 weight の **値**が壊れている可能性。
- `from_json(js["build"], g_weight)` の dispatch が emscripten で壊れる(-fexceptions 関連)
- weight が全部 0 → 評価関数が「適当な手を最初に返す」(c0 r0 が早期に enumeration)

検証:`g_weight.chain` の値を ama 側から返す診断 API を追加。

### 仮説 C:逐次化した search_multi のロジックバグ

`__EMSCRIPTEN__` 分岐で thread → for 逐次に変更:
```cpp
for (auto i = 0; i < beam::BRANCH; ++i) {
    auto b = beam::search(field, queues[i], w, configs);
    // c1.score += c2.score for matching placements
}
```

理論上 thread 版と同じだが、もしかして:
- thread 版は **score の累積順序**で結果が変わる(同 placement で += が同期非保証)
- **race condition で偶然 14 連鎖を出していた**(deterministic 逐次 = 最弱)

検証:thread 版を **WASM で動かす**(Emscripten pthread + SharedArrayBuffer)、または逐次版に **branch 順 shuffle** を加えて結果比較。

### 仮説 D:n2 ペアを渡していない

私の wasm_api.cpp:
```cpp
q.push_back({to_ama(ca), to_ama(cc)});  // current
q.push_back({to_ama(n1a), to_ama(n1c)});  // next1
// (void)n2a; (void)n2c;  ← 渡していない
```

dump_selfplay でも同じく 2 ペアだが、念のため n2 も `q.push_back` してみる。

---

## 4. 次のセッションで最初にやること

### Step 1: 同一 seed で native ama と WasmAmaAI のステップ追跡

user 提案:
> 同一のシードで一手ずつ現在の盤面と評価値を見比べられるようにしたら調査できると思う

実装:
1. **dump_selfplay** を seed=1 / topk=5 で実行 → 各手の (field, current, top-5 candidates with scores) を取得(既に `/tmp/ama-golden-7777.jsonl` 形式で取れる)
2. **WasmAmaAI** に同じ field, current を渡して suggest → top-5 candidates を取得
3. 一致するか比較。何手目から、どの程度ズレるか観察

スクリプト案:`scripts/compare-ama-vs-wasm.ts`(新規)
```typescript
// 1. dump_selfplay で seed=1 1 ゲーム生成 → /tmp/ama-trace.jsonl
// 2. trace の各 row について:
//    - WasmAmaAI で同じ field, current で suggest
//    - native の top-1 と WasmAmaAI の top-1 が一致するか
//    - 一致しない手の盤面+両方の top-5 を出力
// 3. 集計:同手率、最初に違いが出た手番
```

### Step 2: 仮説 A 検証 — ama 側で field の状態を JS に dump

`tools/wasm_api.cpp` に診断 API 追加:
```cpp
EMSCRIPTEN_KEEPALIVE
int ama_get_height(int col) {
    if (!g_inited || col < 0 || col >= 6) return -1;
    // 直前の suggest 呼び出しで使われた field の高さを返す
    // → field を global に保持する必要あり、または ama_suggest_with_dump を作る
}

// または、suggest と同時に heights を out buffer に書く版を作る
EMSCRIPTEN_KEEPALIVE
int ama_suggest_with_diag(/* 既存の引数 */, uint8_t* heights_out /* 6 bytes */) {
    // ... 通常の suggest 処理 ...
    // 加えて field.get_heights(heights_out) を埋める
}
```

JS 側で受け取って console に出す:
```typescript
console.log('[wasm-ama] ama-side heights:', heightsOut);
```

ours 側 heights と一致するか確認。一致しなければエンコードバグ確定。

### Step 3: 仮説 B 検証 — weight の値を ama 側で確認

```cpp
EMSCRIPTEN_KEEPALIVE
int ama_get_weight_chain() { return (int)g_weight.chain; }
EMSCRIPTEN_KEEPALIVE
int ama_get_weight_link2() { return (int)g_weight.link_2; }
```

JS で呼んで、`config.json` の値(chain=1000, link_2=150 等)と比較。

### Step 4: 仮説 C 検証 — thread vs sequential の結果比較

ローカル ama (native) で:
- a) `search_multi` thread 版でゲーム実行
- b) `search_multi` 逐次版(`__EMSCRIPTEN__` を強制 define)で同じ seed で実行
- 結果が違えば、逐次化が原因確定

これは ama 側の Makefile に `BUILD=sequential` のような flag を追加して切替可能にする。

---

## 5. 調査の進めるためのインフラ(既に揃っている)

### Chrome DevTools MCP
user が `/plugin install chrome-devtools-mcp` 済み。私から:
- `mcp__plugin_chrome-devtools-mcp_chrome-devtools__new_page` で localhost を開く
- `evaluate_script` で zustand store にアクセス可能(`window.__store__` 経由)
- console messages を read できる

### Zustand store の dev expose
`src/ui/store.ts` 末尾:
```typescript
if (import.meta.env.DEV && typeof window !== 'undefined') {
  (window as unknown as { __store__: typeof useGameStore }).__store__ = useGameStore;
}
```

ブラウザ console から:
```js
__store__.getState().reset(1);  // seed=1 で reset
__store__.getState().game.field.cells;  // 現在の盤面
__store__.getState().history.length;  // turn 数
```

### eval-ai (Node 上での確認)
```bash
npm run eval -- --games 1 --seed 1 --a heuristic --b ama-wasm
# → ama-wasm avg score: 40, max-chain mean: 1.00 (現状)
```

### 既存の debug ログ(suggest ごと)
`src/ai/wasm-ama/wasm-ama-ai.ts:99` あたりに:
```typescript
console.log(
  `[wasm-ama] heights=${colHeights.join(',')} cur=${cur.axis}${cur.child} n1=${n1.axis}${n1.child} -> moves=`,
  moves.map((m) => `c${m.axisCol}r${m.rotation}`).join(','),
);
```

---

## 6. 重要なファイル

### 修正の中心
| Path | 役割 |
| --- | --- |
| `/Users/yasumitsuomori/git/ama/tools/wasm_api.cpp` | C ABI(`ama_init`, `ama_suggest`)。診断 API 追加対象 |
| `/Users/yasumitsuomori/git/ama/ai/search/beam/beam.cpp` | `__EMSCRIPTEN__` 分岐で逐次化済み |
| `src/ai/wasm-ama/wasm-ama-ai.ts` | WasmAmaAI 実装、debug log 入り |
| `src/ai/wasm-ama/wasm-loader.ts` | fetch + Blob URL ローダー |
| `src/ai/worker/ai.worker.ts` | Worker、ama-wasm kind 対応 |
| `src/ui/store.ts` | reachability 削除 + null on full + dev store expose |
| `src/game/landing.ts` | `lockActive` が null on full |
| `src/game/state.ts` | `commitMove` も null チェック |
| `src/game/moves.ts` | hardDrop も null チェック |

### 成果物
- `public/wasm/ama.wasm`(277K)
- `public/wasm/ama.js`(69K、glue)
- `src/ai/wasm-ama/_glue/ama.js`(gitignore、Node テスト用)

### Plan / Spec
- spec: `docs/superpowers/specs/2026-04-25-phase-c-ama-wasm-design.md`
- plan: `docs/superpowers/plans/2026-04-25-phase-c-ama-wasm.md`
- run report: `docs/superpowers/progress/2026-04-25-phase-c-run.md`(初期版、現状の bug 反映前)

---

## 7. 次のセッション開始フロー

1. `git log --oneline -15` で最新確認
2. このメモを読む
3. user に進めたい方向を確認:
   - **A. デバッグ続行**(仮説 A → B → C の順に diagnose、最有力は仮説 A = field 認識ズレ)
   - **B. ama-wasm を ship 中止** → セレクタから外し、ml-ama-v1 のみで運用
   - **C. 別フェーズへ pivot**(デプロイ、5c-2 RL、追加データ収集など)
4. A を選んだ場合:Step 1 の `compare-ama-vs-wasm.ts` 実装から開始

---

## 8. 想定される結末

### Best case
仮説 A or B が当たり → `wasm_api.cpp` 修正で native ama と同等の挙動 → 13-14 連鎖発火 → Phase C 完了

### Middle case
仮説 C(逐次化バグ)→ branch 順 shuffle で改善するが native 等価には届かない → ama-wasm = native の 70% 強度で ship

### Worst case
emscripten の WASM 実行環境が ama の SIMD/exception/etc に対応しきれない → ship 中止 → ml-ama-v1(蒸留)のみで運用

---

## 9. 関連リンク

- 全体 context: `docs/superpowers/progress/2026-04-25-context-recap.md`
- Phase C spec/plan/run report は section 6 参照
- ama リポ: `/Users/yasumitsuomori/git/ama`(別 repo, MIT, citrus610)
- dev server は user が管理(`npm run dev`)
- chrome-devtools-mcp プラグイン install 済み
