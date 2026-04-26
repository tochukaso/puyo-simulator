# Phase 5c-1: ama Distillation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** ama(外部の強力な puyo AI、`/Users/yasumitsuomori/git/ama`)を教師に使い、ML モデルを蒸留学習してブラウザで ama の 80% 強さを実現する。

**Architecture:** ama に薄い JSONL 出力ハーネスを足して 50k 自己対戦データを生成 → Python で top-K soft target 蒸留学習 → ResNet 8 ブロック × 64ch(~1M params, ~4MB) → TF.js → ブラウザ AI セレクタ 3 択化。先立って RNG を Puyo eSport 互換に統一(訓練/推論の状態分布揃え)。

**Tech Stack:** TypeScript / Vite / Vitest / Node worker_threads / C++20 (ama, SSE4) / Python 3.11 + PyTorch 2.x (MPS) / `@tensorflow/tfjs` / onnx2tf / tensorflowjs_converter

**Spec:** `docs/superpowers/specs/2026-04-25-phase5c-1-ama-distillation-design.md`

**Branch:** `feature/puyo-mvp` の続き(現状 `46dbf4a`)。

---

## File Structure

| Path | 責務 | 種別 |
| --- | --- | --- |
| `src/game/rng.ts` | Puyo eSport 互換 queue 生成へ全面置換 | 修正 |
| `src/game/__tests__/rng.test.ts` | 既存 mulberry32 テストを esport 仕様に書換え | 修正 |
| `src/game/types.ts` | `GameState.queueIndex: number` を追加 | 修正 |
| `src/game/state.ts` | createInitialState / spawnNext を queue+index ベースに | 修正 |
| `src/game/__tests__/state.test.ts` | seed→pair 期待値を新 RNG ベースに更新 | 修正 |
| `src/shared/specs/rng_spec.json` | 5 ケース cross-language fixtures(seed → 最初 8 ツモ) | 新規 |
| `src/game/__tests__/rng_spec.test.ts` | TS 側 cross-spec 検証 | 新規 |
| `python/puyo_train/env_rng.py` | TS と同仕様の Puyo eSport queue | 新規 |
| `python/tests/test_env_rng.py` | rng_spec.json による cross-test | 新規 |
| `/Users/yasumitsuomori/git/ama/tools/dump_selfplay.cpp` | C++ ハーネス、JSONL 出力 | 新規 |
| `/Users/yasumitsuomori/git/ama/makefile` | `make dump_selfplay` ターゲット追加 | 修正 |
| `scripts/ama-selfplay.ts` | ama subprocess 並列ラッパ | 新規 |
| `python/puyo_train/dataset_ama.py` | top-K soft target 対応 Dataset | 新規 |
| `python/puyo_train/model_v2.py` | ResNet 8x64 dual-head | 新規 |
| `python/puyo_train/distill.py` | 蒸留学習ループ | 新規 |
| `python/train_ama.py` | エントリポイント | 新規 |
| `python/tests/test_dataset_ama.py` | dataset 単体テスト | 新規 |
| `python/tests/test_model_v2.py` | model forward / shape | 新規 |
| `python/tests/test_distill_smoke.py` | smoke 学習 | 新規 |
| `src/ai/ml/ml-ai.ts` | modelKind 引数化(`v1` / `ama-v1`)、URL 切替 | 修正 |
| `src/ai/ml/__tests__/ml-ai.test.ts` | 新コンストラクタ対応 | 修正 |
| `src/ai/worker/ai.worker.ts` | set-ai に `ml-v1` / `ml-ama-v1` 追加、ml-fast/full 両対応 | 修正 |
| `src/ai/worker/__tests__/ai.worker.test.ts` | 3 kind テスト | 修正 |
| `src/ui/components/Header/Header.tsx` | 3 択 select、デフォルト `ml-ama-v1` | 修正 |
| `src/ui/components/Header/__tests__/Header.test.tsx` | 3 択テスト | 修正 |
| `src/ui/hooks/useAiSuggestion.ts` | `setAiKind` の型を 3 値に拡張 | 修正 |
| `scripts/ama-ai-node.ts` | 評価用 ama subprocess アダプタ(PuyoAI 実装) | 新規 |
| `scripts/eval-ai.ts` | 3 通り対戦サポート(`--a`/`--b` で kind 選択) | 修正 |
| `public/models/policy-ama-v1/{model.json, *.bin}` | エクスポート成果物 | 新規 |
| `python/puyo_train/export.py` | model クラスを `--model` で切替できるように引数化 | 修正 |
| `docs/superpowers/progress/2026-04-25-phase5c-1-run.md` | 本番 run の結果記録 | 新規 |

---

## Task Overview

| # | タスク | ステージ | 所要 |
| --- | --- | --- | --- |
| 1 | TS Puyo eSport queue 実装 + ユニットテスト | A | 45m |
| 2 | RNG cross-spec fixtures + TS test | A | 30m |
| 3 | GameState 改修(queueIndex 追加)+ state.ts 書換 + 既存テスト更新 | A | 60m |
| 4 | Python env_rng + cross-test | A | 30m |
| 5 | ama ハーネス `tools/dump_selfplay.cpp` + Makefile + smoke run | B | 90m |
| 6 | TS ラッパ `scripts/ama-selfplay.ts` + smoke run | B | 45m |
| 7 | Python `dataset_ama.py` + tests | C | 45m |
| 8 | Python `model_v2.py` ResNet + tests | C | 45m |
| 9 | Python `distill.py` 学習ループ + smoke test | C | 60m |
| 10 | Python `train_ama.py` エントリ + export.py の引数化 | C | 30m |
| 11 | ML AI(`ml-ai.ts`)で modelKind 切替 + tests | E | 30m |
| 12 | Worker `set-ai` 3 kind + tests | E | 30m |
| 13 | Header 3 択セレクタ + tests | E | 30m |
| 14 | ama AI adapter + eval-ai 3 way 対応 | E | 60m |
| 15 | 本番 run: 50k self-play + 蒸留学習 + 出力 + eval(manual)| D / E | 4-6h(待ち時間) |

合計 **15 タスク**(うち最後は手動操作)。

---

## Task 1: TS Puyo eSport queue

ama の `cell::create_queue` を TS に port。同 seed なら同 128 ペア配列を返す純粋関数。

**Files:**
- Modify: `src/game/rng.ts`
- Modify: `src/game/__tests__/rng.test.ts`

### Algorithm(ama/core/cell.h より)

1. LCG: `seed = (seed * 0x5D588B65 + 0x269EC3) & 0xFFFFFFFF`
2. seed を 5 回空回し
3. 3 つの 256 個 queue を作る:`mode 0` は 3 色(値 0-2 が 1/3 ずつ)、`mode 1` は 4 色、`mode 2` は 5 色
4. 各 queue を 3 段シャッフル(15×8 swap → 7×16 swap → 3×32 swap、shift 量は 28 / 27 / 26)
5. mode 1 と 2 の最初 4 マスを mode 0 で置換(最初 2 ペア = 3 色限定)
6. 採用は **mode 1**(4 色)、`(queue[1][2i], queue[1][2i+1])` を 128 ペアに整形
7. 色マッピング: ama 0=R, 1=Y, 2=G, 3=B → ours 0=R, 1=Y, 2=P, 3=B

- [ ] **Step 1: Write the failing test**

Replace `src/game/__tests__/rng.test.ts` content:

```ts
import { describe, it, expect } from 'vitest';
import { makeEsportQueue, getEsportQueue } from '../rng';

describe('makeEsportQueue', () => {
  it('returns 128 pairs', () => {
    const q = makeEsportQueue(42);
    expect(q.length).toBe(128);
  });

  it('same seed yields same queue', () => {
    const a = makeEsportQueue(42);
    const b = makeEsportQueue(42);
    expect(a).toEqual(b);
  });

  it('different seeds yield different first pair', () => {
    const a = makeEsportQueue(1);
    const b = makeEsportQueue(2);
    expect(a[0]).not.toEqual(b[0]);
  });

  it('first 2 pairs use only 3 distinct colors', () => {
    const q = makeEsportQueue(123456);
    const colors = new Set<string>();
    colors.add(q[0]!.axis);
    colors.add(q[0]!.child);
    colors.add(q[1]!.axis);
    colors.add(q[1]!.child);
    expect(colors.size).toBeLessThanOrEqual(3);
  });

  it('all colors are valid (R B Y P)', () => {
    const q = makeEsportQueue(7);
    for (const p of q) {
      expect(['R', 'B', 'Y', 'P']).toContain(p.axis);
      expect(['R', 'B', 'Y', 'P']).toContain(p.child);
    }
  });
});

describe('getEsportQueue (memoized)', () => {
  it('returns same array reference for same seed', () => {
    const a = getEsportQueue(99);
    const b = getEsportQueue(99);
    expect(a).toBe(b);
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `npm test -- rng`
Expected: FAIL — `makeEsportQueue` not exported

- [ ] **Step 3: Replace `src/game/rng.ts`**

```ts
import type { Pair, Color } from './types';

// Puyo eSport の本物 RNG をそのまま port(ama/core/cell.h::create_queue)
// 1 seed → 128 ペアの確定的キュー。
//
// 色マッピング: ama 0=R, 1=Y, 2=G, 3=B → ours 0=R, 1=Y, 2=P, 3=B
//   (Green が我々の Purple、見た目だけのラベル差)

const COLOR_MAP: readonly Color[] = ['R', 'Y', 'P', 'B'] as const;

function makeLcg(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (Math.imul(s, 0x5d588b65) + 0x269ec3) >>> 0;
    return s;
  };
}

export function makeEsportQueue(seed: number): readonly Pair[] {
  const rng = makeLcg(seed);
  for (let i = 0; i < 5; i++) rng();

  const queues: number[][] = [
    new Array(256).fill(0),
    new Array(256).fill(0),
    new Array(256).fill(0),
  ];
  for (let mode = 0; mode < 3; mode++) {
    const base = mode + 3; // 3, 4, 5 colors
    for (let i = 0; i < 256; i++) queues[mode]![i] = i % base;
  }

  for (let mode = 0; mode < 3; mode++) {
    const q = queues[mode]!;
    // 1st shuffle: 15 cols × 8 swaps, shift 28
    for (let col = 0; col < 15; col++) {
      for (let i = 0; i < 8; i++) {
        const n1 = (rng() >>> 28) + col * 16;
        const n2 = (rng() >>> 28) + (col + 1) * 16;
        const t = q[n1]!;
        q[n1] = q[n2]!;
        q[n2] = t;
      }
    }
    // 2nd shuffle: 7 cols × 16 swaps, shift 27
    for (let col = 0; col < 7; col++) {
      for (let i = 0; i < 16; i++) {
        const n1 = (rng() >>> 27) + col * 32;
        const n2 = (rng() >>> 27) + (col + 1) * 32;
        const t = q[n1]!;
        q[n1] = q[n2]!;
        q[n2] = t;
      }
    }
    // 3rd shuffle: 3 cols × 32 swaps, shift 26
    for (let col = 0; col < 3; col++) {
      for (let i = 0; i < 32; i++) {
        const n1 = (rng() >>> 26) + col * 64;
        const n2 = (rng() >>> 26) + (col + 1) * 64;
        const t = q[n1]!;
        q[n1] = q[n2]!;
        q[n2] = t;
      }
    }
  }

  // Replace first 2 pairs (4 cells) of 4-color/5-color queues with 3-color queue
  for (let i = 0; i < 4; i++) {
    queues[1]![i] = queues[0]![i]!;
    queues[2]![i] = queues[0]![i]!;
  }

  // Adopt 4-color queue (mode 1), pack into 128 pairs
  const m1 = queues[1]!;
  const result: Pair[] = [];
  for (let i = 0; i < 128; i++) {
    result.push({
      axis: COLOR_MAP[m1[i * 2]!]!,
      child: COLOR_MAP[m1[i * 2 + 1]!]!,
    });
  }
  return result;
}

const cache = new Map<number, readonly Pair[]>();

export function getEsportQueue(seed: number): readonly Pair[] {
  const key = seed >>> 0;
  let q = cache.get(key);
  if (!q) {
    q = makeEsportQueue(key);
    cache.set(key, q);
  }
  return q;
}
```

- [ ] **Step 4: Run to verify pass**

Run: `npm test -- rng`
Expected: PASS(6 assertions)

- [ ] **Step 5: Commit**

```bash
git add src/game/rng.ts src/game/__tests__/rng.test.ts
git commit -m "feat(rng): switch to Puyo eSport-compatible queue generation"
```

---

## Task 2: RNG cross-spec fixtures

`src/shared/specs/rng_spec.json` に固定 5 ケース(seed → 最初 8 ツモ)を保存。TS と Python の整合確認の根拠にする。

**Files:**
- Create: `src/shared/specs/rng_spec.json`
- Create: `src/game/__tests__/rng_spec.test.ts`

### 値の出し方

`getEsportQueue(seed)` を実行して最初 8 ペアを記録する。完全な期待値は実装(Task 1)後に手で生成する。**Step 1 では仮 seed と placeholder を JSON に置き、Step 3 で実装を走らせて得た値で確定させる**。

- [ ] **Step 1: Generate expected values**

Run a one-off script:

```bash
cat > /tmp/gen_rng_spec.mjs <<'EOF'
import { getEsportQueue } from './src/game/rng.ts';
const seeds = [0, 1, 42, 12345, 7777];
const cases = seeds.map((s) => ({
  seed: s,
  first8: getEsportQueue(s).slice(0, 8).map((p) => ({ axis: p.axis, child: p.child })),
}));
console.log(JSON.stringify({ cases }, null, 2));
EOF
npx tsx /tmp/gen_rng_spec.mjs > src/shared/specs/rng_spec.json
rm /tmp/gen_rng_spec.mjs
```

Verify the file:
```bash
cat src/shared/specs/rng_spec.json | head -20
```

Expected: well-formed JSON with `cases: [{ seed, first8: [...] }]`、5 cases、each `first8` は 8 個の `{axis, child}`。

- [ ] **Step 2: Write the cross-test**

Create `src/game/__tests__/rng_spec.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { getEsportQueue } from '../rng';
import spec from '../../shared/specs/rng_spec.json';
import type { Color } from '../types';

describe('rng_spec.json', () => {
  it('has 5 cases', () => {
    expect(spec.cases.length).toBe(5);
  });

  it('each case matches getEsportQueue output', () => {
    for (const c of spec.cases) {
      const q = getEsportQueue(c.seed);
      const first8 = q.slice(0, 8).map((p) => ({ axis: p.axis as Color, child: p.child as Color }));
      expect(first8).toEqual(c.first8);
    }
  });
});
```

- [ ] **Step 3: Run to verify pass**

Run: `npm test -- rng_spec`
Expected: PASS(2 assertions)

- [ ] **Step 4: Commit**

```bash
git add src/shared/specs/rng_spec.json src/game/__tests__/rng_spec.test.ts
git commit -m "feat(shared): add rng_spec fixtures for cross-language RNG validation"
```

---

## Task 3: GameState refactor

`GameState` に `queueIndex: number` を追加し、`createInitialState` / `spawnNext` を新 RNG 経由に切替。既存の `state.test.ts` の seed→pair 期待値を更新。

**Files:**
- Modify: `src/game/types.ts`
- Modify: `src/game/state.ts`
- Modify: `src/game/__tests__/state.test.ts`
- Modify: `src/ui/store.ts`(reset 呼出しに変更ない確認のみ、修正無しの可能性あり)

- [ ] **Step 1: Update `GameState` type**

Edit `src/game/types.ts`:

```ts
export interface GameState {
  readonly field: Field;
  readonly current: ActivePair | null;
  readonly nextQueue: ReadonlyArray<Pair>;
  readonly score: number;
  readonly chainCount: number;
  readonly totalChains: number;
  readonly maxChain: number;
  readonly status: GameStatus;
  readonly rngSeed: number;        // ※ 意味変更: 初期 seed(以後不変)
  readonly queueIndex: number;     // ★ 新規: queue 内の次取り出し位置
}
```

- [ ] **Step 2: Update `state.ts`**

Replace `src/game/state.ts` content:

```ts
import type { GameState, ActivePair, Pair, Move } from './types';
import { SPAWN_COL, SPAWN_AXIS_ROW } from './constants';
import { createEmptyField } from './field';
import { getEsportQueue } from './rng';
import { resolveChain } from './chain';
import { lockActive } from './landing';
import { canPlace } from './pair';

const VISIBLE_QUEUE_SIZE = 5; // current 1 + nextQueue 5 = 6 ペア消費

export function createInitialState(seed: number): GameState {
  const queue = getEsportQueue(seed);
  const first = queue[0]!;
  const nextQueue: Pair[] = [];
  for (let i = 1; i <= VISIBLE_QUEUE_SIZE; i++) nextQueue.push(queue[i]!);

  const active: ActivePair = {
    pair: first,
    axisRow: SPAWN_AXIS_ROW,
    axisCol: SPAWN_COL,
    rotation: 0,
  };

  return {
    field: createEmptyField(),
    current: active,
    nextQueue,
    score: 0,
    chainCount: 0,
    totalChains: 0,
    maxChain: 0,
    status: 'playing',
    rngSeed: seed,
    queueIndex: 1 + VISIBLE_QUEUE_SIZE, // = 6, 次取り出しは queue[6]
  };
}

export function spawnNext(state: GameState): GameState {
  const queue = getEsportQueue(state.rngSeed);
  const nextPair = state.nextQueue[0]!;
  const newPair = queue[state.queueIndex % queue.length]!;
  const refilled = [...state.nextQueue.slice(1), newPair];

  const active: ActivePair = {
    pair: nextPair,
    axisRow: SPAWN_AXIS_ROW,
    axisCol: SPAWN_COL,
    rotation: 0,
  };

  if (!canPlace(state.field, active)) {
    return {
      ...state,
      current: null,
      nextQueue: refilled,
      status: 'gameover',
      queueIndex: state.queueIndex + 1,
    };
  }

  return {
    ...state,
    current: active,
    nextQueue: refilled,
    status: 'playing',
    queueIndex: state.queueIndex + 1,
  };
}

export function commitMove(state: GameState, move: Move): GameState {
  if (!state.current) return state;
  const placed: ActivePair = {
    ...state.current,
    axisCol: move.axisCol,
    rotation: move.rotation,
  };
  const locked = lockActive(state.field, placed);
  const { finalField, steps, totalScore } = resolveChain(locked);
  const resolvedState: GameState = {
    ...state,
    field: finalField,
    current: null,
    score: state.score + totalScore,
    chainCount: steps.length,
    totalChains: state.totalChains + steps.length,
    maxChain: Math.max(state.maxChain, steps.length),
    status: 'resolving',
  };
  return spawnNext(resolvedState);
}
```

- [ ] **Step 3: Run state tests to see what breaks**

Run: `npm test -- state`
Expected: FAIL — 既存テストの seed→pair 期待値が古い

- [ ] **Step 4: Update existing state tests with new expected values**

Read `src/game/__tests__/state.test.ts`. The tests check:
- `s.current!.pair` shape (not value-specific)
- `s.nextQueue.length >= 2`
- `commitMove` 結果の `status === 'playing'`

Most tests check **structural properties** rather than specific colors, so probably they still pass after the RNG change. Run them and see — only update if real failures.

If `same seed gives same pair` test exists, it should still pass because RNG is still deterministic per seed.

If a test asserts a specific color (e.g., "seed 1 axis is R"), update with the new expected value (run `getEsportQueue(1)[0]` once and use that).

- [ ] **Step 5: Run all tests to verify pass**

Run: `npm test`
Expected: ALL PASS(再生成された rng_spec.json による rng_spec test も含む)

If anything fails, fix the assertion values to match the new RNG output.

- [ ] **Step 6: Commit**

```bash
git add src/game/types.ts src/game/state.ts src/game/__tests__/state.test.ts
git commit -m "feat(state): use Puyo eSport queue with queueIndex"
```

---

## Task 4: Python env_rng + cross-test

`python/puyo_train/env_rng.py` で TS と完全同一の queue を返す関数 `get_esport_queue(seed)` を実装。`rng_spec.json` で TS と一致を検証。

**Files:**
- Create: `python/puyo_train/env_rng.py`
- Create: `python/tests/test_env_rng.py`

- [ ] **Step 1: Write the failing test**

Create `python/tests/test_env_rng.py`:

```python
import json
from pathlib import Path

from puyo_train.env_rng import get_esport_queue, make_esport_queue, COLOR_MAP

SPEC_PATH = Path(__file__).resolve().parents[2] / "src/shared/specs/rng_spec.json"


def load_spec():
    with SPEC_PATH.open() as f:
        return json.load(f)


def test_color_map():
    assert COLOR_MAP == ("R", "Y", "P", "B")


def test_returns_128_pairs():
    q = make_esport_queue(42)
    assert len(q) == 128


def test_first_2_pairs_use_3_colors():
    q = make_esport_queue(123456)
    colors = set()
    for p in q[:2]:
        colors.add(p[0])
        colors.add(p[1])
    assert len(colors) <= 3


def test_cross_spec_matches_ts():
    spec = load_spec()
    for case in spec["cases"]:
        q = get_esport_queue(case["seed"])
        first8 = [{"axis": p[0], "child": p[1]} for p in q[:8]]
        assert first8 == case["first8"], f"seed {case['seed']} mismatch"


def test_get_esport_queue_caches():
    a = get_esport_queue(99)
    b = get_esport_queue(99)
    assert a is b
```

- [ ] **Step 2: Run to verify failure**

Run (from `python/`): `pytest tests/test_env_rng.py -q`
Expected: FAIL — `ImportError`

- [ ] **Step 3: Create `python/puyo_train/env_rng.py`**

```python
"""Puyo eSport-compatible queue generation. Mirrors src/game/rng.ts exactly."""
from __future__ import annotations

COLOR_MAP = ("R", "Y", "P", "B")  # ama: R Y G B → ours: R Y P B


def _lcg(seed: int):
    s = [seed & 0xFFFFFFFF]

    def rng() -> int:
        s[0] = ((s[0] * 0x5D588B65) + 0x269EC3) & 0xFFFFFFFF
        return s[0]

    return rng


def make_esport_queue(seed: int) -> list[tuple[str, str]]:
    rng = _lcg(seed)
    for _ in range(5):
        rng()

    queues = [
        [i % 3 for i in range(256)],
        [i % 4 for i in range(256)],
        [i % 5 for i in range(256)],
    ]

    for mode in range(3):
        q = queues[mode]
        # 1st shuffle: 15 × 8, shift 28
        for col in range(15):
            for _ in range(8):
                n1 = (rng() >> 28) + col * 16
                n2 = (rng() >> 28) + (col + 1) * 16
                q[n1], q[n2] = q[n2], q[n1]
        # 2nd shuffle: 7 × 16, shift 27
        for col in range(7):
            for _ in range(16):
                n1 = (rng() >> 27) + col * 32
                n2 = (rng() >> 27) + (col + 1) * 32
                q[n1], q[n2] = q[n2], q[n1]
        # 3rd shuffle: 3 × 32, shift 26
        for col in range(3):
            for _ in range(32):
                n1 = (rng() >> 26) + col * 64
                n2 = (rng() >> 26) + (col + 1) * 64
                q[n1], q[n2] = q[n2], q[n1]

    # Replace first 4 cells of 4-color/5-color with 3-color queue
    for i in range(4):
        queues[1][i] = queues[0][i]
        queues[2][i] = queues[0][i]

    m1 = queues[1]
    result: list[tuple[str, str]] = []
    for i in range(128):
        result.append((COLOR_MAP[m1[i * 2]], COLOR_MAP[m1[i * 2 + 1]]))
    return result


_cache: dict[int, list[tuple[str, str]]] = {}


def get_esport_queue(seed: int) -> list[tuple[str, str]]:
    key = seed & 0xFFFFFFFF
    if key not in _cache:
        _cache[key] = make_esport_queue(key)
    return _cache[key]
```

- [ ] **Step 4: Run to verify pass**

Run: `cd python && source .venv/bin/activate && pytest tests/test_env_rng.py -q`
Expected: PASS(5 tests)

- [ ] **Step 5: Commit**

```bash
git add python/puyo_train/env_rng.py python/tests/test_env_rng.py
git commit -m "feat(python): add Puyo eSport queue cross-validated with TS"
```

---

## Task 5: ama harness `tools/dump_selfplay.cpp`

ama リポジトリに 1 ファイル追加し、JSONL 出力するハーネスを作る。

**Files:**
- Create: `/Users/yasumitsuomori/git/ama/tools/dump_selfplay.cpp`
- Modify: `/Users/yasumitsuomori/git/ama/makefile`

### JSONL 出力スキーマ

各行 1 局面:

```json
{
  "game_id": 0,
  "move_index": 17,
  "field": ["......","......",...,"R.B.YY","RBBYP."],
  "current_axis": "R", "current_child": "B",
  "next1_axis": "Y", "next1_child": "P",
  "next2_axis": "R", "next2_child": "R",
  "topk": [
    {"axisCol": 2, "rotation": 0, "score": 12345},
    {"axisCol": 3, "rotation": 0, "score": 11200},
    ...
  ],
  "final_score": 18240,
  "final_max_chain": 5,
  "esport_seed": 12345
}
```

`field` は 13 行の string array、各行 6 文字、ours の color 記号(R/B/Y/P/`.`)。
`rotation` は ours の規約に合わせる(0=上、1=右、2=下、3=左)。ama の `direction::Type` は確認の上マッピング。

- [ ] **Step 1: Inspect ama's direction enum**

Read `/Users/yasumitsuomori/git/ama/core/direction.h`:

```bash
cat /Users/yasumitsuomori/git/ama/core/direction.h
```

Confirm the enum values for UP/RIGHT/DOWN/LEFT. Expected: UP=0, RIGHT=1, DOWN=2, LEFT=3 (matching ours). If different, adjust the conversion in dump.

- [ ] **Step 2: Create `/Users/yasumitsuomori/git/ama/tools/dump_selfplay.cpp`**

```cpp
#include <iostream>
#include <fstream>
#include <chrono>
#include <string>
#include <cstring>
#include <vector>
#include "../core/core.h"
#include "../ai/ai.h"

// ama color (RED=0, YELLOW=1, GREEN=2, BLUE=3) → ours (R, Y, P, B)
static char to_ours_char(cell::Type t) {
    switch (t) {
        case cell::Type::RED: return 'R';
        case cell::Type::YELLOW: return 'Y';
        case cell::Type::GREEN: return 'P';
        case cell::Type::BLUE: return 'B';
        default: return '.';
    }
}

// ama direction → ours rotation int
// UP=0, RIGHT=1, DOWN=2, LEFT=3 (assumed; verified in Step 1)
static int to_rotation(direction::Type r) {
    return static_cast<int>(r);
}

static std::string field_to_rows(const Field& f) {
    // ama Field uses bitfield. Sample each cell via field.get_cell(x, y).
    // y=0 is bottom row in ama; ours r=12 is bottom row (we want field[r][c] from top to bottom).
    // ama field rows: y=0..12 with y=0 at bottom; ours rows: r=0..12 with r=0 at top.
    // → map ama y to ours r as r = 12 - y.
    char rows[13][7]; // 6 chars + null
    for (int r = 0; r < 13; r++) {
        for (int c = 0; c < 6; c++) {
            int y = 12 - r;
            cell::Type t = f.get_cell(c, y);
            rows[r][c] = (t == cell::Type::NONE) ? '.' : to_ours_char(t);
        }
        rows[r][6] = '\0';
    }
    std::string out = "[";
    for (int r = 0; r < 13; r++) {
        if (r > 0) out += ",";
        out += "\"";
        out += rows[r];
        out += "\"";
    }
    out += "]";
    return out;
}

static void load_weight(beam::eval::Weight& w, const std::string& preset) {
    std::ifstream file("config.json");
    if (!file.good()) {
        std::cerr << "config.json not found\n";
        std::exit(1);
    }
    json js;
    file >> js;
    if (js.contains(preset)) {
        from_json(js[preset], w);
    } else {
        std::cerr << "preset " << preset << " not found in config.json\n";
        std::exit(1);
    }
}

int main(int argc, char** argv) {
    using namespace std;

    // Defaults
    int games = 1;
    uint32_t seed_base = 0;
    string preset = "build";
    string out_path = "selfplay.jsonl";
    int topk = 5;

    for (int i = 1; i + 1 < argc; i += 2) {
        string a = argv[i];
        string v = argv[i + 1];
        if (a == "--games") games = std::stoi(v);
        else if (a == "--seed") seed_base = (uint32_t)std::stoul(v);
        else if (a == "--weights") preset = v;
        else if (a == "--out") out_path = v;
        else if (a == "--topk") topk = std::stoi(v);
    }

    beam::eval::Weight w;
    load_weight(w, preset);

    ofstream out(out_path);
    if (!out) {
        cerr << "cannot open " << out_path << " for writing\n";
        return 1;
    }

    for (int gid = 0; gid < games; gid++) {
        uint32_t seed = seed_base + (uint32_t)gid;
        auto queue = cell::create_queue(seed);
        Field field;
        int score = 0;
        int max_chain = 0;
        int move_index = 0;

        // Cache rows for the whole game; we need them at end for final_score/max_chain.
        // Strategy: collect rows then write at end of each game.
        vector<string> rows;

        for (int i = 0; i < 200; ++i) {
            if (field.get_height(2) > 11) break;

            cell::Queue tqueue;
            tqueue.push_back(queue[(i + 0) % 128]);
            tqueue.push_back(queue[(i + 1) % 128]);

            auto ai_result = beam::search_multi(field, tqueue, w);
            if (ai_result.candidates.empty()) break;

            // Build JSONL row for this state
            string row;
            row += "{";
            row += "\"game_id\":" + to_string(gid) + ",";
            row += "\"move_index\":" + to_string(move_index) + ",";
            row += "\"field\":" + field_to_rows(field) + ",";
            row += "\"current_axis\":\"";
            row += to_ours_char(tqueue[0].first);
            row += "\",";
            row += "\"current_child\":\"";
            row += to_ours_char(tqueue[0].second);
            row += "\",";
            cell::Pair n1 = queue[(i + 1) % 128];
            cell::Pair n2 = queue[(i + 2) % 128];
            row += "\"next1_axis\":\""; row += to_ours_char(n1.first); row += "\",";
            row += "\"next1_child\":\""; row += to_ours_char(n1.second); row += "\",";
            row += "\"next2_axis\":\""; row += to_ours_char(n2.first); row += "\",";
            row += "\"next2_child\":\""; row += to_ours_char(n2.second); row += "\",";
            // top-K
            row += "\"topk\":[";
            int k_emit = std::min((int)ai_result.candidates.size(), topk);
            for (int k = 0; k < k_emit; k++) {
                if (k > 0) row += ",";
                auto& cand = ai_result.candidates[k];
                row += "{\"axisCol\":" + to_string((int)cand.placement.x) + ",";
                row += "\"rotation\":" + to_string(to_rotation(cand.placement.r)) + ",";
                row += "\"score\":" + to_string((long long)cand.score) + "}";
            }
            row += "],";
            row += "\"esport_seed\":" + to_string((long long)seed);
            row += "}";

            rows.push_back(row);

            // Apply best move
            auto& mv = ai_result.candidates[0];
            field.drop_pair(mv.placement.x, mv.placement.r, tqueue[0]);
            auto mask = field.pop();
            auto chain = chain::get_score(mask);
            score += (int)chain.score;
            if ((int)chain.count > max_chain) max_chain = (int)chain.count;
            move_index++;
        }

        // Append final_score / final_max_chain to each row of this game
        // (we collected without those fields; rewrite with terminator replacement)
        const string suffix_pattern = "\"esport_seed\":";
        for (auto& r : rows) {
            // Insert before the closing "}"
            size_t insert_at = r.size() - 1;
            string ext = ",\"final_score\":" + to_string(score) +
                         ",\"final_max_chain\":" + to_string(max_chain);
            r.insert(insert_at, ext);
            out << r << "\n";
        }
        rows.clear();
    }

    return 0;
}
```

- [ ] **Step 3: Update Makefile**

Edit `/Users/yasumitsuomori/git/ama/makefile` — add a new target after the existing `tuner` target:

```make
SRC_DUMP = core/*.cpp ai/*.cpp ai/search/*.cpp ai/search/beam/*.cpp

dump_selfplay: makedir
	@$(CXX) $(CXXFLAGS) $(SRC_DUMP) tools/dump_selfplay.cpp -o bin/dump_selfplay/dump_selfplay.exe
```

Also update the `makedir` target to include the new directory (find the existing `makedir` and add a `mkdir` for `bin/dump_selfplay`).

- [ ] **Step 4: Build (Apple Silicon, no PEXT)**

Run from `/Users/yasumitsuomori/git/ama/`:

```bash
cd /Users/yasumitsuomori/git/ama
make dump_selfplay
```

Expected: `bin/dump_selfplay/dump_selfplay.exe` is created.

If build fails on Apple Silicon due to `-msse4` or missing intrinsics, options:
- Try `make dump_selfplay CXXFLAGS+="-arch x86_64"` to use Rosetta
- If still fails, see Risks section in spec — fall back to Linux Docker

- [ ] **Step 5: Smoke run 1 game**

```bash
cd /Users/yasumitsuomori/git/ama
./bin/dump_selfplay/dump_selfplay.exe --games 1 --seed 42 --weights build --out /tmp/ama-smoke.jsonl --topk 5
wc -l /tmp/ama-smoke.jsonl
head -1 /tmp/ama-smoke.jsonl | python3 -m json.tool | head -30
```

Expected: file has 30-50 lines (1 game's worth), each line is well-formed JSON with `game_id`, `move_index`, `field` (13 strings of length 6), `current_axis/child`, `next1/2_*`, `topk` (1-5 entries with `axisCol`/`rotation`/`score`), `final_score > 0`, `final_max_chain >= 0`, `esport_seed: 42`.

- [ ] **Step 6: Commit ama changes**

In ama repository:
```bash
cd /Users/yasumitsuomori/git/ama
git add tools/dump_selfplay.cpp makefile
git commit -m "feat(tools): add dump_selfplay JSONL harness"
```

Then return to puyo-mvp:
```bash
cd /Users/yasumitsuomori/git/puyo-simulator/.worktrees/puyo-mvp
```

(no commit on puyo-mvp side for this task — the binary is in ama's repo)

---

## Task 6: TS wrapper `scripts/ama-selfplay.ts`

ama バイナリを subprocess で並列に呼ぶラッパ。並列度・seed 範囲・出力ディレクトリを指定。

**Files:**
- Create: `scripts/ama-selfplay.ts`
- Modify: `package.json`(scripts: `ama-selfplay`)
- Modify: `.gitignore`(`data/ama-selfplay/` 追加)

- [ ] **Step 1: Update `.gitignore`**

Append to `.gitignore`:
```
data/ama-selfplay/
```

- [ ] **Step 2: Add npm script**

Edit `package.json`, add to `"scripts"`:
```json
"ama-selfplay": "tsx scripts/ama-selfplay.ts"
```

- [ ] **Step 3: Create `scripts/ama-selfplay.ts`**

```ts
import { spawn } from 'node:child_process';
import { mkdirSync, existsSync } from 'node:fs';
import { join, resolve as resolvePath } from 'node:path';

const AMA_REPO = process.env.AMA_REPO ?? '/Users/yasumitsuomori/git/ama';
const AMA_BIN = join(AMA_REPO, 'bin/dump_selfplay/dump_selfplay.exe');

interface Args {
  games: number;
  workers: number;
  seed: number;
  weights: string;
  outDir: string;
  topk: number;
}

function parseArgs(): Args {
  const a = process.argv.slice(2);
  const get = (k: string, d: string) => {
    const i = a.indexOf(k);
    return i >= 0 && i + 1 < a.length ? a[i + 1]! : d;
  };
  return {
    games: Number(get('--games', '50000')),
    workers: Number(get('--workers', '8')),
    seed: Number(get('--seed', '20260425')),
    weights: get('--weights', 'build'),
    outDir: get('--out', 'data/ama-selfplay'),
    topk: Number(get('--topk', '5')),
  };
}

async function main() {
  const args = parseArgs();
  if (!existsSync(AMA_BIN)) {
    console.error(`ama binary not found at ${AMA_BIN}`);
    console.error('Build it first: cd /Users/yasumitsuomori/git/ama && make dump_selfplay');
    process.exit(1);
  }
  if (!existsSync(args.outDir)) mkdirSync(args.outDir, { recursive: true });

  const perWorker = Math.ceil(args.games / args.workers);
  console.log(`Running ${args.games} games across ${args.workers} workers (~${perWorker}/worker)`);
  const start = Date.now();

  const promises: Promise<void>[] = [];
  for (let w = 0; w < args.workers; w++) {
    const wgames = Math.min(perWorker, args.games - w * perWorker);
    if (wgames <= 0) continue;
    const wseed = args.seed + w * perWorker;
    const wout = resolvePath(join(args.outDir, `ama-${args.seed}-w${w}.jsonl`));
    const cmd = [
      AMA_BIN,
      '--games', String(wgames),
      '--seed', String(wseed),
      '--weights', args.weights,
      '--out', wout,
      '--topk', String(args.topk),
    ];
    promises.push(
      new Promise((resolve, reject) => {
        const proc = spawn(cmd[0]!, cmd.slice(1), { cwd: AMA_REPO, stdio: 'inherit' });
        proc.on('error', reject);
        proc.on('exit', (code) => {
          if (code === 0) {
            console.log(`worker ${w}: done (${wgames} games → ${wout})`);
            resolve();
          } else {
            reject(new Error(`worker ${w} exited ${code}`));
          }
        });
      }),
    );
  }
  await Promise.all(promises);
  const elapsed = (Date.now() - start) / 1000;
  console.log(`all workers complete in ${elapsed.toFixed(1)}s (${(args.games / elapsed).toFixed(2)} games/s)`);
}

void main();
```

- [ ] **Step 4: Smoke run 4 games / 2 workers**

Run from puyo-mvp directory:
```bash
npm run ama-selfplay -- --games 4 --workers 2 --seed 100 --out data/ama-selfplay
```

Expected:
- Two output files: `data/ama-selfplay/ama-100-w0.jsonl`, `ama-100-w1.jsonl`
- Each has ~30-50 lines (2 games each)
- Last line of each file has `final_score > 0`

Verify:
```bash
ls -la data/ama-selfplay/
wc -l data/ama-selfplay/*.jsonl
```

- [ ] **Step 5: Commit**

```bash
git add scripts/ama-selfplay.ts package.json .gitignore
git commit -m "feat(scripts): add ama parallel self-play wrapper"
```

---

## Task 7: Python `dataset_ama.py`

JSONL を読み込み、top-K を 22-class soft policy に展開する PyTorch Dataset。

**Files:**
- Create: `python/puyo_train/dataset_ama.py`
- Create: `python/tests/test_dataset_ama.py`

- [ ] **Step 1: Write the failing test**

Create `python/tests/test_dataset_ama.py`:

```python
import json
from pathlib import Path

import numpy as np
import torch

from puyo_train.dataset_ama import (
    AmaDataset,
    make_soft_policy,
    value_target_from_score,
)


def _row(game_id=0, move_index=0, action_top1=2, score=18000, chain=4):
    field = [["." for _ in range(6)] for _ in range(13)]
    return {
        "game_id": game_id,
        "move_index": move_index,
        "field": ["".join(row) for row in field],
        "current_axis": "R", "current_child": "B",
        "next1_axis": "Y", "next1_child": "P",
        "next2_axis": "R", "next2_child": "R",
        "topk": [
            {"axisCol": action_top1, "rotation": 0, "score": 1000},
            {"axisCol": (action_top1 + 1) % 6, "rotation": 0, "score": 800},
            {"axisCol": (action_top1 + 2) % 6, "rotation": 0, "score": 600},
        ],
        "final_score": score,
        "final_max_chain": chain,
        "esport_seed": 1,
    }


def _write(tmp_path: Path, rows):
    p = tmp_path / "mini.jsonl"
    with p.open("w") as f:
        for r in rows:
            f.write(json.dumps(r) + "\n")
    return p


def test_make_soft_policy_sums_to_one():
    p = make_soft_policy([1000, 800, 600], [2, 3, 4], temperature=100.0)
    assert p.shape == (22,)
    assert abs(p.sum() - 1.0) < 1e-5
    # Top-1 (action 2) has highest probability
    assert p.argmax() == 2
    # Untouched indices are 0
    assert p[0] == 0.0
    assert p[5] == 0.0


def test_value_target_monotonic():
    a = value_target_from_score(1000)
    b = value_target_from_score(20000)
    c = value_target_from_score(80000)
    assert -1.0 <= a < b < c <= 1.0


def test_dataset_loads(tmp_path: Path):
    rows = [_row(action_top1=i % 6) for i in range(8)]
    p = _write(tmp_path, rows)
    ds = AmaDataset([p])
    assert len(ds) == 8
    board, queue, policy, value = ds[3]
    assert board.shape == (13, 6, 7)
    assert queue.shape == (16,)
    assert policy.shape == (22,)
    assert abs(float(policy.sum()) - 1.0) < 1e-5
    assert -1.0 <= float(value) <= 1.0


def test_dataloader_batches(tmp_path: Path):
    rows = [_row(action_top1=i % 6) for i in range(13)]
    p = _write(tmp_path, rows)
    ds = AmaDataset([p])
    loader = torch.utils.data.DataLoader(ds, batch_size=4, shuffle=False)
    batches = list(loader)
    assert len(batches) == 4  # 4+4+4+1
    b, q, pol, v = batches[0]
    assert b.shape == (4, 13, 6, 7)
    assert q.shape == (4, 16)
    assert pol.shape == (4, 22)
    assert v.shape == (4,)
```

- [ ] **Step 2: Run to verify failure**

Run: `cd python && source .venv/bin/activate && pytest tests/test_dataset_ama.py -q`
Expected: FAIL — `ImportError`

- [ ] **Step 3: Create `python/puyo_train/dataset_ama.py`**

```python
"""Dataset for ama distillation: reads JSONL with top-K teacher candidates,
returns (board, queue, soft_policy, value_target) tensors."""
from __future__ import annotations

import json
import math
from pathlib import Path
from typing import Sequence

import numpy as np
import torch
from torch.utils.data import Dataset

from .action import move_to_action_index
from .encoding import encode_state

VALUE_SCALE = 50000.0  # bigger than 5a's 20000 because ama scores higher


def value_target_from_score(score: float) -> float:
    return float(math.tanh(score / VALUE_SCALE))


def make_soft_policy(
    scores: Sequence[float],
    indices: Sequence[int],
    temperature: float = 100.0,
) -> np.ndarray:
    """Return a 22-dim soft probability vector with mass on `indices`,
    proportional to softmax(scores / temperature)."""
    p = np.zeros(22, dtype=np.float32)
    s = np.array(scores, dtype=np.float32)
    s = (s - s.max()) / max(temperature, 1e-3)
    e = np.exp(s)
    e /= e.sum()
    for idx, prob in zip(indices, e):
        p[idx] = prob
    return p


def _row_to_state(row: dict) -> dict:
    field_rows = row["field"]
    field = []
    for r in range(13):
        row_chars = field_rows[r]
        row_cells = []
        for c in range(6):
            ch = row_chars[c]
            row_cells.append(ch if ch in ("R", "B", "Y", "P") else None)
        field.append(row_cells)
    return {
        "field": field,
        "current": {
            "axis": row["current_axis"],
            "child": row["current_child"],
            "axisRow": 1, "axisCol": 2, "rotation": 0,
        },
        "next_queue": [
            {"axis": row["next1_axis"], "child": row["next1_child"]},
            {"axis": row["next2_axis"], "child": row["next2_child"]},
        ],
    }


class AmaDataset(Dataset):
    """Loads ama JSONL files, exposes (board, queue, soft_policy, value)."""

    def __init__(self, files: list[Path], temperature: float = 100.0):
        rows: list[dict] = []
        for f in files:
            with open(f) as fp:
                for line in fp:
                    line = line.strip()
                    if not line:
                        continue
                    rows.append(json.loads(line))
        self.rows = rows
        self.temperature = temperature

    def __len__(self) -> int:
        return len(self.rows)

    def __getitem__(self, idx: int):
        row = self.rows[idx]
        state = _row_to_state(row)
        board, queue, _ = encode_state(state)
        topk = row["topk"]
        scores = [c["score"] for c in topk]
        indices = [move_to_action_index(c["axisCol"], c["rotation"]) for c in topk]
        policy = make_soft_policy(scores, indices, self.temperature)
        value = value_target_from_score(float(row["final_score"]))
        return (
            torch.from_numpy(board),
            torch.from_numpy(queue),
            torch.from_numpy(policy),
            torch.tensor(value, dtype=torch.float32),
        )


def load_all(data_dir: Path, temperature: float = 100.0) -> AmaDataset:
    files = sorted(Path(data_dir).glob("*.jsonl"))
    if not files:
        raise FileNotFoundError(f"no JSONL files in {data_dir}")
    return AmaDataset(files, temperature=temperature)
```

- [ ] **Step 4: Run to verify pass**

Run: `pytest tests/test_dataset_ama.py -q`
Expected: PASS(4 tests)

- [ ] **Step 5: Commit**

```bash
git add python/puyo_train/dataset_ama.py python/tests/test_dataset_ama.py
git commit -m "feat(python): add AmaDataset for top-K soft target distillation"
```

---

## Task 8: Python `model_v2.py` ResNet

8 ブロック × 64ch ResNet で dual-head。約 1M params。

**Files:**
- Create: `python/puyo_train/model_v2.py`
- Create: `python/tests/test_model_v2.py`

- [ ] **Step 1: Write the failing test**

Create `python/tests/test_model_v2.py`:

```python
import torch

from puyo_train.model_v2 import PolicyValueNetV2


def test_forward_shapes():
    net = PolicyValueNetV2()
    board = torch.zeros(4, 13, 6, 7)
    queue = torch.zeros(4, 16)
    policy, value = net(board, queue)
    assert policy.shape == (4, 22)
    assert value.shape == (4,)


def test_param_count_around_1m():
    net = PolicyValueNetV2()
    n = sum(p.numel() for p in net.parameters())
    assert 700_000 < n < 1_500_000, f"param count unexpected: {n}"


def test_loss_finite_and_grad():
    net = PolicyValueNetV2()
    board = torch.zeros(2, 13, 6, 7)
    queue = torch.zeros(2, 16)
    policy_target = torch.zeros(2, 22)
    policy_target[:, 5] = 1.0
    value_target = torch.tensor([0.1, -0.2])
    p, v = net(board, queue)
    log_p = torch.log_softmax(p, dim=1)
    loss_p = -(policy_target * log_p).sum(dim=1).mean()
    loss_v = torch.nn.functional.mse_loss(v, value_target)
    loss = loss_p + loss_v
    assert torch.isfinite(loss)
    loss.backward()
    has_grad = any(
        p.grad is not None and torch.isfinite(p.grad).all() for p in net.parameters()
    )
    assert has_grad
```

- [ ] **Step 2: Run to verify failure**

Run: `pytest tests/test_model_v2.py -q`
Expected: FAIL — `ImportError`

- [ ] **Step 3: Create `python/puyo_train/model_v2.py`**

```python
from __future__ import annotations

import torch
from torch import nn


class ResBlock(nn.Module):
    def __init__(self, ch: int) -> None:
        super().__init__()
        self.conv1 = nn.Conv2d(ch, ch, kernel_size=3, padding=1, bias=False)
        self.bn1 = nn.BatchNorm2d(ch)
        self.conv2 = nn.Conv2d(ch, ch, kernel_size=3, padding=1, bias=False)
        self.bn2 = nn.BatchNorm2d(ch)

    def forward(self, x: torch.Tensor) -> torch.Tensor:
        y = torch.relu(self.bn1(self.conv1(x)))
        y = self.bn2(self.conv2(y))
        return torch.relu(x + y)


class PolicyValueNetV2(nn.Module):
    """ResNet 8 blocks × 64ch dual-head (policy 22 + value scalar).

    Input:  board (B, 13, 6, 7) NHWC, queue (B, 16)
    Output: policy_logits (B, 22), value (B,) tanh
    """

    BOARD_C = 7
    BOARD_H = 13
    BOARD_W = 6
    BLOCKS = 8
    CHANNELS = 64

    def __init__(self) -> None:
        super().__init__()
        self.stem = nn.Conv2d(self.BOARD_C, self.CHANNELS, kernel_size=3, padding=1, bias=False)
        self.stem_bn = nn.BatchNorm2d(self.CHANNELS)
        self.body = nn.ModuleList([ResBlock(self.CHANNELS) for _ in range(self.BLOCKS)])

        self.queue_fc = nn.Linear(16, 32)

        flat = self.BOARD_H * self.BOARD_W * self.CHANNELS
        self.trunk = nn.Linear(flat + 32, 128)
        self.policy_head = nn.Linear(128, 22)
        self.value_head = nn.Linear(128, 1)

    def forward(
        self, board: torch.Tensor, queue: torch.Tensor
    ) -> tuple[torch.Tensor, torch.Tensor]:
        # NHWC → NCHW
        x = board.permute(0, 3, 1, 2).contiguous()
        x = torch.relu(self.stem_bn(self.stem(x)))
        for blk in self.body:
            x = blk(x)
        x = x.flatten(start_dim=1)

        q = torch.relu(self.queue_fc(queue))

        h = torch.relu(self.trunk(torch.cat([x, q], dim=1)))
        policy = self.policy_head(h)
        value = torch.tanh(self.value_head(h)).squeeze(-1)
        return policy, value
```

- [ ] **Step 4: Run to verify pass**

Run: `pytest tests/test_model_v2.py -q`
Expected: PASS(3 tests)

Verify param count:
```bash
python -c "from puyo_train.model_v2 import PolicyValueNetV2; n = PolicyValueNetV2(); print('params:', sum(p.numel() for p in n.parameters()))"
```
Expected: ~1M(in [700k, 1.5M])

- [ ] **Step 5: Commit**

```bash
git add python/puyo_train/model_v2.py python/tests/test_model_v2.py
git commit -m "feat(python): add PolicyValueNetV2 (ResNet 8x64 dual-head)"
```

---

## Task 9: Python `distill.py` 学習ループ

soft policy + value の蒸留学習。`run_distillation(...)` を関数として exposable にして smoke test 可能にする。

**Files:**
- Create: `python/puyo_train/distill.py`
- Create: `python/tests/test_distill_smoke.py`

- [ ] **Step 1: Write the smoke test**

Create `python/tests/test_distill_smoke.py`:

```python
import json
from pathlib import Path

from puyo_train.distill import run_distillation


def _write_jsonl(tmp_path: Path, n: int = 32) -> Path:
    data_dir = tmp_path / "data"
    data_dir.mkdir()
    p = data_dir / "mini.jsonl"
    with p.open("w") as f:
        for i in range(n):
            row = {
                "game_id": i // 8,
                "move_index": i % 8,
                "field": ["......"] * 13,
                "current_axis": "R", "current_child": "B",
                "next1_axis": "Y", "next1_child": "P",
                "next2_axis": "R", "next2_child": "R",
                "topk": [
                    {"axisCol": i % 6, "rotation": 0, "score": 1000},
                    {"axisCol": (i + 1) % 6, "rotation": 0, "score": 800},
                ],
                "final_score": 5000 + 100 * i,
                "final_max_chain": 3,
                "esport_seed": 1,
            }
            f.write(json.dumps(row) + "\n")
    return data_dir


def test_smoke_distill(tmp_path: Path):
    data_dir = _write_jsonl(tmp_path, n=32)
    ckpt = tmp_path / "policy-ama.pt"
    history = run_distillation(
        data_dir=data_dir,
        out_path=ckpt,
        epochs=2,
        batch_size=8,
        lr=1e-3,
        device="cpu",
        val_fraction=0.25,
        seed=0,
    )
    assert ckpt.exists()
    assert len(history) == 2
    for h in history:
        assert h["train_loss"] >= 0
        assert h["val_loss"] >= 0
```

- [ ] **Step 2: Run to verify failure**

Run: `pytest tests/test_distill_smoke.py -q`
Expected: FAIL — `ImportError`

- [ ] **Step 3: Create `python/puyo_train/distill.py`**

```python
from __future__ import annotations

import random
from dataclasses import dataclass
from pathlib import Path

import numpy as np
import torch
from torch.utils.data import DataLoader, Subset

from .dataset_ama import load_all
from .model_v2 import PolicyValueNetV2


@dataclass
class EpochStat:
    epoch: int
    train_loss: float
    val_loss: float
    val_top1: float


def _soft_cross_entropy(logits: torch.Tensor, target: torch.Tensor) -> torch.Tensor:
    """KL-style cross entropy for soft targets. target is a probability vector."""
    log_p = torch.log_softmax(logits, dim=1)
    return -(target * log_p).sum(dim=1).mean()


def run_distillation(
    *,
    data_dir: Path,
    out_path: Path,
    epochs: int,
    batch_size: int,
    lr: float,
    device: str,
    val_fraction: float,
    seed: int = 0,
    alpha: float = 1.0,
    temperature: float = 100.0,
) -> list[dict]:
    torch.manual_seed(seed)
    random.seed(seed)
    np.random.seed(seed)

    ds = load_all(data_dir, temperature=temperature)
    n = len(ds)
    idx = list(range(n))
    random.shuffle(idx)
    split = max(1, int(n * (1.0 - val_fraction)))
    train_ds = Subset(ds, idx[:split])
    val_ds = Subset(ds, idx[split:]) if split < n else Subset(ds, idx[:1])

    train_loader = DataLoader(train_ds, batch_size=batch_size, shuffle=True)
    val_loader = DataLoader(val_ds, batch_size=batch_size, shuffle=False)

    net = PolicyValueNetV2().to(device)
    opt = torch.optim.Adam(net.parameters(), lr=lr, weight_decay=1e-4)
    sched = torch.optim.lr_scheduler.CosineAnnealingLR(opt, T_max=epochs)

    history: list[EpochStat] = []
    best_val = float("inf")
    for epoch in range(epochs):
        net.train()
        tr_losses: list[float] = []
        for board, queue, policy_target, value_target in train_loader:
            board = board.to(device); queue = queue.to(device)
            policy_target = policy_target.to(device); value_target = value_target.to(device)
            opt.zero_grad()
            p_logits, v_pred = net(board, queue)
            l_p = _soft_cross_entropy(p_logits, policy_target)
            l_v = torch.nn.functional.mse_loss(v_pred, value_target)
            loss = l_p + alpha * l_v
            loss.backward()
            opt.step()
            tr_losses.append(float(loss.item()))
        sched.step()

        net.eval()
        v_losses: list[float] = []
        top1_correct = 0; top1_total = 0
        with torch.no_grad():
            for board, queue, policy_target, value_target in val_loader:
                board = board.to(device); queue = queue.to(device)
                policy_target = policy_target.to(device); value_target = value_target.to(device)
                p_logits, v_pred = net(board, queue)
                l_p = _soft_cross_entropy(p_logits, policy_target)
                l_v = torch.nn.functional.mse_loss(v_pred, value_target)
                v_losses.append(float((l_p + alpha * l_v).item()))
                pred = p_logits.argmax(dim=1)
                gold = policy_target.argmax(dim=1)
                top1_correct += int((pred == gold).sum().item())
                top1_total += int(gold.numel())

        stat = EpochStat(
            epoch=epoch,
            train_loss=sum(tr_losses) / max(1, len(tr_losses)),
            val_loss=sum(v_losses) / max(1, len(v_losses)),
            val_top1=top1_correct / max(1, top1_total),
        )
        history.append(stat)
        print(f"epoch={stat.epoch} train={stat.train_loss:.4f} val={stat.val_loss:.4f} top1={stat.val_top1:.3f}")

        if stat.val_loss < best_val:
            best_val = stat.val_loss
            out_path.parent.mkdir(parents=True, exist_ok=True)
            torch.save(net.state_dict(), out_path)

    return [h.__dict__ for h in history]
```

- [ ] **Step 4: Run to verify pass**

Run: `pytest tests/test_distill_smoke.py -q`
Expected: PASS(1 test, ~10-30 sec for 2 epochs)

- [ ] **Step 5: Commit**

```bash
git add python/puyo_train/distill.py python/tests/test_distill_smoke.py
git commit -m "feat(python): add distillation training loop with soft target"
```

---

## Task 10: Python `train_ama.py` + export.py 引数化

エントリ + export パイプの model クラス選択。

**Files:**
- Create: `python/train_ama.py`
- Modify: `python/puyo_train/export.py`(model クラスを引数で選択)

- [ ] **Step 1: Create `python/train_ama.py`**

```python
from __future__ import annotations

import argparse
from pathlib import Path

from puyo_train.distill import run_distillation


def main() -> None:
    p = argparse.ArgumentParser()
    p.add_argument("--data", type=Path, default=Path("../data/ama-selfplay"))
    p.add_argument("--out", type=Path, default=Path("checkpoints/policy-ama-v1.pt"))
    p.add_argument("--epochs", type=int, default=30)
    p.add_argument("--batch", type=int, default=256)
    p.add_argument("--lr", type=float, default=1e-3)
    p.add_argument("--val", type=float, default=0.1)
    p.add_argument("--device", type=str, default="mps")
    p.add_argument("--temperature", type=float, default=100.0)
    args = p.parse_args()

    run_distillation(
        data_dir=args.data,
        out_path=args.out,
        epochs=args.epochs,
        batch_size=args.batch,
        lr=args.lr,
        device=args.device,
        val_fraction=args.val,
        temperature=args.temperature,
    )


if __name__ == "__main__":
    main()
```

- [ ] **Step 2: Update `python/puyo_train/export.py`**

Change `_NCHWExport`'s constructor to accept any `nn.Module` whose layers match `PolicyValueNet`/`PolicyValueNetV2`'s structure. Then add a `--model` argparse flag.

Edit `python/puyo_train/export.py`:

Replace the `export_to_onnx` function body and add CLI:

```python
def _detect_model_cls(state_dict: dict) -> type:
    """Pick model class by sniffing state_dict keys."""
    from .model import PolicyValueNet
    from .model_v2 import PolicyValueNetV2
    if any("body." in k for k in state_dict.keys()):
        return PolicyValueNetV2
    return PolicyValueNet


def export_to_onnx(ckpt_path: Path, onnx_path: Path) -> None:
    state = torch.load(ckpt_path, map_location="cpu")
    cls = _detect_model_cls(state)
    net = cls()
    net.load_state_dict(state)
    net.eval()
    wrapped = _NCHWExport(net).eval()

    dummy_board = torch.zeros(1, 7, 13, 6)
    dummy_queue = torch.zeros(1, 16)

    onnx_path.parent.mkdir(parents=True, exist_ok=True)
    torch.onnx.export(
        wrapped,
        (dummy_board, dummy_queue),
        str(onnx_path),
        input_names=["board", "queue"],
        output_names=["policy", "value"],
        dynamic_axes={
            "board": {0: "batch"}, "queue": {0: "batch"},
            "policy": {0: "batch"}, "value": {0: "batch"},
        },
        opset_version=17,
    )
```

The `_NCHWExport` wrapper needs to call layers manually. Update it to handle both architectures by dispatching based on isinstance:

```python
class _NCHWExport(nn.Module):
    def __init__(self, net: nn.Module) -> None:
        super().__init__()
        self.net = net

    def forward(self, board_nchw: torch.Tensor, queue: torch.Tensor):
        from .model import PolicyValueNet
        from .model_v2 import PolicyValueNetV2
        if isinstance(self.net, PolicyValueNetV2):
            x = torch.relu(self.net.stem_bn(self.net.stem(board_nchw)))
            for blk in self.net.body:
                x = blk(x)
            x = x.flatten(start_dim=1)
            q = torch.relu(self.net.queue_fc(queue))
            h = torch.relu(self.net.trunk(torch.cat([x, q], dim=1)))
            policy = self.net.policy_head(h)
            value = torch.tanh(self.net.value_head(h)).squeeze(-1)
            return policy, value
        # PolicyValueNet (5a small model)
        x = torch.relu(self.net.conv1(board_nchw))
        x = torch.relu(self.net.conv2(x))
        x = torch.relu(self.net.conv3(x))
        x = x.flatten(start_dim=1)
        q = torch.relu(self.net.queue_fc(queue))
        h = torch.relu(self.net.trunk(torch.cat([x, q], dim=1)))
        policy = self.net.policy_head(h)
        value = torch.tanh(self.net.value_head(h)).squeeze(-1)
        return policy, value
```

- [ ] **Step 3: Verify export.py still works for v1 model**

Run from `python/`:
```bash
source .venv/bin/activate
pytest tests/test_export.py -q
```
Expected: PASS (existing v1 export test still works)

- [ ] **Step 4: Quick test export of v2 (with random init)**

```bash
python -c "
import torch
from puyo_train.model_v2 import PolicyValueNetV2
net = PolicyValueNetV2()
torch.save(net.state_dict(), '/tmp/v2-rand.pt')
"
python -m puyo_train.export --ckpt /tmp/v2-rand.pt --out /tmp/v2-out
ls -la /tmp/v2-out/
```
Expected: `/tmp/v2-out/{model.json, group1-shard1of1.bin}` exist, total ~4MB.

If the export pipeline currently doesn't accept `--ckpt`/`--out` properly, also check `python/puyo_train/export.py`'s `main()` argparse — it should already accept those (from 5a).

- [ ] **Step 5: Commit**

```bash
git add python/train_ama.py python/puyo_train/export.py
git commit -m "feat(python): add train_ama entry + export model auto-detection"
```

---

## Task 11: ML AI modelKind switch

`MlAI` がコンストラクタで `'v1'` か `'ama-v1'` を受け取り、URL を切替え。

**Files:**
- Modify: `src/ai/ml/ml-ai.ts`
- Modify: `src/ai/ml/__tests__/ml-ai.test.ts`

- [ ] **Step 1: Update test to cover modelKind**

Edit `src/ai/ml/__tests__/ml-ai.test.ts` — add a new test (keep existing tests):

```ts
import { describe, it, expect, vi } from 'vitest';
// ... existing imports

describe('MlAI modelKind', () => {
  it('uses policy-v1 URL when kind = v1', () => {
    const ai = new MlAI('v1');
    expect(ai.version).toBe('policy-v1');
    expect(ai.modelUrl).toBe('/models/policy-v1/model.json');
  });

  it('uses policy-ama-v1 URL when kind = ama-v1', () => {
    const ai = new MlAI('ama-v1');
    expect(ai.version).toBe('policy-ama-v1');
    expect(ai.modelUrl).toBe('/models/policy-ama-v1/model.json');
  });
});
```

(`modelUrl` will be a `readonly` public field for testability.)

- [ ] **Step 2: Update existing tests in `ml-ai.test.ts` to construct `new MlAI('v1')`**

Find any `new MlAI()` instantiation in the existing tests and replace with `new MlAI('v1')`.

- [ ] **Step 3: Run to verify failure**

Run: `npm test -- ml-ai`
Expected: FAIL — `MlAI` constructor takes 0 args

- [ ] **Step 4: Update `src/ai/ml/ml-ai.ts`**

Replace constructor and add `modelUrl`:

```ts
export type MlModelKind = 'v1' | 'ama-v1';

const MODEL_URLS: Record<MlModelKind, string> = {
  'v1': '/models/policy-v1/model.json',
  'ama-v1': '/models/policy-ama-v1/model.json',
};

export class MlAI implements PuyoAI {
  readonly name = 'ml';
  readonly version: string;
  readonly modelUrl: string;
  private model: TfModel | null = null;
  private loading: Promise<void> | null = null;

  constructor(public readonly modelKind: MlModelKind) {
    this.version = `policy-${modelKind === 'v1' ? 'v1' : 'ama-v1'}`;
    this.modelUrl = MODEL_URLS[modelKind];
  }

  // ... rest of methods unchanged, but use this.modelUrl instead of MODEL_URL
}
```

Find the `loadModel()` method that referenced `MODEL_URL` and replace with `this.modelUrl`.

- [ ] **Step 5: Run to verify pass**

Run: `npm test -- ml-ai`
Expected: PASS(all existing tests + 2 new ones)

- [ ] **Step 6: Commit**

```bash
git add src/ai/ml/ml-ai.ts src/ai/ml/__tests__/ml-ai.test.ts
git commit -m "feat(ml): add modelKind selector to MlAI"
```

---

## Task 12: Worker `set-ai` 3 kinds

Worker が `'heuristic'`, `'ml-v1'`, `'ml-ama-v1'` の 3 種を受け付ける。

**Files:**
- Modify: `src/ai/worker/ai.worker.ts`
- Modify: `src/ai/worker/__tests__/ai.worker.test.ts`

- [ ] **Step 1: Update worker file**

Edit `src/ai/worker/ai.worker.ts`:

```ts
import { HeuristicAI } from '../heuristic';
import { MlAI } from '../ml/ml-ai';
import type { PuyoAI } from '../types';
import type { GameState, Move } from '../../game/types';

type Kind = 'heuristic' | 'ml-v1' | 'ml-ama-v1';

export type WorkerMessage =
  | { type: 'suggest'; id: number; state: GameState; topK: number }
  | { type: 'set-ai'; kind: Kind };

export type WorkerResponse =
  | { type: 'suggest'; id: number; moves: Move[] }
  | { type: 'set-ai'; kind: Kind; ok: boolean; error?: string };

const heuristic = new HeuristicAI();
let active: PuyoAI = heuristic;
const mlInstances: Partial<Record<'ml-v1' | 'ml-ama-v1', MlAI>> = {};

async function getOrInitMl(kind: 'ml-v1' | 'ml-ama-v1'): Promise<MlAI> {
  let inst = mlInstances[kind];
  if (!inst) {
    inst = new MlAI(kind === 'ml-v1' ? 'v1' : 'ama-v1');
    mlInstances[kind] = inst;
  }
  await inst.init();
  return inst;
}

export async function handleMessage(
  msg: WorkerMessage,
  send: (r: WorkerResponse) => void,
): Promise<void> {
  if (msg.type === 'set-ai') {
    try {
      if (msg.kind === 'heuristic') {
        active = heuristic;
        send({ type: 'set-ai', kind: 'heuristic', ok: true });
        return;
      }
      const ml = await getOrInitMl(msg.kind);
      active = ml;
      send({ type: 'set-ai', kind: msg.kind, ok: true });
    } catch (err) {
      active = heuristic;
      send({
        type: 'set-ai', kind: msg.kind, ok: false,
        error: err instanceof Error ? err.message : String(err),
      });
    }
    return;
  }
  if (msg.type === 'suggest') {
    await active.init();
    const moves = await active.suggest(msg.state, msg.topK);
    send({ type: 'suggest', id: msg.id, moves });
  }
}

if (typeof self !== 'undefined' && 'onmessage' in self) {
  (self as unknown as Worker).onmessage = (e: MessageEvent<WorkerMessage>) => {
    void handleMessage(e.data, (r) => (self as unknown as Worker).postMessage(r));
  };
}
```

- [ ] **Step 2: Update tests**

Edit `src/ai/worker/__tests__/ai.worker.test.ts` — add tests:

```ts
import { describe, it, expect } from 'vitest';
import { handleMessage } from '../ai.worker';
import { createInitialState } from '../../../game/state';

describe('ai.worker handleMessage', () => {
  it('suggest with default (heuristic) returns moves', async () => {
    const sent: unknown[] = [];
    const state = createInitialState(1);
    await handleMessage({ type: 'suggest', id: 7, state, topK: 3 }, (r) => sent.push(r));
    const r = sent[0] as { type: string; moves: unknown[] };
    expect(r.type).toBe('suggest');
    expect(r.moves.length).toBeGreaterThan(0);
  });

  it('set-ai heuristic always succeeds', async () => {
    const sent: unknown[] = [];
    await handleMessage({ type: 'set-ai', kind: 'heuristic' }, (r) => sent.push(r));
    expect((sent[0] as { ok: boolean }).ok).toBe(true);
  });

  it('set-ai ml-v1 falls back to heuristic on load error', async () => {
    const sent: unknown[] = [];
    await handleMessage({ type: 'set-ai', kind: 'ml-v1' }, (r) => sent.push(r));
    const r = sent[0] as { ok: boolean; error?: string };
    expect(r.ok).toBe(false);
    expect(r.error).toBeTruthy();
  });

  it('set-ai ml-ama-v1 falls back to heuristic on load error', async () => {
    const sent: unknown[] = [];
    await handleMessage({ type: 'set-ai', kind: 'ml-ama-v1' }, (r) => sent.push(r));
    const r = sent[0] as { ok: boolean; error?: string };
    expect(r.ok).toBe(false);
    expect(r.error).toBeTruthy();
  });
});
```

- [ ] **Step 3: Run tests**

Run: `npm test -- ai.worker`
Expected: PASS(4 tests)

Run full: `npm test`
Expected: ALL PASS

- [ ] **Step 4: Commit**

```bash
git add src/ai/worker/ai.worker.ts src/ai/worker/__tests__/ai.worker.test.ts
git commit -m "feat(ml): worker supports 3 AI kinds (heuristic, ml-v1, ml-ama-v1)"
```

---

## Task 13: Header 3-way selector

`Heuristic / ML (policy-v1) / ML (ama-distilled-v1)` の 3 択。デフォルトは `ml-ama-v1`。

**Files:**
- Modify: `src/ui/components/Header/Header.tsx`
- Modify: `src/ui/components/Header/__tests__/Header.test.tsx`
- Modify: `src/ui/hooks/useAiSuggestion.ts`(`setAiKind` の型を `Kind` 3 値に)

- [ ] **Step 1: Update `useAiSuggestion.ts`**

Edit `src/ui/hooks/useAiSuggestion.ts` — change the `Kind` type at module top:

```ts
type Kind = 'heuristic' | 'ml-v1' | 'ml-ama-v1';
```

The `setAiKind(kind)` function signature already takes `Kind`. The worker postMessage payload `{ type: 'set-ai', kind }` flows through fine.

- [ ] **Step 2: Update Header tests**

Edit `src/ui/components/Header/__tests__/Header.test.tsx`:

```tsx
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Header } from '../Header';

vi.mock('../../../hooks/useAiSuggestion', () => ({
  setAiKind: vi.fn(),
  useAiSuggestion: () => ({ moves: [], loading: false }),
}));

describe('Header AI selector (3-way)', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('defaults to ml-ama-v1 when localStorage is empty', () => {
    render(<Header />);
    const select = screen.getByLabelText('AI') as HTMLSelectElement;
    expect(select.value).toBe('ml-ama-v1');
  });

  it('reads ml-v1 from localStorage', () => {
    localStorage.setItem('puyo.ai.kind', 'ml-v1');
    render(<Header />);
    const select = screen.getByLabelText('AI') as HTMLSelectElement;
    expect(select.value).toBe('ml-v1');
  });

  it('reads heuristic from localStorage', () => {
    localStorage.setItem('puyo.ai.kind', 'heuristic');
    render(<Header />);
    const select = screen.getByLabelText('AI') as HTMLSelectElement;
    expect(select.value).toBe('heuristic');
  });

  it('persists change to localStorage and calls setAiKind', async () => {
    const { setAiKind } = (await import('../../../hooks/useAiSuggestion')) as unknown as {
      setAiKind: ReturnType<typeof vi.fn>;
    };
    render(<Header />);
    await userEvent.selectOptions(screen.getByLabelText('AI'), 'ml-v1');
    expect(localStorage.getItem('puyo.ai.kind')).toBe('ml-v1');
    expect(setAiKind).toHaveBeenCalledWith('ml-v1');
  });
});
```

- [ ] **Step 3: Run to verify failure**

Run: `npm test -- Header`
Expected: FAIL — default is `'heuristic'` but expected `'ml-ama-v1'`, value `ml-v1` not found

- [ ] **Step 4: Update `Header.tsx`**

Replace `src/ui/components/Header/Header.tsx`:

```tsx
import { useEffect, useState } from 'react';
import { setAiKind } from '../../hooks/useAiSuggestion';

const STORAGE_KEY = 'puyo.ai.kind';
type Kind = 'heuristic' | 'ml-v1' | 'ml-ama-v1';
const VALID: readonly Kind[] = ['heuristic', 'ml-v1', 'ml-ama-v1'] as const;

function readInitialKind(): Kind {
  const v =
    typeof localStorage !== 'undefined' ? localStorage.getItem(STORAGE_KEY) : null;
  return (VALID as readonly string[]).includes(v ?? '') ? (v as Kind) : 'ml-ama-v1';
}

export function Header() {
  const [kind, setKind] = useState<Kind>(readInitialKind);

  useEffect(() => {
    setAiKind(kind);
  }, [kind]);

  return (
    <header className="p-3 border-b border-slate-800 flex justify-between items-center">
      <span className="text-lg">Puyo Training</span>
      <label className="text-sm flex items-center gap-2">
        AI
        <select
          aria-label="AI"
          value={kind}
          onChange={(e) => {
            const next = e.target.value as Kind;
            setKind(next);
            localStorage.setItem(STORAGE_KEY, next);
          }}
          className="bg-slate-800 text-slate-100 border border-slate-700 rounded px-2 py-1"
        >
          <option value="heuristic">Heuristic</option>
          <option value="ml-v1">ML (policy-v1)</option>
          <option value="ml-ama-v1">ML (ama-distilled-v1)</option>
        </select>
      </label>
    </header>
  );
}
```

- [ ] **Step 5: Run tests**

Run: `npm test -- Header`
Expected: PASS(4 tests)

Run full suite: `npm test`
Expected: ALL PASS

- [ ] **Step 6: Commit**

```bash
git add src/ui/components/Header src/ui/hooks/useAiSuggestion.ts
git commit -m "feat(ui): add 3-way AI selector with ml-ama-v1 default"
```

---

## Task 14: ama AI adapter + eval-ai 3-way

評価スクリプトが ama 本体も呼べるようにする。`ama` AI は subprocess(stdin/stdout)で 1 手単位で問い合わせるアダプタ。

**Files:**
- Create: `scripts/ama-ai-node.ts`
- Modify: `scripts/eval-ai.ts`
- Modify: `/Users/yasumitsuomori/git/ama/tools/dump_selfplay.cpp`(stdin/stdout モードを追加するか、別ハーネス)

### Approach

ama の interactive 評価は subprocess で 1 手ずつ問い合わせるのが理想だが、stdin/stdout プロトコルをハーネスに足すのは大変。代替: **dump_selfplay の出力を再利用**して「ama がこの seed・条件でこう打った時のスコア」を比較する。

具体的には:
- ama vs ML 評価は **同じ seed セットで両方が独立にプレイ**して score を比較
- ama 側は `dump_selfplay --games 100 --seed N --out /tmp/ama-eval.jsonl` で実行、JSONL の `final_score` 列を集計
- ML 側は既存 `eval-ai.ts` で `playOne(ml-ama-v1-ai, seed)` を呼ぶ
- それぞれ 100 ゲームの平均スコアを出して比率計算

これだと top-1 一致率は計測できないが、平均スコア比は取れる。Top-1 一致率は別途、5a と同じ方法で計測(ML 同士の場合のみ)。

- [ ] **Step 1: Update `scripts/eval-ai.ts`**

Add a new mode that handles `ama` as a special case:

```ts
import { spawnSync } from 'node:child_process';
import { readFileSync, mkdirSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { createInitialState, commitMove } from '../src/game/state';
import { HeuristicAI } from '../src/ai/heuristic';
import { createNodeMlAI } from './ml-ai-node';
import type { PuyoAI } from '../src/ai/types';
import { moveToActionIndex } from '../src/game/action';

type AiKind = 'heuristic' | 'ml-v1' | 'ml-ama-v1' | 'ama';

const AMA_REPO = process.env.AMA_REPO ?? '/Users/yasumitsuomori/git/ama';
const AMA_BIN = join(AMA_REPO, 'bin/dump_selfplay/dump_selfplay.exe');

async function makeAi(kind: AiKind): Promise<PuyoAI | null> {
  if (kind === 'heuristic') return new HeuristicAI();
  if (kind === 'ml-v1') return await createNodeMlAI('public/models/policy-v1/model.json');
  if (kind === 'ml-ama-v1') return await createNodeMlAI('public/models/policy-ama-v1/model.json');
  if (kind === 'ama') return null; // sentinel — handled separately
  throw new Error(`unknown kind: ${kind}`);
}

async function playOne(ai: PuyoAI, seed: number): Promise<{ score: number; maxChain: number }> {
  let state = createInitialState(seed);
  for (let t = 0; t < 500; t++) {
    if (state.status === 'gameover' || !state.current) break;
    const moves = await ai.suggest(state, 1);
    const best = moves[0];
    if (!best) break;
    state = commitMove(state, best);
  }
  return { score: state.score, maxChain: state.maxChain };
}

function evalAmaGames(seed0: number, count: number): { score: number; maxChain: number }[] {
  if (!existsSync(AMA_BIN)) {
    throw new Error(`ama binary not found at ${AMA_BIN}`);
  }
  const tmp = '/tmp/ama-eval.jsonl';
  spawnSync(AMA_BIN, [
    '--games', String(count),
    '--seed', String(seed0),
    '--weights', 'build',
    '--out', tmp,
    '--topk', '1',
  ], { cwd: AMA_REPO, stdio: 'inherit' });
  // Parse JSONL: each line has final_score and final_max_chain. Group by game_id, take last row per game.
  const byGame = new Map<number, { score: number; maxChain: number }>();
  const text = readFileSync(tmp, 'utf-8');
  for (const line of text.split('\n')) {
    if (!line.trim()) continue;
    const j = JSON.parse(line) as {
      game_id: number; final_score: number; final_max_chain: number;
    };
    byGame.set(j.game_id, { score: j.final_score, maxChain: j.final_max_chain });
  }
  return Array.from(byGame.values());
}

async function topOneAgreement(a: PuyoAI, b: PuyoAI, seeds: number[]): Promise<number> {
  let same = 0; let total = 0;
  for (const seed of seeds.slice(0, 20)) {
    let state = createInitialState(seed);
    for (let t = 0; t < 30; t++) {
      if (!state.current || state.status === 'gameover') break;
      const [ma, mb] = await Promise.all([a.suggest(state, 1), b.suggest(state, 1)]);
      if (ma[0] && mb[0]) {
        total++;
        if (moveToActionIndex(ma[0]) === moveToActionIndex(mb[0])) same++;
      }
      state = commitMove(state, ma[0]!);
    }
  }
  return total === 0 ? 0 : same / total;
}

async function main() {
  const args = process.argv.slice(2);
  const get = (k: string, d: string) => {
    const i = args.indexOf(k);
    return i >= 0 && i + 1 < args.length ? args[i + 1]! : d;
  };
  const games = Number(get('--games', '100'));
  const seed0 = Number(get('--seed', '1'));
  const aKind = get('--a', 'heuristic') as AiKind;
  const bKind = get('--b', 'ml-ama-v1') as AiKind;

  console.log(`Eval: ${games} games  seed0=${seed0}  A=${aKind}  B=${bKind}`);

  const seeds = Array.from({ length: games }, (_, i) => (seed0 + i) >>> 0);

  const playMany = async (kind: AiKind) => {
    if (kind === 'ama') return evalAmaGames(seed0, games);
    const ai = (await makeAi(kind))!;
    const out: { score: number; maxChain: number }[] = [];
    for (const s of seeds) out.push(await playOne(ai, s));
    return out;
  };

  const [aRes, bRes] = await Promise.all([playMany(aKind), playMany(bKind)]);

  const avg = (arr: number[]) => arr.reduce((x, y) => x + y, 0) / arr.length;
  const avgA = avg(aRes.map((r) => r.score));
  const avgB = avg(bRes.map((r) => r.score));
  const chA = avg(aRes.map((r) => r.maxChain));
  const chB = avg(bRes.map((r) => r.maxChain));
  console.log(`${aKind} avg score: ${avgA.toFixed(0)}  max-chain mean: ${chA.toFixed(2)}`);
  console.log(`${bKind} avg score: ${avgB.toFixed(0)}  max-chain mean: ${chB.toFixed(2)}`);
  console.log(`Ratio (B/A): ${(avgB / avgA).toFixed(3)}`);

  // Top-1 agreement only if both are PuyoAI (not ama subprocess)
  if (aKind !== 'ama' && bKind !== 'ama') {
    const ai_a = (await makeAi(aKind))!;
    const ai_b = (await makeAi(bKind))!;
    const t1 = await topOneAgreement(ai_a, ai_b, seeds);
    console.log(`Top-1 agreement: ${t1.toFixed(3)}`);
  }
}

void main();
```

- [ ] **Step 2: Type check**

Run: `npx tsc --noEmit`
Expected: 0 errors

- [ ] **Step 3: Smoke run with heuristic vs ml-v1 (existing model)**

```bash
npm run eval -- --games 5 --seed 1 --a heuristic --b ml-v1
```
Expected: prints results without crash. Numbers may be different from before (new RNG), but pipeline works.

- [ ] **Step 4: Commit**

```bash
git add scripts/eval-ai.ts
git commit -m "feat(scripts): eval supports 3 ML kinds + direct ama subprocess"
```

(Note: `scripts/ama-ai-node.ts` is not actually needed because we directly invoke `dump_selfplay.exe` from `eval-ai.ts`. The plan's File Structure listed it; we can delete that mention or just not create it. Move on.)

---

## Task 15: 本番 run + ブラウザ確認 + 結果記録

実際のパイプラインを通して走らせる手動オペレーション。

**Files:**
- Create: `public/models/policy-ama-v1/{model.json, *.bin}`(成果物、commit)
- Create: `docs/superpowers/progress/2026-04-25-phase5c-1-run.md`

- [ ] **Step 1: ama でデータ生成**

Pre-conditions: ama がビルド済みで `bin/dump_selfplay/dump_selfplay.exe` が動く(Task 5 で確認済み)。

```bash
cd /Users/yasumitsuomori/git/puyo-simulator/.worktrees/puyo-mvp
npm run ama-selfplay -- --games 50000 --workers 8 --seed 20260425 --weights build --out data/ama-selfplay
```

Expected:
- `data/ama-selfplay/ama-20260425-w0.jsonl` 〜 `w7.jsonl` の 8 ファイル
- 各ファイル ~6,000-7,000 ゲーム分のサンプル
- 合計時間 1-2 時間想定

確認:
```bash
ls -lh data/ama-selfplay/
wc -l data/ama-selfplay/*.jsonl
```

- [ ] **Step 2: Python 蒸留学習**

```bash
cd python
source .venv/bin/activate
python train_ama.py --data ../data/ama-selfplay --out checkpoints/policy-ama-v1.pt --epochs 30 --batch 256 --device mps
```

Expected:
- 各 epoch で `train / val / top1` が出力
- val_top1 は学習が進むにつれ上昇(目標 0.5+)
- 30 epoch で 1-2 時間
- best ckpt が `checkpoints/policy-ama-v1.pt` に保存

成功条件: 最終 `val_top1 >= 0.4`(ama の手は heuristic より構造化されているので 5a の 0.19 より高くなるはず)

- [ ] **Step 3: TF.js エクスポート**

```bash
cd python
source .venv/bin/activate
python -m puyo_train.export --ckpt checkpoints/policy-ama-v1.pt --out ../public/models/policy-ama-v1
```

Expected:
- `public/models/policy-ama-v1/model.json` と `group1-shard1of1.bin`
- 合計サイズ ~4MB(2MB を超えるので git-lfs 検討は将来。現状 4MB は git に直 commit 可)

確認:
```bash
ls -lh ../public/models/policy-ama-v1/
```

- [ ] **Step 4: 評価対戦 3 通り**

```bash
cd /Users/yasumitsuomori/git/puyo-simulator/.worktrees/puyo-mvp

# A: ML-ama-v1 vs Heuristic
npm run eval -- --games 100 --seed 1 --a heuristic --b ml-ama-v1 2>&1 | tee /tmp/eval-vs-heuristic.txt

# B: ML-ama-v1 vs ML-v1 (5a)
npm run eval -- --games 100 --seed 1 --a ml-v1 --b ml-ama-v1 2>&1 | tee /tmp/eval-vs-mlv1.txt

# C: ML-ama-v1 vs ama 本体
npm run eval -- --games 100 --seed 1 --a ml-ama-v1 --b ama 2>&1 | tee /tmp/eval-vs-ama.txt
```

成功条件:
- A の Ratio (B/A) >= 5.0
- B の Ratio (B/A) >= 2.5
- C の Ratio (B/A) >= 0.80

- [ ] **Step 5: ブラウザで動作確認**

```bash
npm run dev
```

ブラウザで `http://localhost:5173` を開き:
1. デフォルトで `AI: ML (ama-distilled-v1)` が選ばれている
2. 候補リストが出る、`p=0.xx v=+0.xx` 形式
3. 推論レイテンシを Chrome DevTools Performance で確認(1 手 < 50ms 目標)
4. セレクタを `Heuristic` / `ML (policy-v1)` に切替えて動作確認

- [ ] **Step 6: 結果記録ドキュメント作成**

Create `docs/superpowers/progress/2026-04-25-phase5c-1-run.md`:

```markdown
# Phase 5c-1 Production Run (2026-04-25)

## Self-play(ama)
- Games: 50,000 (build preset, esport seed base=20260425)
- Total samples: <count>
- Duration: <minutes>
- Output: data/ama-selfplay/ama-20260425-*.jsonl, total <MB> MB

## Training
- Epochs: 30, batch 256, lr 1e-3 cosine decay, MPS
- Final val_loss: <x.xxx>
- Final val_top1: <x.xxx>
- Best checkpoint: epoch <N>

## Export
- public/models/policy-ama-v1/ size: <MB> MB

## Evaluation (3 matchups, 100 games each, seed=1)

| Match | A score | B score | Ratio B/A | Top-1 agree |
| --- | --- | --- | --- | --- |
| Heuristic vs ml-ama-v1 | <N> | <N> | <X.X> | <X.X> |
| ml-v1 vs ml-ama-v1 | <N> | <N> | <X.X> | <X.X> |
| ml-ama-v1 vs ama | <N> | <N> | <X.X> | — (subprocess) |

## Parity check (5c-1 done condition)
- [ ] vs Heuristic ratio >= 5.0
- [ ] vs ml-v1 ratio >= 2.5
- [ ] vs ama ratio >= 0.80
- [ ] Browser inference latency <= 50ms
- [ ] Model size <= 5MB

## Observations
<記述: ama 圧勝のケースがあれば原因考察、surprise も>
```

数値を埋めた上でコミット:

- [ ] **Step 7: Commit model + run report**

```bash
git add public/models/policy-ama-v1 docs/superpowers/progress/2026-04-25-phase5c-1-run.md
git commit -m "ship(ml): trained policy-ama-v1 distilled from ama"
```

---

## Self-Review Notes

### Spec coverage

- §1 目的・Done → Task 15 で全パリティ条件を測定
- §3 RNG 統一 → Tasks 1-4
- §4 ama ハーネス → Task 5
- §5 データ・ラベル → Task 7
- §6 モデル → Task 8
- §7 エクスポート → Task 10
- §8 ブラウザ統合 → Tasks 11-13
- §9 評価 → Task 14, 15
- §10 ディレクトリ構成 → 各タスクで配置
- §11 実装フェーズ A-E → Tasks 1-15 でカバー
- §12 リスク → 各タスクの fallback で対処

### Type/Symbol consistency

- `MlModelKind = 'v1' | 'ama-v1'`(MlAI 内)
- worker / Header の `Kind = 'heuristic' | 'ml-v1' | 'ml-ama-v1'`(プレフィクス `ml-` あり)
- これらは別の型として共存(MlAI は `'v1'` を受け、worker は `'ml-v1'` を受け、内部で変換)
- `getEsportQueue(seed)` / `make_esport_queue(seed)`(TS / Python 命名差は意図的、各言語の慣習)
- `PolicyValueNetV2` クラス、`AmaDataset`、`run_distillation` シグネチャは内一貫

### No unaddressed gaps detected.

---

## Execution Notes

- Tasks 1-4(ステージ A、RNG)は他のタスクの前提なので最初にやる
- Tasks 5-6(ステージ B、ama ハーネス)は Tasks 7-9(ステージ C、Python)と独立に進められる
- Task 14(eval スクリプト拡張)は Tasks 11-12(MlAI/Worker)に依存
- Task 15(本番 run)は全タスク完了後の手動運用、計算時間 4-6 時間(自己対戦 + 学習が大半)
- ama ビルドが Apple Silicon で詰まる場合は Linux Docker fallback を検討(Risk 表参照)
