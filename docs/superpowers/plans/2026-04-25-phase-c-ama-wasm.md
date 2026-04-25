# Phase C: ama WebAssembly 化 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Compile ama (C++ Puyo AI) to WebAssembly so the browser can run beam search at near-native strength as a 4th AI option (`ama (WASM)`).

**Architecture:** Build ama with Emscripten emulation headers (`-msse4.1 -msimd128`), expose a single `ama_suggest()` C ABI that returns top-K candidates, load it from the existing singleton AI Worker, and ship the .wasm artifact via PWA precache.

**Tech Stack:** Emscripten 5.x, C++20, WebAssembly SIMD128, TypeScript 5, Vitest 4, vite-plugin-pwa.

---

## Repos involved

- `puyo-simulator` worktree: `/Users/yasumitsuomori/git/puyo-simulator/.worktrees/puyo-mvp` (this worktree)
- `ama` repo: `/Users/yasumitsuomori/git/ama` (separate git repo, MIT license)

ama-side changes commit to ama's git history. puyo-simulator commits stay in `feature/puyo-mvp`.

## Prerequisites (one-time setup)

- [ ] **P1: Install Emscripten**

```bash
brew install emscripten
emcc --version
```

Expected: prints `emcc (Emscripten gcc/clang-like replacement) 5.x.x`. Installation is ~5GB and takes 10-20 min.

If `brew install` fails, ask the user — do not try alternative install paths without explicit guidance.

- [ ] **P2: Verify ama repo exists**

```bash
ls /Users/yasumitsuomori/git/ama/core/def.h
```

Expected: file exists. If not, ask the user to clone ama (`git clone https://github.com/citrus610/ama /Users/yasumitsuomori/git/ama`).

---

## Task 1: ama 側 PEXT ガード確認

**Files:**
- Inspect: `/Users/yasumitsuomori/git/ama/core/def.h`

- [ ] **Step 1: PEXT が `#ifdef PEXT` で守られているか確認**

```bash
grep -n "_pext_\|#ifdef PEXT" /Users/yasumitsuomori/git/ama/core/def.h
```

Expected output:
```
48:#ifdef PEXT
49:    return _pext_u32(u32(input), u32(mask));
```

If the grep shows the `#ifdef PEXT` guard, PEXT is properly gated and Task 1 is done — proceed to Task 2.

If the grep does NOT show `#ifdef PEXT` before line 49, you must add the guard. Edit `core/def.h` to wrap the PEXT branch in `#ifdef PEXT` / `#else` / `#endif` (provide a non-PEXT scalar fallback that returns `pdep_emul_u32(input, mask)` semantics — the existing else-branch should already exist; if so, do nothing).

- [ ] **Step 2: ネイティブビルドが通ることを確認(回帰防止)**

```bash
cd /Users/yasumitsuomori/git/ama && make dump_selfplay
```

Expected: builds `bin/dump_selfplay/dump_selfplay.exe` without errors. If this already worked before this plan, it should still work.

---

## Task 2: ama 側 tools/wasm_api.cpp 実装

**Files:**
- Create: `/Users/yasumitsuomori/git/ama/tools/wasm_api.cpp`

- [ ] **Step 1: Candidate 構造体の field 名を確認**

```bash
sed -n '15,40p' /Users/yasumitsuomori/git/ama/ai/search/beam/beam.h
```

Note the fields available on `Candidate` — at minimum `placement.x`, `placement.r`, `score`. If a chain-prediction field exists (e.g. `expected_chain`, `chain_count`), record its name; if not, the wasm API will leave that byte 0.

- [ ] **Step 2: wasm_api.cpp を新規作成**

Create `/Users/yasumitsuomori/git/ama/tools/wasm_api.cpp`:

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

static cell::Type to_ama(char c) {
    switch (c) {
        case 'R': return cell::Type::RED;
        case 'Y': return cell::Type::YELLOW;
        case 'P': return cell::Type::GREEN;  // ours P == ama GREEN
        case 'B': return cell::Type::BLUE;
        default:  return cell::Type::NONE;
    }
}

extern "C" {

EMSCRIPTEN_KEEPALIVE
int ama_init() {
    std::ifstream f("config.json");
    if (!f.good()) return -1;
    nlohmann::json js; f >> js;
    if (!js.contains("build")) return -2;
    from_json(js["build"], g_weight);
    g_inited = true;
    return 0;
}

// field_chars: 78 bytes (13 rows × 6 cols), 'R'/'B'/'Y'/'P'/'.' (ours convention, top-down)
// out: 40 bytes = 5 candidates × 8 bytes each
//   per candidate: [axisCol, rotation, score(int32 LE), expectedChain, reserved]
// returns: number of candidates written (0..5), or negative on error
EMSCRIPTEN_KEEPALIVE
int ama_suggest(
    const char* field_chars,
    char ca, char cc, char n1a, char n1c, char n2a, char n2c,
    uint8_t* out
) {
    if (!g_inited) return -1;

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
    // n2a/n2c are accepted in the C ABI for forward compatibility but the
    // beam consumes 2 ply, so we only push 2 pairs. To extend, push n2 here.
    (void)n2a; (void)n2c;

    auto result = beam::search_multi(field, q, g_weight);
    int n = (int)result.candidates.size();
    if (n == 0) return -2;
    if (n > 5) n = 5;

    for (int i = 0; i < n; i++) {
        auto& cand = result.candidates[i];
        int32_t score = (int32_t)cand.score;
        uint8_t* p = out + i * 8;
        p[0] = (uint8_t)cand.placement.x;
        p[1] = (uint8_t)cand.placement.r;
        p[2] = (uint8_t)(score & 0xFF);
        p[3] = (uint8_t)((score >> 8) & 0xFF);
        p[4] = (uint8_t)((score >> 16) & 0xFF);
        p[5] = (uint8_t)((score >> 24) & 0xFF);
        p[6] = 0;  // expectedChain placeholder (set if Candidate has the field; else 0)
        p[7] = 0;  // reserved
    }
    return n;
}

}
```

If Task 2 Step 1 found a chain-prediction field on `Candidate` (e.g. `cand.expected_chain`), set `p[6] = (uint8_t)cand.expected_chain;` instead of 0. If not, leave 0.

- [ ] **Step 3: Commit ama-side change**

```bash
cd /Users/yasumitsuomori/git/ama
git add tools/wasm_api.cpp
git commit -m "feat(tools): wasm_api.cpp for browser bindings"
```

---

## Task 3: ama 側 makefile に wasm target 追加

**Files:**
- Modify: `/Users/yasumitsuomori/git/ama/makefile`

- [ ] **Step 1: makefile に wasm target を追加**

Open `/Users/yasumitsuomori/git/ama/makefile` and append at the end (after the existing `clean:` target):

```makefile

EMCC = emcc
EMCXXFLAGS = -DUNICODE -DNDEBUG -std=c++20 \
             -msse4.1 -msimd128 \
             -O3 -flto \
             -DEMSCRIPTEN

EMLDFLAGS = -s WASM=1 \
            -s MODULARIZE=1 \
            -s EXPORT_ES6=1 \
            -s ENVIRONMENT=web,worker,node \
            -s ALLOW_MEMORY_GROWTH=1 \
            -s INITIAL_MEMORY=33554432 \
            -s EXPORTED_FUNCTIONS='["_ama_init","_ama_suggest","_malloc","_free"]' \
            -s EXPORTED_RUNTIME_METHODS='["cwrap","ccall","HEAPU8"]' \
            -s EXPORT_NAME='AmaModule' \
            --embed-file config.json

wasm: makedir
	@mkdir -p bin/wasm
	@$(EMCC) $(EMCXXFLAGS) $(SRC_DUMP) tools/wasm_api.cpp \
		$(EMLDFLAGS) -o bin/wasm/ama.js
```

Notes:
- `SRC_DUMP` already includes `core/*.cpp ai/*.cpp ai/search/*.cpp ai/search/beam/*.cpp` — reuse it.
- `ENVIRONMENT=web,worker,node` makes the glue runnable in the Vitest Node environment.
- `--embed-file config.json` bakes the preset weights into the .wasm so JS does not need to fetch them.

Also update the `.PHONY` line near the top of the file (currently `.PHONY: all puyop test clean makedir dump_selfplay`) to add `wasm`:

```makefile
.PHONY: all puyop test clean makedir dump_selfplay wasm
```

- [ ] **Step 2: Commit makefile change**

```bash
cd /Users/yasumitsuomori/git/ama
git add makefile
git commit -m "build: makefile wasm target via emcc"
```

---

## Task 4: ama 側 emcc でビルド成功確認

**Files:**
- (no source changes unless intrinsics fail to compile)

- [ ] **Step 1: emcc でビルド実行**

```bash
cd /Users/yasumitsuomori/git/ama && make wasm 2>&1 | tee /tmp/ama-wasm-build.log
```

Expected: produces `bin/wasm/ama.wasm` and `bin/wasm/ama.js` with no errors.

- [ ] **Step 2: 成果物サイズを確認**

```bash
ls -lh /Users/yasumitsuomori/git/ama/bin/wasm/
```

Expected: `ama.wasm` 1-5 MB, `ama.js` 30-100 KB. If sizes are wildly off (0 bytes, or > 20MB), inspect the log.

- [ ] **Step 3: ビルドエラーが出た intrinsic への対応**

If Step 1 failed with "use of undeclared identifier '_mm_xxx'" or similar, you have a SIMD intrinsic Emscripten does not emulate. Strategy:

1. Identify the failing intrinsic (e.g. `_mm_testc_si128`).
2. Open the source file (e.g. `core/fieldbit.cpp`).
3. Wrap that single intrinsic in `#ifdef __EMSCRIPTEN__` / `#else` / `#endif` and replace with a scalar fallback that returns the same bit-level result.

Example template (do not copy literally — adapt to the failing intrinsic):

```cpp
#ifdef __EMSCRIPTEN__
// Scalar fallback for intrinsic X
{ scalar code with the same semantics }
#else
return _mm_xxx(args);
#endif
```

After each fix, re-run `make wasm` until it builds. Each fix is a separate commit on the ama side:

```bash
cd /Users/yasumitsuomori/git/ama
git add core/<file>
git commit -m "build(wasm): scalar fallback for _mm_<intrinsic>"
```

- [ ] **Step 4: ama-side push (optional but recommended)**

```bash
cd /Users/yasumitsuomori/git/ama
git log --oneline -5
git status
```

If the user has a fork to push to, push there. Otherwise leave the ama-side commits local.

---

## Task 5: build-ama-wasm.sh + package.json script

**Files:**
- Create: `scripts/build-ama-wasm.sh`
- Modify: `package.json`

- [ ] **Step 1: ビルドスクリプトを新規作成**

Create `scripts/build-ama-wasm.sh`:

```bash
#!/usr/bin/env bash
set -euo pipefail

AMA_REPO="${AMA_REPO:-/Users/yasumitsuomori/git/ama}"
DEST_DIR="$(cd "$(dirname "$0")/.." && pwd)/public/wasm"

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

- [ ] **Step 2: 実行権限を付与**

```bash
chmod +x scripts/build-ama-wasm.sh
```

- [ ] **Step 3: package.json に script 追加**

Open `package.json`. In the `"scripts"` object, add:

```json
"build:ama-wasm": "bash scripts/build-ama-wasm.sh",
```

Place it alphabetically near the other `build:*` scripts. Verify with `cat package.json | grep build:ama-wasm`.

- [ ] **Step 4: スクリプトが動くことを確認**

```bash
npm run build:ama-wasm
```

Expected: `ama WASM built and copied to .../public/wasm/` followed by `ls -lh` showing `ama.wasm` and `ama.js`.

- [ ] **Step 5: Commit**

```bash
git add scripts/build-ama-wasm.sh package.json
git commit -m "build(scripts): ama WASM build wrapper"
```

---

## Task 6: .gitattributes + 成果物 public/wasm/ コミット

**Files:**
- Modify: `.gitattributes` (or create if missing)
- Add: `public/wasm/ama.wasm`, `public/wasm/ama.js` (artifacts from Task 5)

- [ ] **Step 1: .gitattributes 確認 / 追加**

```bash
ls .gitattributes 2>/dev/null && cat .gitattributes
```

If `.gitattributes` exists, append the line below. If it doesn't exist, create it with just that line:

```
public/wasm/*.wasm binary
```

- [ ] **Step 2: 成果物のサイズを確認**

```bash
ls -lh public/wasm/
```

Expected: `ama.wasm` ~1-5 MB, `ama.js` ~30-100 KB. These were generated in Task 5.

- [ ] **Step 3: Commit artifacts**

```bash
git add .gitattributes public/wasm/ama.wasm public/wasm/ama.js
git commit -m "build(wasm): commit ama.wasm artifact"
```

---

## Task 7: AiKind 共通型を src/ai/types.ts に追加

**Files:**
- Modify: `src/ai/types.ts`
- Modify: `src/ai/worker/ai.worker.ts`
- Modify: `src/ui/hooks/useAiSuggestion.ts`
- Modify: `src/ui/components/Header/Header.tsx`

(注: 共通型を導入する DRY タスク。Worker と Header の挙動変更は後続タスクで。)

- [ ] **Step 1: 現状の AiKind 定義箇所を確認**

```bash
grep -rn "type Kind = " src/
```

Expected: 3 places (`worker/ai.worker.ts`, `hooks/useAiSuggestion.ts`, `components/Header/Header.tsx`) all defining `Kind = 'heuristic' | 'ml-v1' | 'ml-ama-v1'`.

- [ ] **Step 2: src/ai/types.ts に AiKind を追加**

Open `src/ai/types.ts`. Append (or insert near the top, after existing imports/types):

```typescript
export type AiKind = 'heuristic' | 'ml-v1' | 'ml-ama-v1' | 'ama-wasm';
```

If `AiKind` already exists with different members, replace its body with the line above.

- [ ] **Step 3: ai.worker.ts でローカル Kind を消して共通型を import**

Open `src/ai/worker/ai.worker.ts`. Replace `type Kind = 'heuristic' | 'ml-v1' | 'ml-ama-v1';` with:

```typescript
import type { AiKind as Kind } from '../types';
```

(Local alias `Kind` keeps the rest of the file unchanged. The new value `'ama-wasm'` will be handled in Task 13.)

- [ ] **Step 4: useAiSuggestion.ts も同様**

Open `src/ui/hooks/useAiSuggestion.ts`. Replace `type Kind = 'heuristic' | 'ml-v1' | 'ml-ama-v1';` with:

```typescript
import type { AiKind as Kind } from '../../ai/types';
```

- [ ] **Step 5: Header.tsx も同様、VALID 配列も更新**

Open `src/ui/components/Header/Header.tsx`. Replace:

```typescript
type Kind = 'heuristic' | 'ml-v1' | 'ml-ama-v1';
const VALID: readonly Kind[] = ['heuristic', 'ml-v1', 'ml-ama-v1'] as const;
```

with:

```typescript
import type { AiKind as Kind } from '../../../ai/types';
const VALID: readonly Kind[] = ['heuristic', 'ml-v1', 'ml-ama-v1', 'ama-wasm'] as const;
```

(The selector option for `'ama-wasm'` will be added in Task 15.)

- [ ] **Step 6: タイプチェック + テスト**

```bash
npm run typecheck && npm test -- --run
```

Expected: typecheck passes, all tests pass. If a test asserts the old `Kind` shape, update its assertions.

- [ ] **Step 7: Commit**

```bash
git add src/ai/types.ts src/ai/worker/ai.worker.ts src/ui/hooks/useAiSuggestion.ts src/ui/components/Header/Header.tsx
git commit -m "refactor(ai): unify AiKind type, add 'ama-wasm' member"
```

---

## Task 8: src/ai/wasm-ama/types.ts

**Files:**
- Create: `src/ai/wasm-ama/types.ts`

- [ ] **Step 1: 型ファイル作成**

Create `src/ai/wasm-ama/types.ts`:

```typescript
export interface AmaCandidate {
  axisCol: number;        // 0-5
  rotation: number;       // 0-3
  score: number;          // ama 評価値 (int32, signed)
  expectedChain: number;  // ama 想定連鎖数 (0-19、未対応 build なら 0)
}

// C ABI: 5 candidates × 8 bytes each = 40 bytes
// per candidate: [axisCol, rotation, score(int32 LE 4 bytes), expectedChain, reserved]
export const OUT_BUFFER_BYTES = 40;
export const FIELD_BUFFER_BYTES = 78;  // 13 rows × 6 cols
export const MAX_CANDIDATES = 5;
```

- [ ] **Step 2: Commit**

```bash
git add src/ai/wasm-ama/types.ts
git commit -m "feat(wasm-ama): types for C ABI buffers and candidate"
```

---

## Task 9: src/ai/wasm-ama/wasm-loader.ts

**Files:**
- Create: `src/ai/wasm-ama/wasm-loader.ts`

- [ ] **Step 1: ローダー実装**

Create `src/ai/wasm-ama/wasm-loader.ts`:

```typescript
export interface AmaModule {
  ccall(name: string, retType: string | null, argTypes: string[], args: unknown[]): number;
  cwrap(name: string, retType: string | null, argTypes: string[]): (...args: unknown[]) => number;
  HEAPU8: Uint8Array;
  _malloc(n: number): number;
  _free(ptr: number): void;
}

interface AmaModuleFactory {
  (config?: { locateFile?: (path: string) => string }): Promise<AmaModule>;
}

let cached: Promise<AmaModule> | null = null;

async function loadFactory(): Promise<AmaModuleFactory> {
  // Browser: load from public dir as ESM
  // Node (Vitest): load via fs path because /wasm/ama.js is not URL-resolvable
  if (typeof window !== 'undefined') {
    const mod = (await import(/* @vite-ignore */ '/wasm/ama.js')) as { default: AmaModuleFactory };
    return mod.default;
  }
  const { pathToFileURL } = await import('node:url');
  const { resolve } = await import('node:path');
  const jsPath = resolve(process.cwd(), 'public/wasm/ama.js');
  const mod = (await import(/* @vite-ignore */ pathToFileURL(jsPath).href)) as { default: AmaModuleFactory };
  return mod.default;
}

export function loadAmaModule(): Promise<AmaModule> {
  if (!cached) {
    cached = (async () => {
      const factory = await loadFactory();
      const Module = await factory({
        locateFile: (path: string) => {
          if (!path.endsWith('.wasm')) return path;
          if (typeof window !== 'undefined') return '/wasm/ama.wasm';
          // Node: absolute path to the .wasm next to ama.js
          return require('node:path').resolve(process.cwd(), 'public/wasm/ama.wasm');
        },
      });
      const initRet = Module.ccall('ama_init', 'number', [], []);
      if (initRet !== 0) {
        throw new Error(`ama_init failed: ${initRet}`);
      }
      return Module;
    })();
  }
  return cached;
}

// For tests that need a fresh module
export function _resetAmaModuleCache(): void {
  cached = null;
}
```

- [ ] **Step 2: Commit**

```bash
git add src/ai/wasm-ama/wasm-loader.ts
git commit -m "feat(wasm-ama): module loader for browser and node"
```

---

## Task 10: src/ai/wasm-ama/wasm-ama-ai.ts

**Files:**
- Create: `src/ai/wasm-ama/wasm-ama-ai.ts`

- [ ] **Step 1: PuyoAI interface を確認**

```bash
cat src/ai/types.ts
```

Note the `PuyoAI` interface signature:
```typescript
export interface PuyoAI {
  readonly name: string;
  readonly version: string;
  init(): Promise<void>;
  suggest(state: GameState, topK: number): Promise<Move[]>;
}
```

- [ ] **Step 2: WasmAmaAI 実装**

Create `src/ai/wasm-ama/wasm-ama-ai.ts`:

```typescript
import type { PuyoAI } from '../types';
import type { GameState, Move } from '../../game/types';
import { loadAmaModule, type AmaModule } from './wasm-loader';
import {
  FIELD_BUFFER_BYTES,
  OUT_BUFFER_BYTES,
  MAX_CANDIDATES,
  type AmaCandidate,
} from './types';

const CHAR_DOT = 46;
const CHAR_R = 82;
const CHAR_B = 66;
const CHAR_Y = 89;
const CHAR_P = 80;

export class WasmAmaAI implements PuyoAI {
  readonly name = 'ama-wasm';
  readonly version = 'ama-wasm-build-v1';

  private module: AmaModule | null = null;
  private suggestFn: ((...args: unknown[]) => number) | null = null;
  private fieldBuf = 0;
  private outBuf = 0;
  private loading: Promise<void> | null = null;

  async init(): Promise<void> {
    if (this.module) return;
    if (this.loading) {
      await this.loading;
      return;
    }
    this.loading = (async () => {
      const m = await loadAmaModule();
      this.suggestFn = m.cwrap(
        'ama_suggest',
        'number',
        ['number','number','number','number','number','number','number','number'],
      );
      this.fieldBuf = m._malloc(FIELD_BUFFER_BYTES);
      this.outBuf = m._malloc(OUT_BUFFER_BYTES);
      this.module = m;
    })();
    try {
      await this.loading;
    } finally {
      this.loading = null;
    }
  }

  // Encodes state into the C ABI buffers and calls ama_suggest.
  // Returns the number of candidates the WASM wrote (0 on error / no result).
  private callSuggest(state: GameState): number {
    const m = this.module!;
    const heap = m.HEAPU8;

    for (let r = 0; r < 13; r++) {
      const row = state.field[r]!;
      for (let c = 0; c < 6; c++) {
        const cell = row[c];
        let ch = CHAR_DOT;
        if (cell === 'R') ch = CHAR_R;
        else if (cell === 'B') ch = CHAR_B;
        else if (cell === 'Y') ch = CHAR_Y;
        else if (cell === 'P') ch = CHAR_P;
        heap[this.fieldBuf + r * 6 + c] = ch;
      }
    }

    const cur = state.current!.pair;
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
    return ret > 0 ? ret : 0;
  }

  async suggest(state: GameState, topK: number): Promise<Move[]> {
    await this.init();
    if (!state.current) return [];
    const ret = this.callSuggest(state);
    if (ret === 0) return [];
    const n = Math.min(ret, MAX_CANDIDATES, topK);
    const heap = this.module!.HEAPU8;
    const moves: Move[] = [];
    for (let i = 0; i < n; i++) {
      const p = this.outBuf + i * 8;
      moves.push({
        axisCol: heap[p + 0]!,
        rotation: heap[p + 1]!,
      });
    }
    return moves;
  }

  // Exposes AmaCandidate (with score, expectedChain) for future UI use
  // (e.g. showing ama's expected chain count alongside the suggested move).
  async suggestWithScores(state: GameState, topK: number): Promise<AmaCandidate[]> {
    await this.init();
    if (!state.current) return [];
    const ret = this.callSuggest(state);
    if (ret === 0) return [];
    const n = Math.min(ret, MAX_CANDIDATES, topK);
    const heap = this.module!.HEAPU8;
    const out: AmaCandidate[] = [];
    for (let i = 0; i < n; i++) {
      const p = this.outBuf + i * 8;
      const score = (heap[p + 2]!) | (heap[p + 3]! << 8) | (heap[p + 4]! << 16) | (heap[p + 5]! << 24);
      out.push({
        axisCol: heap[p + 0]!,
        rotation: heap[p + 1]!,
        score: score | 0,  // sign-extend int32
        expectedChain: heap[p + 6]!,
      });
    }
    return out;
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

- [ ] **Step 3: 型チェック**

```bash
npm run typecheck
```

Expected: passes. The exact `state.current` shape may differ — if it does, adjust `cur.pair.axis` / `cur.pair.child` to match the actual `GameState` definition (read `src/game/types.ts`).

- [ ] **Step 4: Commit**

```bash
git add src/ai/wasm-ama/wasm-ama-ai.ts
git commit -m "feat(wasm-ama): WasmAmaAI implementing PuyoAI"
```

---

## Task 11: WasmAmaAI 単体テスト

**Files:**
- Create: `src/ai/wasm-ama/__tests__/wasm-ama-ai.test.ts`

- [ ] **Step 1: 失敗するテストを書く**

Create `src/ai/wasm-ama/__tests__/wasm-ama-ai.test.ts`:

```typescript
import { describe, it, expect, beforeAll } from 'vitest';
import { WasmAmaAI } from '../wasm-ama-ai';
import { createInitialState } from '../../../game/state';

describe('WasmAmaAI', () => {
  const ai = new WasmAmaAI();

  beforeAll(async () => {
    await ai.init();
  });

  it('returns top-K moves for an empty board', async () => {
    const state = createInitialState(7777);
    const moves = await ai.suggest(state, 5);
    expect(moves.length).toBeGreaterThan(0);
    expect(moves.length).toBeLessThanOrEqual(5);
    for (const m of moves) {
      expect(m.axisCol).toBeGreaterThanOrEqual(0);
      expect(m.axisCol).toBeLessThanOrEqual(5);
      expect(m.rotation).toBeGreaterThanOrEqual(0);
      expect(m.rotation).toBeLessThanOrEqual(3);
    }
  });

  it('suggestWithScores returns AmaCandidate with score', async () => {
    const state = createInitialState(42);
    const cands = await ai.suggestWithScores(state, 3);
    expect(cands.length).toBeGreaterThan(0);
    expect(typeof cands[0]!.score).toBe('number');
    expect(cands[0]!.expectedChain).toBeGreaterThanOrEqual(0);
  });
});
```

- [ ] **Step 2: テスト失敗を確認**

```bash
npm test -- --run src/ai/wasm-ama/__tests__/wasm-ama-ai.test.ts
```

Expected: tests run but may fail with "ama.js not found" or similar import errors initially. This is a sanity check that vitest can pick up the file.

- [ ] **Step 3: 必要に応じて test-setup または vitest config を調整**

If Vitest cannot resolve `/wasm/ama.js`:
- The Vitest test runs in `jsdom` environment (`vite.config.ts:28`).
- Loader has Node fallback via `process.cwd() + '/public/wasm/ama.js'`.
- If `typeof window` evaluates true in jsdom, force the Node branch in tests by checking for a Vitest env var. Update `wasm-loader.ts:loadFactory` to:

```typescript
async function loadFactory(): Promise<AmaModuleFactory> {
  const isNode = typeof process !== 'undefined' && !!process.versions?.node && typeof globalThis.fetch === 'undefined';
  // Vitest provides fetch in jsdom; we want Node branch when explicitly running under Vitest:
  const isVitest = typeof process !== 'undefined' && process.env.VITEST === 'true';
  if (typeof window !== 'undefined' && !isVitest) {
    const mod = (await import(/* @vite-ignore */ '/wasm/ama.js')) as { default: AmaModuleFactory };
    return mod.default;
  }
  void isNode;
  const { pathToFileURL } = await import('node:url');
  const { resolve } = await import('node:path');
  const jsPath = resolve(process.cwd(), 'public/wasm/ama.js');
  const mod = (await import(/* @vite-ignore */ pathToFileURL(jsPath).href)) as { default: AmaModuleFactory };
  return mod.default;
}
```

If you adjusted `wasm-loader.ts`, commit that change separately:

```bash
git add src/ai/wasm-ama/wasm-loader.ts
git commit -m "fix(wasm-ama): force node branch under vitest"
```

- [ ] **Step 4: テスト実行 → pass を確認**

```bash
npm test -- --run src/ai/wasm-ama/__tests__/wasm-ama-ai.test.ts
```

Expected: 2 tests pass.

- [ ] **Step 5: Commit**

```bash
git add src/ai/wasm-ama/__tests__/wasm-ama-ai.test.ts
git commit -m "test(wasm-ama): basic suggest sanity"
```

---

## Task 12: scripts/gen-ama-golden.ts + golden データ生成

**Files:**
- Create: `scripts/gen-ama-golden.ts`
- Create: `src/ai/wasm-ama/__tests__/ama_golden.jsonl` (artifact)

- [ ] **Step 1: golden 生成スクリプト**

Create `scripts/gen-ama-golden.ts`:

```typescript
import { spawnSync } from 'node:child_process';
import { mkdirSync, readFileSync, writeFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';

const AMA_REPO = process.env.AMA_REPO ?? '/Users/yasumitsuomori/git/ama';
const AMA_BIN = join(AMA_REPO, 'bin/dump_selfplay/dump_selfplay.exe');

function parseArg(name: string, fallback: string): string {
  const i = process.argv.indexOf(name);
  return i >= 0 && i + 1 < process.argv.length ? process.argv[i + 1]! : fallback;
}

function main() {
  const games = Number(parseArg('--games', '50'));
  const seed = Number(parseArg('--seed', '7777'));
  const out = parseArg('--out', 'src/ai/wasm-ama/__tests__/ama_golden.jsonl');

  if (!existsSync(AMA_BIN)) {
    console.error(`ama dump_selfplay binary not found: ${AMA_BIN}`);
    console.error(`Build it: cd ${AMA_REPO} && make dump_selfplay`);
    process.exit(1);
  }

  const tmp = join('/tmp', `ama-golden-${seed}.jsonl`);
  console.log(`Running ama for ${games} games (seed ${seed}) → ${tmp}`);
  const ret = spawnSync(AMA_BIN, [
    '--games', String(games),
    '--seed', String(seed),
    '--weights', 'build',
    '--out', tmp,
    '--topk', '5',
  ], { cwd: AMA_REPO, stdio: 'inherit' });
  if (ret.status !== 0) {
    console.error(`ama exited ${ret.status}`);
    process.exit(1);
  }

  // Convert dump_selfplay rows → golden rows: keep only top-1 of topk as `expected`
  const lines = readFileSync(tmp, 'utf8').trim().split('\n');
  const golden: string[] = [];
  for (const line of lines) {
    if (!line.trim()) continue;
    let row: Record<string, unknown>;
    try { row = JSON.parse(line); } catch { continue; }
    const topk = row.topk as Array<{ axisCol: number; rotation: number; score: number }> | undefined;
    if (!topk || topk.length === 0) continue;
    const exp = topk[0]!;
    golden.push(JSON.stringify({
      gameId: row.game_id,
      moveIndex: row.move_index,
      field: row.field,
      currentAxis: row.current_axis,
      currentChild: row.current_child,
      next1Axis: row.next1_axis,
      next1Child: row.next1_child,
      next2Axis: row.next2_axis,
      next2Child: row.next2_child,
      expected: { axisCol: exp.axisCol, rotation: exp.rotation, score: exp.score },
    }));
  }

  mkdirSync(join(out, '..'), { recursive: true });
  writeFileSync(out, golden.join('\n') + '\n');
  console.log(`Wrote ${golden.length} golden rows to ${out}`);
}

main();
```

- [ ] **Step 2: package.json に script 追加**

```json
"gen:ama-golden": "tsx scripts/gen-ama-golden.ts"
```

- [ ] **Step 3: dump_selfplay バイナリが存在するか確認 + ビルド**

```bash
ls /Users/yasumitsuomori/git/ama/bin/dump_selfplay/dump_selfplay.exe 2>/dev/null \
  || (cd /Users/yasumitsuomori/git/ama && make dump_selfplay)
```

- [ ] **Step 4: golden 生成**

```bash
npm run gen:ama-golden -- --games 50 --seed 7777 \
  --out src/ai/wasm-ama/__tests__/ama_golden.jsonl
```

Expected: completes in ~5-15 minutes (50 games × ~10-30s each on M1). Outputs ~1,500-2,500 rows depending on game length. File should be 200-800 KB.

```bash
wc -l src/ai/wasm-ama/__tests__/ama_golden.jsonl
ls -lh src/ai/wasm-ama/__tests__/ama_golden.jsonl
```

- [ ] **Step 5: Commit**

```bash
git add scripts/gen-ama-golden.ts package.json src/ai/wasm-ama/__tests__/ama_golden.jsonl
git commit -m "test(wasm-ama): golden file from native ama (50 games, seed 7777)"
```

---

## Task 13: golden 比較テスト

**Files:**
- Create: `src/ai/wasm-ama/__tests__/ama-golden.test.ts`

- [ ] **Step 1: 比較テストを書く**

Create `src/ai/wasm-ama/__tests__/ama-golden.test.ts`:

```typescript
import { describe, it, expect, beforeAll } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { WasmAmaAI } from '../wasm-ama-ai';
import type { GameState } from '../../../game/types';

interface GoldenRow {
  gameId: number;
  moveIndex: number;
  field: string[];
  currentAxis: string;
  currentChild: string;
  next1Axis: string;
  next1Child: string;
  next2Axis: string;
  next2Child: string;
  expected: { axisCol: number; rotation: number; score: number };
}

function rowToState(row: GoldenRow): GameState {
  const field: ('R'|'B'|'Y'|'P'|null)[][] = [];
  for (let r = 0; r < 13; r++) {
    const rowChars = row.field[r]!;
    const rowCells: ('R'|'B'|'Y'|'P'|null)[] = [];
    for (let c = 0; c < 6; c++) {
      const ch = rowChars[c]!;
      if (ch === 'R' || ch === 'B' || ch === 'Y' || ch === 'P') rowCells.push(ch);
      else rowCells.push(null);
    }
    field.push(rowCells);
  }
  return {
    field,
    current: {
      pair: { axis: row.currentAxis as 'R'|'B'|'Y'|'P', child: row.currentChild as 'R'|'B'|'Y'|'P' },
      axisRow: 1, axisCol: 2, rotation: 0,
    },
    nextQueue: [
      { axis: row.next1Axis as 'R'|'B'|'Y'|'P', child: row.next1Child as 'R'|'B'|'Y'|'P' },
      { axis: row.next2Axis as 'R'|'B'|'Y'|'P', child: row.next2Child as 'R'|'B'|'Y'|'P' },
    ],
    rngSeed: 0,
    queueIndex: 0,
    score: 0,
    chain: 0,
    status: 'playing',
  } as unknown as GameState;
}

describe('ama WASM matches native ama (golden file)', () => {
  const ai = new WasmAmaAI();
  let rows: GoldenRow[] = [];

  beforeAll(async () => {
    await ai.init();
    const path = resolve(process.cwd(), 'src/ai/wasm-ama/__tests__/ama_golden.jsonl');
    const text = readFileSync(path, 'utf8');
    rows = text.trim().split('\n').map((l) => JSON.parse(l) as GoldenRow);
    expect(rows.length).toBeGreaterThan(100);
  }, 60_000);

  it('first 10 rows: WASM picks the same move as native (one-by-one)', async () => {
    for (let i = 0; i < 10; i++) {
      const row = rows[i]!;
      const moves = await ai.suggest(rowToState(row), 1);
      const m = moves[0];
      expect(m, `gameId=${row.gameId} moveIndex=${row.moveIndex}`).toBeDefined();
      expect(m!.axisCol).toBe(row.expected.axisCol);
      expect(m!.rotation).toBe(row.expected.rotation);
    }
  });

  it('all rows: same-move rate ≥ 95%', async () => {
    let match = 0;
    let total = 0;
    for (const row of rows) {
      const moves = await ai.suggest(rowToState(row), 1);
      const m = moves[0];
      total++;
      if (m && m.axisCol === row.expected.axisCol && m.rotation === row.expected.rotation) match++;
    }
    const rate = match / total;
    console.log(`golden same-move rate: ${(rate * 100).toFixed(2)}% (${match}/${total})`);
    expect(rate).toBeGreaterThanOrEqual(0.95);
  }, 600_000);
});
```

- [ ] **Step 2: テスト実行**

```bash
npm test -- --run src/ai/wasm-ama/__tests__/ama-golden.test.ts
```

Expected: same-move rate prints (target ≥ 99%, gating ≥ 95%). The all-rows test has a 10-minute timeout because per-row suggest is ~200-500ms × ~2,000 rows.

- [ ] **Step 3: rate < 95% の場合の対応**

If the rate is below 95%:

1. Inspect a failing row (the first-10 sub-test will likely catch it):
   ```bash
   head -1 src/ai/wasm-ama/__tests__/ama_golden.jsonl | jq .
   ```
2. Manually run native ama on the same field to confirm the expected move.
3. The most likely cause is a SIMD intrinsic mis-emulation. Reduce the case to a single `field` and run `WasmAmaAI.suggest` to see what WASM returns.
4. Add `#ifdef __EMSCRIPTEN__` scalar fallback for the suspect intrinsic in ama (Task 4 Step 3 procedure), rebuild, and re-run.

Do NOT lower the threshold. If you cannot reach 95%, escalate to the user.

- [ ] **Step 4: Commit**

```bash
git add src/ai/wasm-ama/__tests__/ama-golden.test.ts
git commit -m "test(wasm-ama): golden file comparison vs native ama"
```

---

## Task 14: scripts/eval-ai.ts に ama-wasm 種別追加

**Files:**
- Modify: `scripts/eval-ai.ts`

- [ ] **Step 1: 現状の AiKind を確認**

```bash
grep -n "AiKind\|type AiKind\|kind: '" scripts/eval-ai.ts | head -20
```

- [ ] **Step 2: ama-wasm 種別を追加**

Open `scripts/eval-ai.ts`. Locate the `AiKind` (or local `Kind`) union and add `'ama-wasm'`:

```typescript
type AiKind = 'heuristic' | 'ml-v1' | 'ml-ama-v1' | 'ama' | 'ama-wasm';
```

Locate the AI factory `function makeAi(kind: AiKind)` (or equivalent dispatch). Add a branch:

```typescript
if (kind === 'ama-wasm') {
  const { WasmAmaAI } = await import('../src/ai/wasm-ama/wasm-ama-ai');
  const ai = new WasmAmaAI();
  await ai.init();
  return ai;
}
```

- [ ] **Step 3: 型チェック**

```bash
npm run typecheck
```

- [ ] **Step 4: eval を 100 ゲーム実行**

```bash
npm run eval -- --games 100 --seed 1 --a ama --b ama-wasm 2>&1 | tee /tmp/ama-vs-amawasm.log
```

Expected: B/A score ratio in `0.95 - 1.05`. Native vs WASM should be near-identical because both run the same beam search; a value far from 1.0 indicates SIMD divergence (return to Task 13 Step 3 troubleshooting).

This run takes ~2-3 hours (100 games × ~30-90s × 2 AIs). Consider running with `--games 20` first as a smoke test.

- [ ] **Step 5: Commit**

```bash
git add scripts/eval-ai.ts
git commit -m "feat(eval): support ama-wasm AI kind"
```

---

## Task 15: ai.worker.ts に kind 'ama-wasm' 追加

**Files:**
- Modify: `src/ai/worker/ai.worker.ts`

- [ ] **Step 1: WasmAmaAI を import + 初期化ヘルパー追加**

Open `src/ai/worker/ai.worker.ts`. After the existing imports, add:

```typescript
import { WasmAmaAI } from '../wasm-ama/wasm-ama-ai';
```

After `mlInstances`, add:

```typescript
let amaWasmInstance: WasmAmaAI | null = null;

async function getOrInitAmaWasm(): Promise<WasmAmaAI> {
  if (!amaWasmInstance) amaWasmInstance = new WasmAmaAI();
  await amaWasmInstance.init();
  return amaWasmInstance;
}
```

- [ ] **Step 2: handleMessage の set-ai 分岐を拡張**

In `handleMessage`'s `set-ai` branch, after the existing `if (msg.kind === 'heuristic')` and the `getOrInitMl` block, add the ama-wasm branch. The full `set-ai` body should be:

```typescript
if (msg.type === 'set-ai') {
  try {
    if (msg.kind === 'heuristic') {
      active = heuristic;
      send({ type: 'set-ai', kind: 'heuristic', ok: true });
      return;
    }
    if (msg.kind === 'ama-wasm') {
      const ai = await getOrInitAmaWasm();
      active = ai;
      send({ type: 'set-ai', kind: 'ama-wasm', ok: true });
      return;
    }
    const ml = await getOrInitMl(msg.kind);
    active = ml;
    send({ type: 'set-ai', kind: msg.kind, ok: true });
  } catch (err) {
    active = heuristic;
    send({
      type: 'set-ai',
      kind: msg.kind,
      ok: false,
      error: err instanceof Error ? err.message : String(err),
    });
  }
  return;
}
```

- [ ] **Step 3: 型チェック + 既存テスト**

```bash
npm run typecheck && npm test -- --run src/ai/worker
```

Expected: all worker tests still pass.

- [ ] **Step 4: Commit**

```bash
git add src/ai/worker/ai.worker.ts
git commit -m "feat(worker): support 'ama-wasm' kind"
```

---

## Task 16: useAiSuggestion.ts のロード状態通知

**Files:**
- Modify: `src/ui/hooks/useAiSuggestion.ts`

- [ ] **Step 1: ロード状態シングルトンを追加**

Open `src/ui/hooks/useAiSuggestion.ts`. After the existing `suggestHandlers` declaration, add:

```typescript
type AiReadyHandler = (kind: Kind, ok: boolean) => void;
const aiReadyHandlers = new Set<AiReadyHandler>();
let currentAiKind: Kind = 'ml-ama-v1';
let currentAiReady = false;
```

- [ ] **Step 2: getWorker の onmessage を拡張**

In the existing `w.onmessage`, change the handler body to also dispatch `set-ai`:

```typescript
w.onmessage = (e: MessageEvent<{
  type: string; id?: number; moves?: Move[]; kind?: Kind; ok?: boolean;
}>) => {
  if (e.data.type === 'suggest' && typeof e.data.id === 'number' && e.data.moves) {
    for (const h of suggestHandlers) h({ id: e.data.id, moves: e.data.moves });
  } else if (e.data.type === 'set-ai' && e.data.kind && typeof e.data.ok === 'boolean') {
    if (e.data.kind === currentAiKind) currentAiReady = e.data.ok;
    for (const h of aiReadyHandlers) h(e.data.kind, e.data.ok);
  }
};
```

- [ ] **Step 3: setAiKind を更新**

Replace the existing `setAiKind` body:

```typescript
export function setAiKind(kind: Kind): void {
  currentAiKind = kind;
  currentAiReady = false;
  for (const h of aiReadyHandlers) h(kind, false);
  getWorker().postMessage({ type: 'set-ai', kind });
}
```

- [ ] **Step 4: useAiSuggestion フックに aiReady を追加**

In the body of `export function useAiSuggestion`, add:

```typescript
const [aiKind, setAiKindLocal] = useState<Kind>(currentAiKind);
const [aiReady, setAiReady] = useState<boolean>(currentAiReady);

useEffect(() => {
  const handler: AiReadyHandler = (kind, ok) => {
    setAiKindLocal(kind);
    setAiReady(ok);
  };
  aiReadyHandlers.add(handler);
  return () => { aiReadyHandlers.delete(handler); };
}, []);
```

Update the return to include the new fields:

```typescript
return { moves, loading, aiKind, aiReady };
```

- [ ] **Step 5: 既存呼び出し側の影響確認**

```bash
grep -rn "useAiSuggestion(" src/ | grep -v __tests__
```

If any caller destructures all returned fields, it still works (added fields are non-breaking). If none does (typical), nothing else to change.

- [ ] **Step 6: 型チェック + テスト**

```bash
npm run typecheck && npm test -- --run src/ui/hooks
```

- [ ] **Step 7: Commit**

```bash
git add src/ui/hooks/useAiSuggestion.ts
git commit -m "feat(ui): expose aiKind/aiReady from useAiSuggestion"
```

---

## Task 17: Header.tsx に 4-way セレクタ + ロード表示

**Files:**
- Modify: `src/ui/components/Header/Header.tsx`
- Test: `src/ui/components/Header/__tests__/Header.test.tsx` (existing — update if needed)

- [ ] **Step 1: セレクタオプションに ama (WASM) 追加**

Open `src/ui/components/Header/Header.tsx`. In the `<select>` body, add a new `<option>` after the `ml-ama-v1` line:

```tsx
<option value="ama-wasm">ama (WASM)</option>
```

- [ ] **Step 2: 既存 Header テストを実行**

```bash
npm test -- --run src/ui/components/Header
```

If the existing test asserts the count of `<option>` elements, update it from 3 to 4. Show the diff inline before committing.

- [ ] **Step 3: 型チェック**

```bash
npm run typecheck
```

- [ ] **Step 4: Commit**

```bash
git add src/ui/components/Header/Header.tsx \
  src/ui/components/Header/__tests__/Header.test.tsx
git commit -m "feat(ui): 4-way AI selector with ama (WASM)"
```

---

## Task 18: vite.config.ts PWA precache 設定

**Files:**
- Modify: `vite.config.ts`

- [ ] **Step 1: workbox 設定を追加**

Open `vite.config.ts`. In the `VitePWA({ ... })` block, add a `workbox` field after `manifest`:

```typescript
VitePWA({
  registerType: 'autoUpdate',
  manifest: { /* ... existing ... */ },
  workbox: {
    globPatterns: ['**/*.{js,css,html,wasm,bin,json}'],
    maximumFileSizeToCacheInBytes: 16 * 1024 * 1024,
  },
}),
```

- [ ] **Step 2: ビルドが通ることを確認**

```bash
npm run build
```

Expected: build succeeds, console output mentions "precache" with `.wasm` files included. Look for a line like `precache 4 entries (... ama.wasm ... ama.js ...)`.

```bash
grep -l "ama.wasm" dist/sw.js dist/workbox-*.js 2>/dev/null | head -3
```

Expected: at least one match (the precache manifest references ama.wasm).

- [ ] **Step 3: Commit**

```bash
git add vite.config.ts
git commit -m "build(pwa): include .wasm in precache, raise size limit"
```

---

## Task 19: ライセンスファイル + README 追記

**Files:**
- Create: `LICENSES/ama-MIT.txt`
- Create: `public/LICENSES/ama-MIT.txt`
- Modify: `README.md`

- [ ] **Step 1: ama LICENSE をコピー**

```bash
mkdir -p LICENSES public/LICENSES
cp /Users/yasumitsuomori/git/ama/LICENSE LICENSES/ama-MIT.txt
cp LICENSES/ama-MIT.txt public/LICENSES/ama-MIT.txt
head -3 LICENSES/ama-MIT.txt
```

Expected: shows `MIT License` and `Copyright (c) ...`. If `LICENSE` is named differently in the ama repo, find it with `ls /Users/yasumitsuomori/git/ama/LICENSE*` and use the actual path.

- [ ] **Step 2: README.md に追記**

Open `README.md`. Append (or insert before existing license section):

```markdown
## Bundled software

- [ama](https://github.com/citrus610/ama) (MIT) by citrus610 — bundled as
  WebAssembly under the `ama (WASM)` AI option. License: `LICENSES/ama-MIT.txt`.

## Rebuilding ama WASM (optional)

The `public/wasm/ama.{wasm,js}` artifacts are committed to this repo. To rebuild:

1. Install Emscripten: `brew install emscripten` (~5GB, 10-20 min)
2. Clone ama: `git clone https://github.com/citrus610/ama /path/to/ama`
3. Build: `AMA_REPO=/path/to/ama npm run build:ama-wasm`
```

- [ ] **Step 3: Commit**

```bash
git add LICENSES/ama-MIT.txt public/LICENSES/ama-MIT.txt README.md
git commit -m "docs: bundle ama (MIT) credit and rebuild instructions"
```

---

## Task 20: ブラウザ手動確認 + レイテンシ実測

**Files:**
- (no source changes unless beam params need adjustment)

- [ ] **Step 1: dev サーバー起動 → ブラウザで `ama (WASM)` 選択**

```bash
npm run dev
```

Open the URL printed by Vite (typically `http://localhost:5173`). Use the AI selector in the header → choose `ama (WASM)`. Wait for the WASM module to load (a brief flicker on first load).

- [ ] **Step 2: 数手プレイして strength を体感**

Place 5-10 puyos manually. Confirm the suggestion overlay updates and the placements look like ama-style (compact build aiming for chains, not random).

- [ ] **Step 3: レイテンシ計測**

In Chrome DevTools console, paste:

```javascript
const N = 10;
const start = performance.now();
for (let i = 0; i < N; i++) {
  // Trigger a suggestion by committing then undoing — or instrument via your own hook.
  // The simplest: just observe the overlay update timing in the Network/Performance tab.
}
console.log(`avg ${(performance.now() - start) / N}ms per cycle`);
```

A more reliable measurement: instrument `WasmAmaAI.suggest` to log `performance.now()` start/end (temporary logging, remove before commit). Or use the Performance tab and look for the `suggest` call duration.

Acceptance:
- avg latency < 3000ms (gating)
- target latency < 1000ms

- [ ] **Step 4: レイテンシ超過時の対応**

If avg latency > 3000ms:

1. Open `/Users/yasumitsuomori/git/ama/tools/wasm_api.cpp` (Task 2).
2. Locate `beam::search_multi(field, q, g_weight)`.
3. Check whether `search_multi` accepts a config parameter (look at `ai/search/beam/beam.h`). If yes, pass a smaller config:
   ```cpp
   beam::Config cfg;
   cfg.width = 150;
   cfg.depth = 12;
   auto result = beam::search_multi(field, q, g_weight, cfg);
   ```
4. If not, replace `beam::search_multi` with `beam::search` (single-thread, may be slightly slower but smaller candidate count).
5. Rebuild WASM (`npm run build:ama-wasm`), commit the artifact (Task 6 procedure), and re-measure.

Each adjustment: a separate ama-side commit + a puyo-simulator commit for the new artifact.

- [ ] **Step 5: 全体テスト + lint + build**

```bash
npm run typecheck && npm test -- --run && npm run build
```

Expected: typecheck passes, all tests pass (golden ≥ 95%), production build completes.

- [ ] **Step 6: Final commit if any tweaks were made**

```bash
git add -A
git status
# if there are tracked changes:
git commit -m "tune(wasm-ama): adjust beam config for browser latency"
```

If no changes, this task is complete.

---

## Done definition

- [ ] `public/wasm/ama.{wasm,js}` がビルドされ commit されている
- [ ] `LICENSES/ama-MIT.txt` と `public/LICENSES/ama-MIT.txt` が配置されている
- [ ] README に ama クレジットと再ビルド手順が記載されている
- [ ] `npm test -- --run` で golden 比較テストが pass(同手率 ≥ 95%)
- [ ] `npm run eval -- --a ama --b ama-wasm --games 100` で B/A ratio が 0.95-1.05
- [ ] ブラウザ手動確認で 1 手レイテンシ < 3000ms
- [ ] `npm run build` が成功し、PWA precache に `.wasm` が含まれる
- [ ] 4-way セレクタが動作し、ama-wasm 選択時の suggestion overlay が機能

---

## Notes for the executor

**ama-side commits**: ama は puyo-simulator とは別の git リポジトリ。`cd /Users/yasumitsuomori/git/ama` してから commit する。push は user に委ねる(ama リポは upstream が異なる可能性)。

**TDD 適用範囲**: Task 11, 13(Vitest テスト)では TDD を厳守 — テストを先に書き、failing を確認、実装、passing を確認、commit。Task 15-19(UI / Worker 修正)は既存テストを green に保ったままの拡張なので TDD 強制は緩い。

**SIMD 失敗時**: ama 側の各 intrinsic を手当てする必要が出たら、Task 4 Step 3 のテンプレートに従って 1 intrinsic = 1 commit で進める。広範な書き換えは絶対禁止 — 失敗箇所だけスカラーフォールバック。

**並行作業の禁止**: 各 Task は前のタスクが green なことが前提。実装側 subagent は前タスクのチェックボックスが全て埋まっていない状態で次へ進まない。

**reachability**: WasmAmaAI.suggest は ama の top-K を返す。ours の `legalActionMask` で reachability NG な手があった場合は `useAiSuggestion` 側の既存ロジック(MlAI と同様)が処理しているはず。Task 11 の単体テストで実機確認、必要なら filter ロジックを追加する。
