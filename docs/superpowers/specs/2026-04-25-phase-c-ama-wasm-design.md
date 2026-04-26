# Phase C: ama WebAssembly 化 設計仕様

**作成日**: 2026-04-25
**ブランチ**: `feature/puyo-mvp`
**前提**: Phase 5c-1(ama 蒸留)完了、`ml-ama-v1` を ship 済み

## 1. ゴール

ama 本体(C++ + SSE 系 SIMD + 形パターン + beam search)を WebAssembly に変換しブラウザに直積載する。`ml-ama-v1`(蒸留)では届かなかった ama 級の強さ(13 連鎖ペース)を suggestion overlay として体験できる新 AI モード `ama (WASM)` を提供する。

## 2. スコープ

### 含む
- ama 側に Emscripten ビルド target と WASM 用 C ABI(`tools/wasm_api.cpp`)を追加
- puyo-simulator 側に WASM AI 実装(`src/ai/wasm-ama/`)を追加
- Header セレクタを 4 択に拡張(`heuristic` / `ml-v1` / `ml-ama-v1` / `ama-wasm`)
- PWA precache に `.wasm` を含める(初回ロード時に DL)
- ネイティブ ama との出力一致をゴールデンファイル比較で検証
- ama (MIT) のクレジット同梱

### 含まない
- ama 蒸留モデルの再学習 / 廃止(`ml-ama-v1` は 3 つ目の AI として継続)
- ama 上流(`/Users/yasumitsuomori/git/ama`)の fork(独立リポのまま運用)
- ama プリセットの動的切替(`build` 一本固定、`config.json` を embed)
- beam パラメータの UI スライダー(デフォルト固定)
- About モーダル / 専用クレジット画面(README + LICENSES/ で対応)

## 3. 確定済み設計判断(brainstorming Q&A)

| Q | 決定 | 理由 |
| --- | --- | --- |
| Q1 ama リポの管理 | A. ama リポ独立、`AMA_REPO` 参照、成果物のみ commit | 現状 dump_selfplay.cpp と整合、submodule の摩擦回避 |
| Q2 SIMD 戦略 | A. Emscripten emul ヘッダで素通し(`-msse4.1 -msimd128`) | ama の `_mm_*` 50+ 箇所を無変更で通せる、性能 1.5-2x 遅程度 |
| Q3 プリセット | A. `build` 一本、`config.json` を embed | YAGNI、5c-1 と一貫、後で増やすのも容易 |
| Q4 JS API | A. 単発 `suggest(state)` を 1 関数で(PuyoAI interface 準拠) | 既存 MlAI と同じ哲学、stateless で扱いやすい |
| Q5 ロード UX | C. ページロード時に常に preload(PWA precache) | 切替時の待ちなし、サイズ < 5MB なら policy-ama-v1 と同等の負担 |
| Q6 beam パラメータ | A. デフォルト(width=250, depth=16) | 強さ最重視、800ms 超なら縮小に fallback |
| Q7 Worker 統合 | A. 既存 `ai.worker.ts` に kind `'ama-wasm'` を追加 | selector ロジックそのまま延長、コスト最小 |
| Q8 検証 | A. ゴールデンファイル比較 + eval | 決定論的 ama だから完全一致で検証可能、SIMD バグ早期発見 |
| Q9 ライセンス | A. README + `LICENSES/ama-MIT.txt`(repo + public 両方) | 法的要件充足、UI 汚染なし |

## 4. アーキテクチャ全景

```
┌──────────────────────────────────────────────────────────────┐
│ ama リポ (/Users/yasumitsuomori/git/ama, MIT)                │
│                                                              │
│  core/{field,fieldbit,...} ── _mm_* (SSE2/4)                 │
│  ai/search/beam/{beam,eval} ── beam search + eval            │
│  config.json ── プリセット重み                               │
│                                                              │
│  + tools/wasm_api.cpp     (新規) JS から呼ぶ extern "C" API  │
│  + makefile target: wasm  (新規) emcc でビルド               │
└────────────────────┬─────────────────────────────────────────┘
                     │ emcc + emscripten emul SSE
                     ▼
              ama.wasm (~2-3MB) + ama.js (glue ~50KB)
                     │
                     │ build artifact
                     ▼
┌──────────────────────────────────────────────────────────────┐
│ puyo-simulator (.worktrees/puyo-mvp)                         │
│                                                              │
│  scripts/build-ama-wasm.sh    (新規) AMA_REPO で make wasm   │
│  public/wasm/ama.{wasm,js}    (新規) コミット成果物          │
│  public/LICENSES/ama-MIT.txt  (新規) MIT 全文                │
│  LICENSES/ama-MIT.txt         (新規) repo root にも          │
│                                                              │
│  src/ai/wasm-ama/             (新規)                         │
│   ├ wasm-ama-ai.ts        WasmAmaAI クラス (PuyoAI 準拠)     │
│   ├ wasm-loader.ts        .wasm の fetch + instantiate       │
│   └ types.ts              C ABI ⇄ TS 型定義                  │
│                                                              │
│  src/ai/worker/ai.worker.ts   (修正) kind 'ama-wasm' 追加    │
│  src/ai/ml/types.ts           (修正) AiKind に追加           │
│  src/ui/components/Header     (修正) 4-way セレクタ          │
│  src/ui/hooks/useAiSuggestion (修正) ロード状態の通知        │
│  vite.config.ts               (修正) PWA precache + .wasm    │
│                                                              │
│  scripts/eval-ai.ts           (修正) ama-wasm を AI 種別追加 │
│  scripts/gen-ama-golden.ts    (新規) golden file 生成        │
│  src/ai/wasm-ama/__tests__/   (新規) golden 比較テスト       │
│  README.md                    (修正) ama クレジット + 再ビルド手順 │
└──────────────────────────────────────────────────────────────┘
```

### 受け入れ基準(詳細はセクション 9.5)

| 指標 | gating |
| --- | --- |
| ama-native vs ama-wasm 同手率 | ≥ 95%(目標 99%) |
| 1 手レイテンシ(M1 Chrome) | < 3000ms(目標 1000ms 以下) |
| .wasm + .js サイズ | gating なし(実測ベース、PWA precache 上限を 16MB に緩和) |

### データフロー(1 手 suggestion)

1. ユーザー入力 → `useGameStore` を `useAiSuggestion(state)` が購読
2. シングルトン Worker (`ai.worker.ts`) に postMessage `{kind: 'ama-wasm', state}`
3. Worker が `WasmAmaAI.suggest(state)` を呼ぶ
4. `wasm-ama-ai.ts` が `state.field` を C ABI 形式(`uint8[78]` フラット)に変換、`current_pair`, `next_queue[2]` も渡す
5. WASM 内 `ama_suggest()` が `Field` を再構築 → `beam::search_multi(field, queue, weight_build)` → 最良 candidate を返す
6. JS 側で `{axisCol, rotation, score, expectedChain}` に整形
7. Worker が postMessage で main thread に返す
8. UI が overlay 表示

## 5. ama リポ側の変更

### 5.1 `tools/wasm_api.cpp`(新規)

JS から呼べる `extern "C"` API を 1 ファイルに集約。`dump_selfplay.cpp` と同様、ama 既存コードには触らない。

```cpp
#include <cstring>
#include <fstream>
#include <emscripten/emscripten.h>
#include "../core/core.h"
#include "../ai/search/beam/beam.h"
#include "../ai/search/beam/eval.h"
#include "../lib/nlohmann/json.hpp"

static beam::eval::Weight g_weight;
static bool g_inited = false;

extern "C" {

EMSCRIPTEN_KEEPALIVE
int ama_init() {
    std::ifstream f("config.json");  // --embed-file で埋め込み
    if (!f.good()) return -1;
    nlohmann::json js; f >> js;
    if (!js.contains("build")) return -2;
    from_json(js["build"], g_weight);
    g_inited = true;
    return 0;
}

// field_chars: 78 bytes (13 rows × 6 cols), 'R'/'B'/'Y'/'P'/'.' (ours convention, top-down)
// out: 8 bytes [axisCol, rotation, score(int32 LE), expectedChain, reserved]
EMSCRIPTEN_KEEPALIVE
int ama_suggest(
    const char* field_chars,
    char ca, char cc, char n1a, char n1c, char n2a, char n2c,
    uint8_t* out
) {
    if (!g_inited) return -1;

    auto to_ama = [](char c) -> cell::Type {
        switch (c) {
            case 'R': return cell::Type::RED;
            case 'Y': return cell::Type::YELLOW;
            case 'P': return cell::Type::GREEN;  // ours P == ama GREEN
            case 'B': return cell::Type::BLUE;
            default:  return cell::Type::NONE;
        }
    };

    Field field;
    for (int r = 0; r < 13; r++) {
        for (int c = 0; c < 6; c++) {
            cell::Type t = to_ama(field_chars[r * 6 + c]);
            if (t != cell::Type::NONE) {
                int y = 12 - r;  // ours r=0 top → ama y=12
                field.set_cell((i8)c, (i8)y, t);
            }
        }
    }

    cell::Queue q;
    q.push_back({to_ama(ca), to_ama(cc)});
    q.push_back({to_ama(n1a), to_ama(n1c)});

    auto result = beam::search_multi(field, q, g_weight);
    if (result.candidates.empty()) return -2;

    auto& best = result.candidates[0];
    int32_t score = (int32_t)best.score;

    out[0] = (uint8_t)best.placement.x;
    out[1] = (uint8_t)best.placement.r;
    out[2] = (uint8_t)(score & 0xFF);
    out[3] = (uint8_t)((score >> 8) & 0xFF);
    out[4] = (uint8_t)((score >> 16) & 0xFF);
    out[5] = (uint8_t)((score >> 24) & 0xFF);
    out[6] = 0;  // expectedChain: Candidate の該当フィールド有無で実装時決定。なければ 0 固定
    out[7] = 0;  // reserved

    return 0;
}

}
```

実装時の確認:
- `Candidate` 構造体に `expected_chain` 相当のフィールドがあれば `out[6]` に格納、無ければ 0 のまま
- `set_cell` のシグネチャと挙動を `core/field.h` で確認
- `n2` パラメータは現状 `cell::Queue` に渡していないが、beam 探索が 3 ペア先まで使う場合は `q.push_back({to_ama(n2a), to_ama(n2c)})` を追加。`dump_selfplay.cpp` の挙動を合わせる

### 5.2 `makefile` に WASM target 追加

```makefile
EMCC = emcc
EMCXXFLAGS = -DUNICODE -DNDEBUG -std=c++20 \
             -msse4.1 -msimd128 \
             -O3 -flto \
             -DEMSCRIPTEN

EMLDFLAGS = -s WASM=1 \
            -s MODULARIZE=1 \
            -s EXPORT_ES6=1 \
            -s ENVIRONMENT=web,worker \
            -s ALLOW_MEMORY_GROWTH=1 \
            -s INITIAL_MEMORY=33554432 \
            -s EXPORTED_FUNCTIONS='["_ama_init","_ama_suggest","_malloc","_free"]' \
            -s EXPORTED_RUNTIME_METHODS='["cwrap","ccall","HEAPU8"]' \
            -s EXPORT_NAME='AmaModule' \
            --embed-file config.json

wasm: makedir
	@$(EMCC) $(EMCXXFLAGS) $(SRC_DUMP) tools/wasm_api.cpp \
		$(EMLDFLAGS) -o bin/wasm/ama.js
```

`SRC_DUMP` (= `core/*.cpp ai/*.cpp ai/search/*.cpp ai/search/beam/*.cpp`) をそのまま再利用。生成物は `bin/wasm/ama.js` + `bin/wasm/ama.wasm`。

### 5.3 PEXT は無効でビルド

`-DPEXT` を付けない(makefile デフォルト挙動)。`core/def.h:49` の `_pext_u32` は `#ifdef PEXT` でガードされている前提。実装時にコードを確認、ガードが無ければ ama 側に小 patch(`#ifdef PEXT` 追加)を当てる。

### 5.4 SIMD intrinsic 互換性

| intrinsic | Emscripten 対応 | フォールバック |
| --- | --- | --- |
| `_mm_load_si128` / `_mm_store_si128` | ○ | - |
| `_mm_setzero_si128` / `_mm_set_epi16` | ○ | - |
| `_mm_and_si128` / `_mm_xor_si128` | ○ | - |
| `_mm_srli_si128` / `_mm_slli_si128` | ○ | - |
| `_mm_srli_epi16` / `_mm_slli_epi16` | ○ | - |
| `_mm_test_all_zeros` | ○(`-msse4.1`) | - |
| `_mm_testz_si128` / `_mm_testc_si128` | ○(`-msse4.1`) | - |

ama で使われている全 intrinsic は SSE4.1 までに収まり、Emscripten のエミュレーションヘッダで対応可能と想定。実装時にビルドエラーが出た intrinsic だけ `#ifdef EMSCRIPTEN` 分岐で局所的に書き直す。

## 6. puyo-simulator 側のビルドフロー

### 6.1 `scripts/build-ama-wasm.sh`(新規)

```bash
#!/usr/bin/env bash
set -euo pipefail

AMA_REPO="${AMA_REPO:-/Users/yasumitsuomori/git/ama}"
DEST_DIR="$(dirname "$0")/../public/wasm"

if [ ! -d "$AMA_REPO" ]; then
  echo "AMA_REPO not found at $AMA_REPO" >&2
  exit 1
fi
if ! command -v emcc >/dev/null 2>&1; then
  echo "emcc not found. Install with: brew install emscripten" >&2
  exit 1
fi

(cd "$AMA_REPO" && make wasm)

mkdir -p "$DEST_DIR"
cp "$AMA_REPO/bin/wasm/ama.wasm" "$DEST_DIR/"
cp "$AMA_REPO/bin/wasm/ama.js" "$DEST_DIR/"

echo "ama WASM built and copied to $DEST_DIR"
ls -lh "$DEST_DIR"
```

### 6.2 `package.json` script 追加

```json
{
  "scripts": {
    "build:ama-wasm": "bash scripts/build-ama-wasm.sh"
  }
}
```

### 6.3 README.md セクション追加

```markdown
## Bundled software

- [ama](https://github.com/citrus610/ama) (MIT) by citrus610 — bundled as
  WebAssembly under the `ama (WASM)` AI option. License: `LICENSES/ama-MIT.txt`.

## Rebuilding ama WASM (optional)

The `public/wasm/ama.{wasm,js}` artifacts are committed. To rebuild:

1. Install Emscripten: `brew install emscripten` (~5GB, 10-20 min)
2. Clone ama: `git clone https://github.com/citrus610/ama /path/to/ama`
3. `AMA_REPO=/path/to/ama npm run build:ama-wasm`
```

### 6.4 `public/wasm/` の git 管理

- 成果物 commit 方針(モデルファイルと同じ扱い)
- `.gitattributes` に `public/wasm/*.wasm binary` 追加(diff 抑制)
- `.gitignore` には追加しない

## 7. JS バインディング層

### 7.1 `src/ai/wasm-ama/types.ts`(新規)

```typescript
export interface AmaSuggestion {
  axisCol: number;        // 0-5
  rotation: number;       // 0-3
  score: number;          // ama 評価値 (int32)
  expectedChain: number;  // ama が想定する連鎖数 (0-19、未対応なら 0)
}

// C ABI バッファレイアウト(8 bytes、wasm_api.cpp と一致):
// [0]=axisCol, [1]=rotation, [2..5]=score(int32 LE), [6]=expectedChain, [7]=reserved
```

### 7.2 `src/ai/wasm-ama/wasm-loader.ts`(新規)

```typescript
import AmaModuleFactory from '/wasm/ama.js';

export interface AmaModule {
  ccall(name: string, retType: string | null, argTypes: string[], args: unknown[]): number;
  cwrap(name: string, retType: string | null, argTypes: string[]): (...args: unknown[]) => number;
  HEAPU8: Uint8Array;
  _malloc(n: number): number;
  _free(ptr: number): void;
}

let cached: Promise<AmaModule> | null = null;

export function loadAmaModule(): Promise<AmaModule> {
  if (!cached) {
    cached = (async () => {
      const Module = await AmaModuleFactory({
        locateFile: (path: string) =>
          path.endsWith('.wasm') ? '/wasm/ama.wasm' : path,
      });
      const initRet = Module.ccall('ama_init', 'number', [], []);
      if (initRet !== 0) {
        throw new Error(`ama_init failed: ${initRet}`);
      }
      return Module as AmaModule;
    })();
  }
  return cached;
}
```

Vitest 環境(Node)でも動かせるよう、`typeof window === 'undefined'` 分岐で `fs.readFileSync('/wasm/ama.wasm')` から `WebAssembly.instantiate` する fallback を入れる。実装時に Emscripten glue が Node 互換モードで自動対応するか確認、未対応なら手書き分岐。

### 7.3 `src/ai/wasm-ama/wasm-ama-ai.ts`(新規)

```typescript
import type { GameState, Move } from '../../game/types';
import type { PuyoAI } from '../puyo-ai';
import { loadAmaModule, type AmaModule } from './wasm-loader';

const FIELD_BYTES = 78;
const OUT_BYTES = 8;

export class WasmAmaAI implements PuyoAI {
  readonly version = 'ama-wasm-build-v1';

  private module: AmaModule | null = null;
  private suggestFn: ((...args: unknown[]) => number) | null = null;
  private fieldBuf = 0;
  private outBuf = 0;

  async ready(): Promise<void> {
    if (this.module) return;
    this.module = await loadAmaModule();
    this.suggestFn = this.module.cwrap(
      'ama_suggest',
      'number',
      ['number','number','number','number','number','number','number','number'],
    );
    this.fieldBuf = this.module._malloc(FIELD_BYTES);
    this.outBuf = this.module._malloc(OUT_BYTES);
  }

  async suggest(state: GameState): Promise<Move | null> {
    await this.ready();
    const m = this.module!;
    const heap = m.HEAPU8;

    for (let r = 0; r < 13; r++) {
      const row = state.field[r]!;
      for (let c = 0; c < 6; c++) {
        const cell = row[c];
        let ch = 46; // '.'
        if (cell === 'R') ch = 82;
        else if (cell === 'B') ch = 66;
        else if (cell === 'Y') ch = 89;
        else if (cell === 'P') ch = 80;
        heap[this.fieldBuf + r * 6 + c] = ch;
      }
    }

    const cur = state.current!;
    const n1 = state.nextQueue[0]!;
    const n2 = state.nextQueue[1]!;
    const code = (s: string) => s.charCodeAt(0);

    const ret = this.suggestFn!(
      this.fieldBuf,
      code(cur.axis), code(cur.child),
      code(n1.axis), code(n1.child),
      code(n2.axis), code(n2.child),
      this.outBuf,
    );
    if (ret !== 0) return null;

    return {
      axisCol: heap[this.outBuf + 0]!,
      rotation: heap[this.outBuf + 1]!,
    };
  }

  dispose(): void {
    if (this.module) {
      if (this.fieldBuf) this.module._free(this.fieldBuf);
      if (this.outBuf) this.module._free(this.outBuf);
      this.fieldBuf = 0;
      this.outBuf = 0;
    }
  }
}
```

ポイント:
- バッファ(`fieldBuf`, `outBuf`)は `ready()` で 1 回確保し再利用 → suggest ごとの malloc/free を回避
- `WasmAmaAI` は heuristic / ml と同じ `PuyoAI` interface に準拠
- 細かい score / expectedChain の読み出しは現状未使用(将来 UI で表示する余地)

### 7.4 reachability チェックの方針

ama は跨ぎ禁止(reachability)を考慮しない探索を返す可能性がある。実装時に以下を判断:

- (a) ours の `legalActionMask(state)` で WASM 出力を弾く必要があるか確認
- (b) 弾く必要があるなら、`wasm_api.cpp` 側で top-K(例: top-5)を返すように拡張、JS 側で reachability 通過する最初の手を選択
- (c) 必要なければ単発 best move のままで OK

実装初手は (a) を確認し、不足なら (b) に切り替える。

## 8. ブラウザ統合

### 8.1 `src/ai/ml/types.ts` または共通型

```typescript
export type AiKind = 'heuristic' | 'ml-v1' | 'ml-ama-v1' | 'ama-wasm';
```

### 8.2 `src/ai/worker/ai.worker.ts` 修正

```typescript
type Kind = AiKind;

const mlInstances: Partial<Record<'v1'|'ama-v1', MlAI>> = {};
let amaWasm: WasmAmaAI | null = null;
let heuristic: HeuristicAI | null = null;

async function getAi(kind: Kind): Promise<PuyoAI> {
  if (kind === 'heuristic') {
    return (heuristic ??= new HeuristicAI());
  }
  if (kind === 'ml-v1' || kind === 'ml-ama-v1') {
    const k = kind === 'ml-v1' ? 'v1' : 'ama-v1';
    return (mlInstances[k] ??= new MlAI(k));
  }
  if (kind === 'ama-wasm') {
    if (!amaWasm) {
      amaWasm = new WasmAmaAI();
      await amaWasm.ready();
    }
    return amaWasm;
  }
  throw new Error(`unknown kind: ${kind}`);
}
```

### 8.3 `src/ui/components/Header/Header.tsx` 修正

セレクタ option 追加:
```tsx
<option value="ama-wasm">ama (WASM)</option>
```

ロード状態は `useAiSuggestion` 経由で取得し、`ama-wasm` 選択かつ未 ready の間は suggestion overlay を「ama 読み込み中…」表示にする。Header 側はセレクタ追加のみ、ロード UI は overlay 側で完結。

### 8.4 `src/ui/hooks/useAiSuggestion.ts` 修正

- Worker からの `{type: 'ai-ready', kind}` メッセージで ready ステートを管理
- 現在の `aiKind` と `aiReady[kind]` を返り値に含める
- 既存 API(`suggestion`, `loading`)は維持、追加で `aiLoading` を露出

### 8.5 `vite.config.ts` PWA 設定修正

```typescript
VitePWA({
  workbox: {
    globPatterns: ['**/*.{js,css,html,wasm,bin,json}'],
    maximumFileSizeToCacheInBytes: 16 * 1024 * 1024,  // 16MB(.wasm を全許容)
  },
});
```

サイズ gating は設けない。`.wasm` のサイズが大きくなっても PWA precache に乗ることを優先する。

## 9. 検証 / テスト戦略

### 9.1 ゴールデンファイル生成(`scripts/gen-ama-golden.ts`)

ネイティブ ama を subprocess で動かし、各局面の (盤面, 現ペア, next×2) → (axisCol, rotation, score) を JSONL で保存。

```typescript
// CLI: npx tsx scripts/gen-ama-golden.ts --games 50 --seed 7777 \
//      --out src/ai/wasm-ama/__tests__/ama_golden.jsonl
//
// 各行: {gameId, moveIndex, field: string[13], current_axis, current_child,
//        next1_axis, next1_child, next2_axis, next2_child,
//        expected: {axisCol, rotation, score}}
```

実装方針: 既に `dump_selfplay.cpp` が同等の出力をしているので、その出力 JSONL から `topk[0]` を `expected` に整形するだけ。新規 C++ 不要、TypeScript で JSONL 変換。50 ゲームで ~2,000 局面、ファイルサイズ ~500KB(コミット可)。

### 9.2 Vitest 比較テスト(`src/ai/wasm-ama/__tests__/ama-golden.test.ts`)

```typescript
import { describe, it, expect, beforeAll } from 'vitest';
import { readFileSync } from 'node:fs';
import { WasmAmaAI } from '../wasm-ama-ai';

describe('ama WASM golden file', () => {
  const ai = new WasmAmaAI();
  beforeAll(async () => { await ai.ready(); });

  const lines = readFileSync('src/ai/wasm-ama/__tests__/ama_golden.jsonl', 'utf8')
    .trim().split('\n').map((l) => JSON.parse(l));

  it.each(lines.slice(0, 100))(
    'matches native ama at game $gameId move $moveIndex',
    async (row) => {
      const state = rowToGameState(row);
      const move = await ai.suggest(state);
      expect(move).toEqual({
        axisCol: row.expected.axisCol,
        rotation: row.expected.rotation,
      });
    },
  );

  it('full 2000 cases: axisCol/rotation match rate ≥ 99%', async () => {
    let match = 0;
    for (const row of lines) {
      const move = await ai.suggest(rowToGameState(row));
      if (move?.axisCol === row.expected.axisCol &&
          move?.rotation === row.expected.rotation) match++;
    }
    expect(match / lines.length).toBeGreaterThanOrEqual(0.99);
  });
});
```

完全一致(100%)を目指すが、稀に SIMD エミュレーションの誤差で 1 手ズレる可能性を許容して **gating は 95% 以上、目標は 99% 以上**に設定。失敗ケースが多ければ原因調査(具体的な intrinsic を `fieldbit` 単体テストで切り分け)。

### 9.3 eval-ai 拡張

`scripts/eval-ai.ts` の `AiKind` に `'ama-wasm'` を追加。

```bash
npm run eval -- --games 100 --seed 1 --a ama --b ama-wasm
# 期待: B/A ratio 0.95 - 1.05
```

`a ama` は subprocess でネイティブ実行、`b ama-wasm` は同 process で WASM 実行。Node 用 `wasm-loader` 分岐でロード。

### 9.4 ブラウザ手動確認

- `npm run dev` → ブラウザで `ama (WASM)` 選択
- 1 手レイテンシを `performance.now()` で計測 → コンソール出力
- 実測 3000ms 超過なら beam パラメータ調整(`tools/wasm_api.cpp` で `beam::Config{width: 150, depth: 12}` を渡す等。`beam::Config` の API シグネチャは実装時に確認)

### 9.5 強さ・サイズ・レイテンシの受け入れ基準

| 指標 | 目標 | gating |
| --- | --- | --- |
| ama-native vs ama-wasm 同手率 | ≥ 99% | ≥ 95% |
| 1 手レイテンシ(M1 Chrome) | < 1000ms | < 3000ms |
| .wasm + .js サイズ | (実測ベース、できれば小さい方が望ましい) | gating なし |
| eval ama vs ama-wasm B/A ratio | 0.98 - 1.02 | 0.95 - 1.05 |

サイズは強さ最優先の方針(Q5 = C で全員 precache を選択)に従い、上限は設けない。実測で 10MB を超えるようなら別途検討するが、ama 一式 + SIMD で 5MB 前後の見込み。

## 10. ライセンス対応

### 10.1 `LICENSES/ama-MIT.txt`(新規、リポルート)

ama リポの `LICENSE` ファイル全文をコピー。

### 10.2 `public/LICENSES/ama-MIT.txt`(新規)

同内容を Web ビルドに含める(URL `/LICENSES/ama-MIT.txt` でアクセス可能)。`vite.config.ts` の publicDir 経由で自動配信。

### 10.3 `README.md` に追記

セクション 6.3 に記載済み。

## 11. リスクと事前緩和策

| # | リスク | 影響 | 緩和策 |
| --- | --- | --- | --- |
| 1 | Emscripten で `_mm_testc_si128` などサポート外の intrinsic がある | ビルド失敗 | A 案で素通しビルドを試み、エラー出た intrinsic は fieldbit.cpp 内で `#ifdef EMSCRIPTEN` 分岐して spec 等価のスカラー版を書く(局所的) |
| 2 | `_pext_u32` が `#ifdef PEXT` で守られていない | ビルド失敗 | def.h を確認、未ガードなら ama 側に小 patch(`#ifdef PEXT` 追加) |
| 3 | golden 一致率が 95% を下回る | 強さ劣化 | SIMD 差分を bitfield 単体テストで隔離調査(`fieldbit_test.cpp` を WASM でも動かす) |
| 4 | 1 手レイテンシが 3000ms を超える | UX 悪化 | `beam::Config` を `{width: 150, depth: 12}` に縮小して再測。さらに駄目なら `{width: 100, depth: 10}` |
| 5 | .wasm のサイズが想定より大きく PWA precache のデフォルト上限(2MB)に乗らない | 初回ロード失敗 | `maximumFileSizeToCacheInBytes` を 16MB に緩めて全許容(サイズ gating は設けない方針) |
| 6 | Node の Vitest で WASM ロードが失敗する | テスト不能 | `wasm-loader.ts` に Node 環境用 fs ベースロード分岐 |
| 7 | ama upstream の更新で `tools/wasm_api.cpp` がビルド不可になる | 後日メンテコスト | ama 側変更は最小化(既存ヘッダのみ参照、Field/Beam 内部に触らない) |

## 12. オープン項目(plan 段階で詰める / 実装中に決める)

- `Candidate` 構造体に `expected_chain` 相当のフィールドが存在するか(無ければ `out[6] = 0` で固定、UI 表示も省く)
- `WasmAmaAI.suggest` から返す `Move` の reachability チェックが必要か(必要なら `wasm_api.cpp` 側で top-K を返す方針に変更)
- `beam::Config` の API シグネチャと、`build` 重みでの実測レイテンシ
- Vitest で WASM をロードする際の Emscripten Node 互換モードの動作確認

## 13. 実装の大まかな順序(plan で task 分解)

1. ama 側 WASM ビルドの最小再現(`make wasm` が通ることを確認、core 部分だけでも先に試す)
2. `tools/wasm_api.cpp` 実装、ama_init / ama_suggest が動くことを ama 側 C++ console テストで確認
3. `scripts/build-ama-wasm.sh` + `public/wasm/` への配置と commit
4. `AiKind` 共通型に `'ama-wasm'` を追加(`src/ai/ml/types.ts` など)
5. `wasm-loader.ts` + `wasm-ama-ai.ts` の最小実装(Node 上の Vitest で `suggest()` 呼び出し成功)
6. `scripts/gen-ama-golden.ts` + golden ファイル生成(50 ゲーム、~2,000 局面)
7. ゴールデンファイル比較テスト追加、同手率 ≥ 95% を gating
8. `eval-ai.ts` に `ama-wasm` 種別追加、`ama` vs `ama-wasm` の B/A ratio 確認
9. `ai.worker.ts` に kind `'ama-wasm'` 追加(統合)
10. Header の 4-way セレクタ + `useAiSuggestion` のロード状態通知
11. `vite.config.ts` PWA precache のサイズ上限緩和、`.wasm` を globPatterns に追加
12. `LICENSES/ama-MIT.txt` 配置 + README 追記
13. ブラウザ手動確認、レイテンシ実測、必要なら beam パラメータ調整
14. PR 用に最終 polish(コメント整理、不要 import 削除)

## 14. 完了条件(Done definition)

- [ ] `public/wasm/ama.{wasm,js}` がビルドされ commit されている
- [ ] `LICENSES/ama-MIT.txt` と `public/LICENSES/ama-MIT.txt` が配置されている
- [ ] README に ama クレジットと再ビルド手順が記載されている
- [ ] `npm test` で golden 比較テストが pass(同手率 ≥ 95%)
- [ ] `npm run eval -- --a ama --b ama-wasm --games 100` で B/A ratio が 0.95-1.05
- [ ] ブラウザ手動確認で 1 手レイテンシ < 3000ms
- [ ] `npm run build` が成功し、PWA precache に `.wasm` が含まれる
- [ ] 4-way セレクタが動作し、ama-wasm 選択時の suggestion overlay が機能
