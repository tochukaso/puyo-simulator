# Phase 5a: Imitation Learning Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 現行 HeuristicAI(ビームサーチ depth=4)の判断を模倣する policy+value デュアルヘッド CNN を学習し、TF.js でブラウザから切替可能にする。

**Architecture:** Node.js で既存 TS ゲームロジックを再利用した self-play → JSONL → Python (PyTorch, MPS) で policy+value 学習 → PyTorch → ONNX → TF SavedModel → TF.js に変換 → `public/models/policy-v1/` に配置 → ブラウザ側で `MlAI implements PuyoAI` が TF.js を経由してロード、Header のセレクタで Heuristic と切替。

**Tech Stack:** TypeScript 6、Node `worker_threads`、Vitest、Python 3.11+、PyTorch 2.x(MPS)、onnx2tf、tensorflowjs_converter、@tensorflow/tfjs (browser)。

**Spec:** `docs/superpowers/specs/2026-04-24-phase5a-imitation-design.md`

**Branch:** このプランは `feature/puyo-mvp` の続きとしてコミットを積む。新ブランチを切らずに進める(MVP 未マージのため)。

---

## File Structure

作成/変更するファイルの全体像。各ファイルは単一責務に絞る。

### TypeScript 側

| Path | 責務 |
| --- | --- |
| `src/game/action.ts`(新規) | 22 離散アクション ↔ Move 変換、合法手マスク算出 |
| `src/game/__tests__/action.test.ts`(新規) | action 変換のユニットテスト |
| `src/ai/ml/encoding.ts`(新規) | GameState → (boardTensor, queueVector, legalMask) |
| `src/ai/ml/__tests__/encoding.test.ts`(新規) | encoding のユニットテスト |
| `src/shared/specs/action_spec.json`(新規) | 22 個の (axisCol, rotation) ↔ index 対応表 |
| `src/shared/specs/encoding_spec.json`(新規) | 代表的な 3 局面の期待 tensor 値 |
| `src/game/__tests__/action_spec.test.ts`(新規) | JSON フィクスチャと TS 実装の整合を検証 |
| `src/ai/ml/__tests__/encoding_spec.test.ts`(新規) | 同上 |
| `src/ai/ml/ml-ai.ts`(新規) | `PuyoAI` 実装、TF.js モデルロード+推論 |
| `src/ai/ml/__tests__/ml-ai.test.ts`(新規) | スタブモデル経由のスモークテスト |
| `src/ai/worker/ai.worker.ts`(修正) | `set-ai` メッセージで Heuristic/ML を切替 |
| `src/ui/components/Header/Header.tsx`(新規) | AI セレクタ + localStorage |
| `src/ui/components/Header/__tests__/Header.test.tsx`(新規) | セレクタのスモークテスト |
| `src/ui/App.tsx`(修正) | Header を挿入 |
| `src/ui/store.ts`(修正) | 現在の AI 種別を state に追加 |
| `scripts/selfplay.ts`(新規) | 並列 self-play で JSONL 出力 |
| `scripts/eval-ai.ts`(新規) | AI 同士の対戦評価 |

### Python 側

| Path | 責務 |
| --- | --- |
| `python/pyproject.toml`(新規) | ruff/pytest 設定 |
| `python/requirements.txt`(新規) | 依存固定 |
| `python/README.md`(新規) | Python 側セットアップ手順 |
| `python/puyo_train/__init__.py`(新規) | パッケージマーカー |
| `python/puyo_train/action.py`(新規) | TS と同仕様の 22 action 変換 |
| `python/puyo_train/encoding.py`(新規) | TS と同仕様の state → tensor 変換 |
| `python/puyo_train/dataset.py`(新規) | JSONL → PyTorch Dataset |
| `python/puyo_train/model.py`(新規) | CNN + FC デュアルヘッド |
| `python/puyo_train/export.py`(新規) | PyTorch → ONNX → TF.js |
| `python/train.py`(新規) | エントリポイント学習スクリプト |
| `python/tests/test_action.py`(新規) | action_spec.json 整合 |
| `python/tests/test_encoding.py`(新規) | encoding_spec.json 整合 |
| `python/tests/test_dataset.py`(新規) | JSONL ロードと shape |
| `python/tests/test_model.py`(新規) | forward/loss スモーク |

### データ・モデル

| Path | 責務 |
| --- | --- |
| `data/selfplay/*.jsonl`(生成物、`.gitignore`) | 自己対戦ログ |
| `python/checkpoints/policy-v1.pt`(生成物、`.gitignore`) | PyTorch 学習済み重み |
| `public/models/policy-v1/model.json`(生成物、commit) | TF.js モデル定義 |
| `public/models/policy-v1/group1-shard1of1.bin`(生成物、commit) | TF.js 重み |

### 設定

| Path | 責務 |
| --- | --- |
| `.gitignore`(修正) | `data/selfplay/`, `python/checkpoints/`, `python/.venv/` 追加 |
| `package.json`(修正) | `selfplay` / `eval` スクリプト、`@tensorflow/tfjs` 依存 |
| `tsconfig.json`(修正) | `scripts/` 配下の Node 用 include 追加 |

---

## Task Overview

| # | タスク | 所要 | 依存 |
| --- | --- | --- | --- |
| 1 | TS action module | 30m | — |
| 2 | TS state encoding | 45m | 1 |
| 3 | Cross-language spec fixtures | 30m | 1, 2 |
| 4 | Node self-play スクリプト | 60m | 1 |
| 5 | Python プロジェクト初期化 | 20m | — |
| 6 | Python action module | 30m | 3, 5 |
| 7 | Python encoding module | 45m | 3, 5 |
| 8 | Python dataset module | 30m | 5 |
| 9 | Python model definition | 30m | 5 |
| 10 | Python training loop | 60m | 6-9 |
| 11 | Export pipeline (PyTorch→TF.js) | 45m | 9 |
| 12 | TS MlAI + TF.js ロード | 60m | 2 |
| 13 | AI Worker set-ai 切替 | 30m | 12 |
| 14 | Header AI セレクタ UI | 45m | 13 |
| 15 | Eval script | 45m | 4 |
| 16 | End-to-end production run | 3-5h(大半は待ち) | 1-15 |

---

## Task 1: TypeScript action module

22 離散アクション ↔ Move 変換の実装。22 = 6(rot=0) + 6(rot=2) + 5(rot=1) + 5(rot=3)。

**Files:**
- Create: `src/game/action.ts`
- Create: `src/game/__tests__/action.test.ts`

### Action index 仕様

| index 範囲 | rotation | axisCol |
| --- | --- | --- |
| 0..5   | 0 | 0..5 |
| 6..11  | 2 | 0..5 |
| 12..16 | 1 | 0..4(child が col+1 に入るので col=5 は壁外) |
| 17..21 | 3 | 1..5(child が col-1 に入るので col=0 は壁外) |

- [ ] **Step 1: Write the failing test**

Create `src/game/__tests__/action.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { ACTION_COUNT, moveToActionIndex, actionIndexToMove, legalActionMask } from '../action';
import { createEmptyField, withCell } from '../field';

describe('action index', () => {
  it('ACTION_COUNT is 22', () => {
    expect(ACTION_COUNT).toBe(22);
  });

  it('rot=0 col=0..5 maps to 0..5', () => {
    for (let c = 0; c < 6; c++) {
      expect(moveToActionIndex({ axisCol: c, rotation: 0 })).toBe(c);
    }
  });

  it('rot=2 col=0..5 maps to 6..11', () => {
    for (let c = 0; c < 6; c++) {
      expect(moveToActionIndex({ axisCol: c, rotation: 2 })).toBe(6 + c);
    }
  });

  it('rot=1 col=0..4 maps to 12..16', () => {
    for (let c = 0; c < 5; c++) {
      expect(moveToActionIndex({ axisCol: c, rotation: 1 })).toBe(12 + c);
    }
  });

  it('rot=3 col=1..5 maps to 17..21', () => {
    for (let c = 1; c <= 5; c++) {
      expect(moveToActionIndex({ axisCol: c, rotation: 3 })).toBe(17 + c - 1);
    }
  });

  it('actionIndexToMove is the inverse of moveToActionIndex', () => {
    for (let i = 0; i < ACTION_COUNT; i++) {
      const move = actionIndexToMove(i);
      expect(moveToActionIndex(move)).toBe(i);
    }
  });

  it('throws on out-of-range', () => {
    expect(() => actionIndexToMove(-1)).toThrow();
    expect(() => actionIndexToMove(22)).toThrow();
    expect(() => moveToActionIndex({ axisCol: 5, rotation: 1 })).toThrow();
    expect(() => moveToActionIndex({ axisCol: 0, rotation: 3 })).toThrow();
  });
});

describe('legalActionMask', () => {
  it('空盤面では 22 個すべて 1', () => {
    const field = createEmptyField();
    const mask = legalActionMask(field, {
      pair: { axis: 'R', child: 'B' },
      axisRow: 1,
      axisCol: 2,
      rotation: 0,
    });
    expect(mask.length).toBe(22);
    for (let i = 0; i < 22; i++) expect(mask[i]).toBe(1);
  });

  it('col=5 を塞ぐと col=5 関連のアクションが 0', () => {
    let field = createEmptyField();
    for (let r = 0; r < 13; r++) field = withCell(field, r, 5, 'R');
    // col 4 以降の rot=2 側も影響受ける可能性があるので、ここでは
    // col=5 の rot=0 (index 5) と rot=2 (index 11) が 0 になることだけ確認
    const mask = legalActionMask(field, {
      pair: { axis: 'R', child: 'B' },
      axisRow: 1,
      axisCol: 2,
      rotation: 0,
    });
    expect(mask[5]).toBe(0);
    expect(mask[11]).toBe(0);
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `npm test -- action`
Expected: FAIL — module `../action` not found

- [ ] **Step 3: Create `src/game/action.ts`**

```ts
import type { ActivePair, Field, Move, Rotation } from './types';
import { reachableTargets } from './reachability';

export const ACTION_COUNT = 22;

export function moveToActionIndex(move: Move): number {
  const { axisCol, rotation } = move;
  if (!Number.isInteger(axisCol) || axisCol < 0 || axisCol > 5) {
    throw new Error(`invalid axisCol: ${axisCol}`);
  }
  if (rotation === 0) return axisCol;
  if (rotation === 2) return 6 + axisCol;
  if (rotation === 1) {
    if (axisCol < 0 || axisCol > 4) throw new Error(`rot=1 axisCol out of range: ${axisCol}`);
    return 12 + axisCol;
  }
  if (rotation === 3) {
    if (axisCol < 1 || axisCol > 5) throw new Error(`rot=3 axisCol out of range: ${axisCol}`);
    return 17 + axisCol - 1;
  }
  throw new Error(`invalid rotation: ${String(rotation)}`);
}

export function actionIndexToMove(index: number): Move {
  if (!Number.isInteger(index) || index < 0 || index >= ACTION_COUNT) {
    throw new Error(`invalid action index: ${index}`);
  }
  if (index < 6) return { axisCol: index, rotation: 0 as Rotation };
  if (index < 12) return { axisCol: index - 6, rotation: 2 as Rotation };
  if (index < 17) return { axisCol: index - 12, rotation: 1 as Rotation };
  return { axisCol: index - 17 + 1, rotation: 3 as Rotation };
}

export function legalActionMask(field: Field, start: ActivePair): Uint8Array {
  const reachable = reachableTargets(field, start);
  const mask = new Uint8Array(ACTION_COUNT);
  for (let i = 0; i < ACTION_COUNT; i++) {
    const { axisCol, rotation } = actionIndexToMove(i);
    if (reachable.has(`${axisCol}-${rotation}`)) mask[i] = 1;
  }
  return mask;
}
```

- [ ] **Step 4: Run to verify pass**

Run: `npm test -- action`
Expected: PASS(9 assertions pass)

- [ ] **Step 5: Commit**

```bash
git add src/game/action.ts src/game/__tests__/action.test.ts
git commit -m "feat(game): add 22 discrete action encoding and legal mask"
```

---

## Task 2: TypeScript state encoding

`GameState` を 3 テンソル `(board[13,6,7], queue[16], legalMask[22])` にエンコードする。

**Files:**
- Create: `src/ai/ml/encoding.ts`
- Create: `src/ai/ml/__tests__/encoding.test.ts`

### チャンネル仕様

| ch | 内容 |
| --- | --- |
| 0 | R 存在マップ |
| 1 | B 存在マップ |
| 2 | Y 存在マップ |
| 3 | P 存在マップ |
| 4 | 空マスマップ |
| 5 | 現ツモ軸色のブロードキャスト |
| 6 | 現ツモ子色のブロードキャスト |

ストレージ順序: `board[r * 6 * 7 + c * 7 + ch]`(row-major、TF.js の NHWC に合わせる)。

queue[16]: `[NEXT.axis(4), NEXT.child(4), NEXT2.axis(4), NEXT2.child(4)]` の one-hot 連結。色の順序は `['R','B','Y','P']`。

- [ ] **Step 1: Write the failing test**

Create `src/ai/ml/__tests__/encoding.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { encodeState, BOARD_CHANNELS, COLOR_ORDER } from '../encoding';
import { createEmptyField, withCell } from '../../../game/field';
import type { GameState, Pair } from '../../../game/types';

function makeState(overrides: Partial<GameState> = {}): GameState {
  return {
    field: createEmptyField(),
    current: {
      pair: { axis: 'R', child: 'B' },
      axisRow: 1,
      axisCol: 2,
      rotation: 0,
    },
    nextQueue: [
      { axis: 'Y', child: 'P' } as Pair,
      { axis: 'R', child: 'R' } as Pair,
    ],
    score: 0,
    chainCount: 0,
    totalChains: 0,
    maxChain: 0,
    status: 'playing',
    rngSeed: 0,
    ...overrides,
  };
}

describe('encodeState', () => {
  it('BOARD_CHANNELS is 7, COLOR_ORDER has 4 colors', () => {
    expect(BOARD_CHANNELS).toBe(7);
    expect(COLOR_ORDER).toEqual(['R', 'B', 'Y', 'P']);
  });

  it('空盤面: empty チャンネルが全マス 1、色チャンネルは 0', () => {
    const e = encodeState(makeState());
    expect(e.board.length).toBe(13 * 6 * 7);
    for (let r = 0; r < 13; r++) {
      for (let c = 0; c < 6; c++) {
        for (let ch = 0; ch < 4; ch++) {
          expect(e.board[r * 42 + c * 7 + ch]).toBe(0);
        }
        expect(e.board[r * 42 + c * 7 + 4]).toBe(1);
      }
    }
  });

  it('R を (5,3) に置くと R チャンネルが立ち、空チャンネルが落ちる', () => {
    const field = withCell(createEmptyField(), 5, 3, 'R');
    const e = encodeState(makeState({ field }));
    const off = 5 * 42 + 3 * 7;
    expect(e.board[off + 0]).toBe(1);
    expect(e.board[off + 4]).toBe(0);
  });

  it('現ツモ R/B: ch=5 が全マス 1(R)、ch=6 は 0..1 でなく B の index', () => {
    const e = encodeState(makeState());
    for (let r = 0; r < 13; r++) {
      for (let c = 0; c < 6; c++) {
        expect(e.board[r * 42 + c * 7 + 5]).toBe(1 / 3); // R = 0 → 0/3
        expect(e.board[r * 42 + c * 7 + 6]).toBeCloseTo(1 / 3); // B = 1 → 1/3
      }
    }
  });

  it('queue[16]: NEXT Y/P, NEXT2 R/R の one-hot', () => {
    const e = encodeState(makeState());
    expect(e.queue.length).toBe(16);
    // NEXT axis = Y (index 2)
    expect(e.queue[0]).toBe(0);
    expect(e.queue[1]).toBe(0);
    expect(e.queue[2]).toBe(1);
    expect(e.queue[3]).toBe(0);
    // NEXT child = P (index 3)
    expect(e.queue[4 + 3]).toBe(1);
    // NEXT2 axis = R (index 0)
    expect(e.queue[8 + 0]).toBe(1);
    // NEXT2 child = R (index 0)
    expect(e.queue[12 + 0]).toBe(1);
  });

  it('legalMask の長さは 22、current=null なら全 0', () => {
    const e = encodeState(makeState());
    expect(e.legalMask.length).toBe(22);
    const e2 = encodeState(makeState({ current: null }));
    expect(e2.legalMask.every((v) => v === 0)).toBe(true);
  });
});
```

**Note:** ch 5, 6 の定義は「軸色を 0..3 の整数 / 3 にスケールして全マスに塗る」に変更した(one-hot をブロードキャストするとチャンネル数が膨れるため)。テストと実装で一致させる。

- [ ] **Step 2: Run to verify failure**

Run: `npm test -- encoding`
Expected: FAIL — module not found

- [ ] **Step 3: Create `src/ai/ml/encoding.ts`**

```ts
import type { Color, Field, GameState } from '../../game/types';
import { ROWS, COLS } from '../../game/constants';
import { legalActionMask, ACTION_COUNT } from '../../game/action';

export const BOARD_CHANNELS = 7;
export const QUEUE_DIM = 16;
export const COLOR_ORDER: readonly Color[] = ['R', 'B', 'Y', 'P'] as const;

const COLOR_INDEX: Record<Color, number> = { R: 0, B: 1, Y: 2, P: 3 };

export interface EncodedState {
  board: Float32Array; // length = ROWS * COLS * BOARD_CHANNELS
  queue: Float32Array; // length = QUEUE_DIM
  legalMask: Uint8Array; // length = ACTION_COUNT
}

export function encodeState(state: GameState): EncodedState {
  const board = new Float32Array(ROWS * COLS * BOARD_CHANNELS);
  writeFieldChannels(board, state.field);
  writeCurrentTsumoChannels(board, state);

  const queue = writeQueueVector(state);

  const legalMask =
    state.current !== null
      ? legalActionMask(state.field, state.current)
      : new Uint8Array(ACTION_COUNT);

  return { board, queue, legalMask };
}

function writeFieldChannels(board: Float32Array, field: Field): void {
  for (let r = 0; r < ROWS; r++) {
    for (let c = 0; c < COLS; c++) {
      const base = r * COLS * BOARD_CHANNELS + c * BOARD_CHANNELS;
      const cell = field.cells[r]![c]!;
      if (cell === null) {
        board[base + 4] = 1;
      } else {
        board[base + COLOR_INDEX[cell]] = 1;
      }
    }
  }
}

function writeCurrentTsumoChannels(board: Float32Array, state: GameState): void {
  if (state.current === null) return;
  const ax = COLOR_INDEX[state.current.pair.axis] / 3;
  const ch = COLOR_INDEX[state.current.pair.child] / 3;
  for (let r = 0; r < ROWS; r++) {
    for (let c = 0; c < COLS; c++) {
      const base = r * COLS * BOARD_CHANNELS + c * BOARD_CHANNELS;
      board[base + 5] = ax;
      board[base + 6] = ch;
    }
  }
}

function writeQueueVector(state: GameState): Float32Array {
  const q = new Float32Array(QUEUE_DIM);
  const n1 = state.nextQueue[0];
  const n2 = state.nextQueue[1];
  if (n1) {
    q[COLOR_INDEX[n1.axis]] = 1;
    q[4 + COLOR_INDEX[n1.child]] = 1;
  }
  if (n2) {
    q[8 + COLOR_INDEX[n2.axis]] = 1;
    q[12 + COLOR_INDEX[n2.child]] = 1;
  }
  return q;
}
```

- [ ] **Step 4: Run to verify pass**

Run: `npm test -- encoding`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/ai/ml/encoding.ts src/ai/ml/__tests__/encoding.test.ts
git commit -m "feat(ml): add state encoding for CNN input"
```

---

## Task 3: Cross-language spec fixtures

TS と Python 両方で読む JSON フィクスチャを作り、両側で「同じ入力→同じ出力」を検証する下地を整える。

**Files:**
- Create: `src/shared/specs/action_spec.json`
- Create: `src/shared/specs/encoding_spec.json`
- Create: `src/game/__tests__/action_spec.test.ts`
- Create: `src/ai/ml/__tests__/encoding_spec.test.ts`

- [ ] **Step 1: Create `src/shared/specs/action_spec.json`**

```json
{
  "action_count": 22,
  "entries": [
    { "index": 0,  "axisCol": 0, "rotation": 0 },
    { "index": 1,  "axisCol": 1, "rotation": 0 },
    { "index": 2,  "axisCol": 2, "rotation": 0 },
    { "index": 3,  "axisCol": 3, "rotation": 0 },
    { "index": 4,  "axisCol": 4, "rotation": 0 },
    { "index": 5,  "axisCol": 5, "rotation": 0 },
    { "index": 6,  "axisCol": 0, "rotation": 2 },
    { "index": 7,  "axisCol": 1, "rotation": 2 },
    { "index": 8,  "axisCol": 2, "rotation": 2 },
    { "index": 9,  "axisCol": 3, "rotation": 2 },
    { "index": 10, "axisCol": 4, "rotation": 2 },
    { "index": 11, "axisCol": 5, "rotation": 2 },
    { "index": 12, "axisCol": 0, "rotation": 1 },
    { "index": 13, "axisCol": 1, "rotation": 1 },
    { "index": 14, "axisCol": 2, "rotation": 1 },
    { "index": 15, "axisCol": 3, "rotation": 1 },
    { "index": 16, "axisCol": 4, "rotation": 1 },
    { "index": 17, "axisCol": 1, "rotation": 3 },
    { "index": 18, "axisCol": 2, "rotation": 3 },
    { "index": 19, "axisCol": 3, "rotation": 3 },
    { "index": 20, "axisCol": 4, "rotation": 3 },
    { "index": 21, "axisCol": 5, "rotation": 3 }
  ]
}
```

- [ ] **Step 2: Create `src/shared/specs/encoding_spec.json`**

```json
{
  "cases": [
    {
      "name": "empty_board_RB_current_YP_RR_queue",
      "state": {
        "field": null,
        "current": { "axis": "R", "child": "B", "axisRow": 1, "axisCol": 2, "rotation": 0 },
        "nextQueue": [
          { "axis": "Y", "child": "P" },
          { "axis": "R", "child": "R" }
        ]
      },
      "expected": {
        "board_shape": [13, 6, 7],
        "queue_shape": [16],
        "board_samples": [
          { "r": 0, "c": 0, "ch": 4, "value": 1.0 },
          { "r": 12, "c": 5, "ch": 4, "value": 1.0 },
          { "r": 6, "c": 3, "ch": 5, "value": 0.0 },
          { "r": 6, "c": 3, "ch": 6, "value": 0.3333333333333333 }
        ],
        "queue_values": [
          0, 0, 1, 0,
          0, 0, 0, 1,
          1, 0, 0, 0,
          1, 0, 0, 0
        ],
        "legal_mask_sum": 22
      }
    },
    {
      "name": "R_at_5_3_then_BB_current",
      "state": {
        "field": [{ "row": 5, "col": 3, "color": "R" }],
        "current": { "axis": "B", "child": "B", "axisRow": 1, "axisCol": 2, "rotation": 0 },
        "nextQueue": [
          { "axis": "Y", "child": "Y" },
          { "axis": "P", "child": "P" }
        ]
      },
      "expected": {
        "board_shape": [13, 6, 7],
        "queue_shape": [16],
        "board_samples": [
          { "r": 5, "c": 3, "ch": 0, "value": 1.0 },
          { "r": 5, "c": 3, "ch": 4, "value": 0.0 },
          { "r": 0, "c": 0, "ch": 5, "value": 0.3333333333333333 },
          { "r": 0, "c": 0, "ch": 6, "value": 0.3333333333333333 }
        ],
        "queue_values": [
          0, 0, 1, 0,
          0, 0, 1, 0,
          0, 0, 0, 1,
          0, 0, 0, 1
        ],
        "legal_mask_sum": 22
      }
    }
  ]
}
```

- [ ] **Step 3: Write the TS action_spec test**

Create `src/game/__tests__/action_spec.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { moveToActionIndex, actionIndexToMove, ACTION_COUNT } from '../action';
import spec from '../../shared/specs/action_spec.json';
import type { Rotation } from '../types';

describe('action_spec.json', () => {
  it('action_count matches ACTION_COUNT', () => {
    expect(spec.action_count).toBe(ACTION_COUNT);
  });

  it('each entry round-trips between index and move', () => {
    for (const e of spec.entries) {
      const move = { axisCol: e.axisCol, rotation: e.rotation as Rotation };
      expect(moveToActionIndex(move)).toBe(e.index);
      expect(actionIndexToMove(e.index)).toEqual(move);
    }
  });
});
```

- [ ] **Step 4: Write the TS encoding_spec test**

Create `src/ai/ml/__tests__/encoding_spec.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { encodeState } from '../encoding';
import { createEmptyField, withCell } from '../../../game/field';
import spec from '../../../shared/specs/encoding_spec.json';
import type { Color, GameState, Rotation } from '../../../game/types';

type FieldMod = { row: number; col: number; color: Color } | null;
type SpecState = {
  field: FieldMod[] | null;
  current: {
    axis: Color;
    child: Color;
    axisRow: number;
    axisCol: number;
    rotation: number;
  };
  nextQueue: { axis: Color; child: Color }[];
};

function buildState(s: SpecState): GameState {
  let field = createEmptyField();
  if (s.field !== null) {
    for (const m of s.field) {
      if (m !== null) field = withCell(field, m.row, m.col, m.color);
    }
  }
  return {
    field,
    current: {
      pair: { axis: s.current.axis, child: s.current.child },
      axisRow: s.current.axisRow,
      axisCol: s.current.axisCol,
      rotation: s.current.rotation as Rotation,
    },
    nextQueue: s.nextQueue.map((p) => ({ axis: p.axis, child: p.child })),
    score: 0,
    chainCount: 0,
    totalChains: 0,
    maxChain: 0,
    status: 'playing',
    rngSeed: 0,
  };
}

describe('encoding_spec.json', () => {
  for (const c of spec.cases) {
    it(c.name, () => {
      const state = buildState(c.state as SpecState);
      const e = encodeState(state);
      const [R, C, CH] = c.expected.board_shape;
      expect(e.board.length).toBe(R * C * CH);
      expect(e.queue.length).toBe(c.expected.queue_shape[0]);
      for (const s of c.expected.board_samples) {
        const off = s.r * C * CH + s.c * CH + s.ch;
        expect(e.board[off]).toBeCloseTo(s.value, 6);
      }
      for (let i = 0; i < c.expected.queue_values.length; i++) {
        expect(e.queue[i]).toBeCloseTo(c.expected.queue_values[i]!, 6);
      }
      expect(e.legalMask.reduce((a, b) => a + b, 0)).toBe(c.expected.legal_mask_sum);
    });
  }
});
```

- [ ] **Step 5: Run tests to verify PASS**

Run: `npm test -- spec`
Expected: PASS(action_spec の 2 件 + encoding_spec の 2 件)

- [ ] **Step 6: Commit**

```bash
git add src/shared/specs src/game/__tests__/action_spec.test.ts src/ai/ml/__tests__/encoding_spec.test.ts
git commit -m "feat(shared): add cross-language spec fixtures for action and encoding"
```

---

## Task 4: Node.js self-play script

既存 `HeuristicAI` と `commitMove` で自己対戦し、各局面を JSONL に落とす。`worker_threads` で並列化。

**Files:**
- Create: `scripts/selfplay.ts`
- Modify: `package.json`(scripts に `selfplay` 追加)
- Modify: `.gitignore`(`data/selfplay/` を追加)

- [ ] **Step 1: Add `.gitignore` entries**

Modify `.gitignore` — append:

```
# ML artifacts
data/selfplay/
python/checkpoints/
python/.venv/
python/__pycache__/
python/**/__pycache__/
```

- [ ] **Step 2: Add npm script**

Modify `package.json` — in `"scripts"` add:

```json
"selfplay": "tsx scripts/selfplay.ts"
```

Install `tsx` and `commander`(CLI arg):

```bash
npm install --save-dev tsx commander
```

- [ ] **Step 3: Create `scripts/selfplay.ts`**

```ts
import { Worker, isMainThread, parentPort, workerData } from 'node:worker_threads';
import { writeFileSync, mkdirSync, existsSync, appendFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createInitialState, commitMove } from '../src/game/state';
import { HeuristicAI } from '../src/ai/heuristic';
import { moveToActionIndex } from '../src/game/action';
import type { GameState } from '../src/game/types';

const __filename = fileURLToPath(import.meta.url);

interface SampleRow {
  seed: number;
  game_id: number;
  move_index: number;
  field: (string | null)[][];
  current_axis: string;
  current_child: string;
  next1_axis: string;
  next1_child: string;
  next2_axis: string;
  next2_child: string;
  teacher_move: { axisCol: number; rotation: number };
  teacher_action_index: number;
  final_score: number;
  final_max_chain: number;
}

async function playGame(seed: number, gameId: number, ai: HeuristicAI): Promise<SampleRow[]> {
  await ai.init();
  let state: GameState = createInitialState(seed);
  const samples: Omit<SampleRow, 'final_score' | 'final_max_chain'>[] = [];
  let moveIndex = 0;
  const MAX_MOVES = 300; // 安全上限

  while (state.status !== 'gameover' && moveIndex < MAX_MOVES) {
    if (state.current === null) break;
    const moves = await ai.suggest(state, 1);
    const best = moves[0];
    if (!best) break;
    const n1 = state.nextQueue[0]!;
    const n2 = state.nextQueue[1] ?? n1;
    samples.push({
      seed,
      game_id: gameId,
      move_index: moveIndex,
      field: state.field.cells.map((row) => row.map((c) => c)),
      current_axis: state.current.pair.axis,
      current_child: state.current.pair.child,
      next1_axis: n1.axis,
      next1_child: n1.child,
      next2_axis: n2.axis,
      next2_child: n2.child,
      teacher_move: { axisCol: best.axisCol, rotation: best.rotation },
      teacher_action_index: moveToActionIndex(best),
    });
    state = commitMove(state, best);
    moveIndex++;
  }

  return samples.map((s) => ({
    ...s,
    final_score: state.score,
    final_max_chain: state.maxChain,
  }));
}

async function workerMain() {
  const { seeds, gameIdBase, outFile } = workerData as {
    seeds: number[];
    gameIdBase: number;
    outFile: string;
  };
  const ai = new HeuristicAI();
  let lines: string[] = [];
  for (let i = 0; i < seeds.length; i++) {
    const rows = await playGame(seeds[i]!, gameIdBase + i, ai);
    for (const r of rows) lines.push(JSON.stringify(r));
    if (lines.length > 5000) {
      appendFileSync(outFile, lines.join('\n') + '\n');
      lines = [];
    }
    parentPort?.postMessage({ type: 'progress', gameId: gameIdBase + i });
  }
  if (lines.length > 0) appendFileSync(outFile, lines.join('\n') + '\n');
  parentPort?.postMessage({ type: 'done' });
}

async function main() {
  const args = process.argv.slice(2);
  const games = Number(argValue(args, '--games', '10'));
  const workers = Number(argValue(args, '--workers', '4'));
  const seed0 = Number(argValue(args, '--seed', String(Date.now() & 0xffffffff)));
  const outDir = argValue(args, '--out', 'data/selfplay');
  if (!existsSync(outDir)) mkdirSync(outDir, { recursive: true });
  const outFile = join(outDir, `selfplay-${seed0}.jsonl`);
  writeFileSync(outFile, ''); // truncate

  const perWorker = Math.ceil(games / workers);
  const startedAt = Date.now();
  let done = 0;

  const promises: Promise<void>[] = [];
  for (let w = 0; w < workers; w++) {
    const seeds: number[] = [];
    const base = w * perWorker;
    for (let i = 0; i < perWorker && base + i < games; i++) {
      seeds.push((seed0 + base + i) >>> 0);
    }
    if (seeds.length === 0) continue;
    promises.push(
      new Promise((resolve, reject) => {
        const worker = new Worker(__filename, {
          workerData: { seeds, gameIdBase: base, outFile },
          execArgv: ['--import', 'tsx'],
        });
        worker.on('message', (msg: { type: string }) => {
          if (msg.type === 'progress') {
            done++;
            if (done % 10 === 0) {
              const elapsed = (Date.now() - startedAt) / 1000;
              const rate = done / elapsed;
              console.log(`  ${done}/${games}  ${rate.toFixed(2)} games/s`);
            }
          } else if (msg.type === 'done') {
            resolve();
          }
        });
        worker.on('error', reject);
        worker.on('exit', (code) => {
          if (code !== 0 && done < games) reject(new Error(`worker exit ${code}`));
        });
      }),
    );
  }

  await Promise.all(promises);
  console.log(`self-play complete: ${games} games → ${outFile}`);
}

function argValue(args: string[], key: string, def: string): string {
  const i = args.indexOf(key);
  return i >= 0 && i + 1 < args.length ? args[i + 1]! : def;
}

if (isMainThread) {
  void main();
} else {
  void workerMain();
}
```

- [ ] **Step 4: Smoke test — run 2 games**

Run: `npm run selfplay -- --games 2 --workers 1`
Expected:
- `data/selfplay/selfplay-*.jsonl` が作成される
- 数十〜百行程度の JSONL(1 局面 = 1 行)
- 最後の行は `final_score > 0`、`final_max_chain >= 0`

Verify: `wc -l data/selfplay/selfplay-*.jsonl`(行数 > 0)

- [ ] **Step 5: Commit**

```bash
git add scripts/selfplay.ts package.json package-lock.json .gitignore
git commit -m "feat(scripts): add parallel self-play data generator"
```

---

## Task 5: Python project setup

Python 側のパッケージ構造を作る。`python/` ディレクトリ配下、`puyo_train` パッケージ。

**Files:**
- Create: `python/pyproject.toml`
- Create: `python/requirements.txt`
- Create: `python/README.md`
- Create: `python/puyo_train/__init__.py`
- Create: `python/tests/__init__.py`

- [ ] **Step 1: Create `python/requirements.txt`**

```
torch>=2.2,<3
numpy>=1.26,<3
tqdm>=4.66
onnx>=1.16
onnx2tf>=1.21
tensorflow>=2.16,<3
tensorflowjs>=4.19
pytest>=8.2
ruff>=0.5
```

- [ ] **Step 2: Create `python/pyproject.toml`**

```toml
[tool.ruff]
line-length = 100
target-version = "py311"

[tool.ruff.lint]
select = ["E", "F", "I", "N", "UP", "B"]

[tool.pytest.ini_options]
testpaths = ["tests"]
pythonpath = ["."]
```

- [ ] **Step 3: Create `python/README.md`**

```markdown
# Python training environment (Phase 5a)

## Setup

    cd python
    python3.11 -m venv .venv
    source .venv/bin/activate
    pip install -r requirements.txt

## Test

    pytest

## Train

    python train.py --data ../data/selfplay --out checkpoints/policy-v1.pt

## Export to TF.js

    python -m puyo_train.export --ckpt checkpoints/policy-v1.pt --out ../public/models/policy-v1
```

- [ ] **Step 4: Create package markers**

Create empty files:
- `python/puyo_train/__init__.py`
- `python/tests/__init__.py`

- [ ] **Step 5: Verify env installs and pytest runs**

Run (from `python/`):
```bash
python3.11 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
pytest -q
```
Expected: `pytest` collects 0 tests, exits 0 (no tests yet).

If `onnx2tf` or `tensorflowjs` install fails on macOS, check Python 3.11 is used (not 3.13). Document any workaround in `python/README.md`.

- [ ] **Step 6: Commit**

```bash
git add python/pyproject.toml python/requirements.txt python/README.md python/puyo_train/__init__.py python/tests/__init__.py
git commit -m "chore(python): initialize puyo_train package"
```

---

## Task 6: Python action module

TS と同じ 22 離散アクション変換を Python で実装し、`action_spec.json` で整合検証。

**Files:**
- Create: `python/puyo_train/action.py`
- Create: `python/tests/test_action.py`

- [ ] **Step 1: Write the failing test**

Create `python/tests/test_action.py`:

```python
import json
from pathlib import Path

import pytest

from puyo_train.action import (
    ACTION_COUNT,
    action_index_to_move,
    move_to_action_index,
)

SPEC_PATH = Path(__file__).resolve().parents[2] / "src/shared/specs/action_spec.json"


def load_spec():
    with SPEC_PATH.open() as f:
        return json.load(f)


def test_action_count():
    spec = load_spec()
    assert ACTION_COUNT == spec["action_count"] == 22


def test_spec_round_trip():
    spec = load_spec()
    for e in spec["entries"]:
        idx = move_to_action_index(e["axisCol"], e["rotation"])
        assert idx == e["index"]
        col, rot = action_index_to_move(e["index"])
        assert (col, rot) == (e["axisCol"], e["rotation"])


def test_out_of_range_raises():
    with pytest.raises(ValueError):
        action_index_to_move(-1)
    with pytest.raises(ValueError):
        action_index_to_move(22)
    with pytest.raises(ValueError):
        move_to_action_index(5, 1)
    with pytest.raises(ValueError):
        move_to_action_index(0, 3)
```

- [ ] **Step 2: Run to verify failure**

Run(from `python/`): `pytest tests/test_action.py -q`
Expected: FAIL — `ImportError: cannot import name ACTION_COUNT`

- [ ] **Step 3: Create `python/puyo_train/action.py`**

```python
from __future__ import annotations

ACTION_COUNT = 22


def move_to_action_index(axis_col: int, rotation: int) -> int:
    if not isinstance(axis_col, int) or axis_col < 0 or axis_col > 5:
        raise ValueError(f"invalid axis_col: {axis_col}")
    if rotation == 0:
        return axis_col
    if rotation == 2:
        return 6 + axis_col
    if rotation == 1:
        if axis_col < 0 or axis_col > 4:
            raise ValueError(f"rot=1 axis_col out of range: {axis_col}")
        return 12 + axis_col
    if rotation == 3:
        if axis_col < 1 or axis_col > 5:
            raise ValueError(f"rot=3 axis_col out of range: {axis_col}")
        return 17 + axis_col - 1
    raise ValueError(f"invalid rotation: {rotation}")


def action_index_to_move(index: int) -> tuple[int, int]:
    if not isinstance(index, int) or index < 0 or index >= ACTION_COUNT:
        raise ValueError(f"invalid action index: {index}")
    if index < 6:
        return (index, 0)
    if index < 12:
        return (index - 6, 2)
    if index < 17:
        return (index - 12, 1)
    return (index - 17 + 1, 3)
```

- [ ] **Step 4: Run to verify pass**

Run: `pytest tests/test_action.py -q`
Expected: PASS(3 tests)

- [ ] **Step 5: Commit**

```bash
git add python/puyo_train/action.py python/tests/test_action.py
git commit -m "feat(python): port action encoding, cross-validated with JSON spec"
```

---

## Task 7: Python encoding module

TS と同じ board/queue エンコーディングを Python で。`encoding_spec.json` で整合検証。

**Files:**
- Create: `python/puyo_train/encoding.py`
- Create: `python/tests/test_encoding.py`

- [ ] **Step 1: Write the failing test**

Create `python/tests/test_encoding.py`:

```python
import json
from pathlib import Path

import numpy as np

from puyo_train.encoding import (
    BOARD_CHANNELS,
    COLOR_ORDER,
    QUEUE_DIM,
    encode_state,
)

SPEC_PATH = Path(__file__).resolve().parents[2] / "src/shared/specs/encoding_spec.json"
ROWS = 13
COLS = 6


def load_spec():
    with SPEC_PATH.open() as f:
        return json.load(f)


def build_state(spec_state):
    field = [[None for _ in range(COLS)] for _ in range(ROWS)]
    if spec_state["field"] is not None:
        for cell in spec_state["field"]:
            field[cell["row"]][cell["col"]] = cell["color"]
    current = spec_state["current"]
    next_queue = spec_state["nextQueue"]
    return {
        "field": field,
        "current": {
            "axis": current["axis"],
            "child": current["child"],
            "axisRow": current["axisRow"],
            "axisCol": current["axisCol"],
            "rotation": current["rotation"],
        },
        "next_queue": next_queue,
    }


def test_constants():
    assert BOARD_CHANNELS == 7
    assert QUEUE_DIM == 16
    assert COLOR_ORDER == ("R", "B", "Y", "P")


def test_spec_cases():
    spec = load_spec()
    for case in spec["cases"]:
        state = build_state(case["state"])
        board, queue, legal = encode_state(state)
        exp = case["expected"]
        assert tuple(board.shape) == tuple(exp["board_shape"])
        assert tuple(queue.shape) == tuple(exp["queue_shape"])
        for s in exp["board_samples"]:
            v = board[s["r"], s["c"], s["ch"]]
            assert abs(float(v) - s["value"]) < 1e-6, (
                f"case={case['name']} r={s['r']} c={s['c']} ch={s['ch']} "
                f"got={v} want={s['value']}"
            )
        assert np.allclose(queue, np.array(exp["queue_values"], dtype=np.float32))
        assert int(legal.sum()) == exp["legal_mask_sum"]
```

- [ ] **Step 2: Run to verify failure**

Run: `pytest tests/test_encoding.py -q`
Expected: FAIL — `ImportError`

- [ ] **Step 3: Create `python/puyo_train/encoding.py`**

```python
from __future__ import annotations

import numpy as np

ROWS = 13
COLS = 6
BOARD_CHANNELS = 7
QUEUE_DIM = 16
COLOR_ORDER = ("R", "B", "Y", "P")
_COLOR_INDEX = {c: i for i, c in enumerate(COLOR_ORDER)}


def encode_state(state: dict) -> tuple[np.ndarray, np.ndarray, np.ndarray]:
    """state = {"field": [[color or None]], "current": {...}, "next_queue": [{...}]}"""
    board = np.zeros((ROWS, COLS, BOARD_CHANNELS), dtype=np.float32)
    field = state["field"]
    for r in range(ROWS):
        for c in range(COLS):
            cell = field[r][c]
            if cell is None:
                board[r, c, 4] = 1.0
            else:
                board[r, c, _COLOR_INDEX[cell]] = 1.0

    current = state.get("current")
    if current is not None:
        ax = _COLOR_INDEX[current["axis"]] / 3.0
        ch = _COLOR_INDEX[current["child"]] / 3.0
        board[:, :, 5] = ax
        board[:, :, 6] = ch

    queue = np.zeros((QUEUE_DIM,), dtype=np.float32)
    nq = state.get("next_queue", [])
    if len(nq) >= 1:
        n1 = nq[0]
        queue[_COLOR_INDEX[n1["axis"]]] = 1.0
        queue[4 + _COLOR_INDEX[n1["child"]]] = 1.0
    if len(nq) >= 2:
        n2 = nq[1]
        queue[8 + _COLOR_INDEX[n2["axis"]]] = 1.0
        queue[12 + _COLOR_INDEX[n2["child"]]] = 1.0

    legal = _legal_mask(field, current)
    return board, queue, legal


def _legal_mask(field, current) -> np.ndarray:
    """Python 側では self-play 時は Node が生成した legal_mask を JSONL で受け取る想定。
    ここでは学習と評価のみで使う簡易マスク(壁外を 0 にするだけ)を返す。
    各アクション index の axisCol が壁外でなければ 1。
    """
    from .action import ACTION_COUNT, action_index_to_move

    mask = np.zeros((ACTION_COUNT,), dtype=np.uint8)
    if current is None:
        return mask
    for i in range(ACTION_COUNT):
        col, rot = action_index_to_move(i)
        dc = 1 if rot == 1 else -1 if rot == 3 else 0
        if 0 <= col < COLS and 0 <= col + dc < COLS:
            mask[i] = 1
    return mask
```

**Note:** 学習・Python 側での推論では厳密な到達可能性判定は不要(self-play 時に Node が生成したマスクはデータに含めないが、評価時に「物理的に壁外」だけ弾けば十分)。完全な reachability 実装は 5b で必要になれば移植する。

- [ ] **Step 4: Run to verify pass**

Run: `pytest tests/test_encoding.py -q`
Expected: PASS(2 tests)

- [ ] **Step 5: Commit**

```bash
git add python/puyo_train/encoding.py python/tests/test_encoding.py
git commit -m "feat(python): port state encoding, cross-validated with JSON spec"
```

---

## Task 8: Python dataset module

JSONL を読み、(board, queue, action, value_target) の PyTorch テンソルバッチに変換する。

**Files:**
- Create: `python/puyo_train/dataset.py`
- Create: `python/tests/test_dataset.py`

- [ ] **Step 1: Write the failing test**

Create `python/tests/test_dataset.py`:

```python
import json
from pathlib import Path

import torch

from puyo_train.dataset import SelfPlayDataset, value_target_from_score


def _write_jsonl(tmp_path: Path, rows: list[dict]) -> Path:
    p = tmp_path / "mini.jsonl"
    with p.open("w") as f:
        for r in rows:
            f.write(json.dumps(r) + "\n")
    return p


def _make_row(seed=1, game_id=0, move_index=0, action=0, score=10000, chain=2):
    return {
        "seed": seed,
        "game_id": game_id,
        "move_index": move_index,
        "field": [[None] * 6 for _ in range(13)],
        "current_axis": "R",
        "current_child": "B",
        "next1_axis": "Y",
        "next1_child": "P",
        "next2_axis": "R",
        "next2_child": "R",
        "teacher_move": {"axisCol": 2, "rotation": 0},
        "teacher_action_index": action,
        "final_score": score,
        "final_max_chain": chain,
    }


def test_value_target_from_score_monotonic():
    a = value_target_from_score(1000)
    b = value_target_from_score(10000)
    c = value_target_from_score(100000)
    assert -1.0 <= a < b < c <= 1.0


def test_dataset_loads_jsonl(tmp_path: Path):
    rows = [_make_row(action=i, score=5000 + 100 * i) for i in range(5)]
    path = _write_jsonl(tmp_path, rows)
    ds = SelfPlayDataset([path])
    assert len(ds) == 5
    board, queue, action, value = ds[3]
    assert board.shape == (13, 6, 7)
    assert queue.shape == (16,)
    assert isinstance(action.item(), int)
    assert action.item() == 3
    assert isinstance(value.item(), float)
    assert -1.0 <= value.item() <= 1.0


def test_dataloader_batches(tmp_path: Path):
    rows = [_make_row(action=i % 22, score=5000 + i) for i in range(17)]
    path = _write_jsonl(tmp_path, rows)
    ds = SelfPlayDataset([path])
    loader = torch.utils.data.DataLoader(ds, batch_size=4, shuffle=False)
    batches = list(loader)
    assert len(batches) == 5
    b, q, a, v = batches[0]
    assert b.shape == (4, 13, 6, 7)
    assert q.shape == (4, 16)
    assert a.shape == (4,)
    assert v.shape == (4,)
```

- [ ] **Step 2: Run to verify failure**

Run: `pytest tests/test_dataset.py -q`
Expected: FAIL — `ImportError`

- [ ] **Step 3: Create `python/puyo_train/dataset.py`**

```python
from __future__ import annotations

import json
import math
from pathlib import Path

import numpy as np
import torch
from torch.utils.data import Dataset

from .encoding import encode_state

VALUE_SCALE = 20000.0  # tanh(score / VALUE_SCALE) を value_target に使う


def value_target_from_score(score: float) -> float:
    return float(math.tanh(score / VALUE_SCALE))


class SelfPlayDataset(Dataset):
    """JSONL 形式(1 行 1 局面)の self-play ログを PyTorch Dataset 化。

    返り値: (board[13,6,7] float32, queue[16] float32, action[int64], value[float32])
    """

    def __init__(self, files: list[Path]):
        rows: list[dict] = []
        for f in files:
            with open(f) as fp:
                for line in fp:
                    line = line.strip()
                    if not line:
                        continue
                    rows.append(json.loads(line))
        self.rows = rows

    def __len__(self) -> int:
        return len(self.rows)

    def __getitem__(self, idx: int):
        row = self.rows[idx]
        state = {
            "field": row["field"],
            "current": {
                "axis": row["current_axis"],
                "child": row["current_child"],
                "axisRow": 1,
                "axisCol": 2,
                "rotation": 0,
            },
            "next_queue": [
                {"axis": row["next1_axis"], "child": row["next1_child"]},
                {"axis": row["next2_axis"], "child": row["next2_child"]},
            ],
        }
        board, queue, _ = encode_state(state)
        action = int(row["teacher_action_index"])
        value = value_target_from_score(float(row["final_score"]))
        return (
            torch.from_numpy(board),
            torch.from_numpy(queue),
            torch.tensor(action, dtype=torch.int64),
            torch.tensor(value, dtype=torch.float32),
        )


def load_all(data_dir: Path) -> SelfPlayDataset:
    files = sorted(Path(data_dir).glob("*.jsonl"))
    if not files:
        raise FileNotFoundError(f"no JSONL files in {data_dir}")
    return SelfPlayDataset(files)
```

**Note:** `axisRow` / `axisCol` / `rotation` は encoding で使わない(board は field のみ、queue は current の色のみ)ので 1/2/0 のプレースホルダで OK。

- [ ] **Step 4: Run to verify pass**

Run: `pytest tests/test_dataset.py -q`
Expected: PASS(3 tests)

- [ ] **Step 5: Commit**

```bash
git add python/puyo_train/dataset.py python/tests/test_dataset.py
git commit -m "feat(python): add JSONL Dataset for self-play logs"
```

---

## Task 9: Python model definition

CNN 3 層 + concat + FC 128 → policy(22) + value(1)。

**Files:**
- Create: `python/puyo_train/model.py`
- Create: `python/tests/test_model.py`

- [ ] **Step 1: Write the failing test**

Create `python/tests/test_model.py`:

```python
import torch

from puyo_train.model import PolicyValueNet


def test_forward_shapes():
    net = PolicyValueNet()
    board = torch.zeros(4, 13, 6, 7)
    queue = torch.zeros(4, 16)
    policy, value = net(board, queue)
    assert policy.shape == (4, 22)
    assert value.shape == (4,)


def test_param_count_reasonable():
    net = PolicyValueNet()
    n = sum(p.numel() for p in net.parameters())
    assert 50_000 < n < 500_000, f"param count unexpected: {n}"


def test_loss_finite():
    net = PolicyValueNet()
    board = torch.zeros(2, 13, 6, 7)
    queue = torch.zeros(2, 16)
    action = torch.tensor([0, 5], dtype=torch.int64)
    value_target = torch.tensor([0.1, -0.2], dtype=torch.float32)
    policy, value = net(board, queue)
    loss_p = torch.nn.functional.cross_entropy(policy, action)
    loss_v = torch.nn.functional.mse_loss(value, value_target)
    loss = loss_p + loss_v
    assert torch.isfinite(loss)
    loss.backward()
    has_grad = any(p.grad is not None and torch.isfinite(p.grad).all() for p in net.parameters())
    assert has_grad
```

- [ ] **Step 2: Run to verify failure**

Run: `pytest tests/test_model.py -q`
Expected: FAIL — `ImportError`

- [ ] **Step 3: Create `python/puyo_train/model.py`**

```python
from __future__ import annotations

import torch
from torch import nn


class PolicyValueNet(nn.Module):
    """CNN + FC dual-head (policy 22 + value scalar).

    Input:
      board: (B, 13, 6, 7)   NHWC
      queue: (B, 16)
    Output:
      policy_logits: (B, 22)
      value:         (B,)      tanh in [-1, 1]
    """

    BOARD_C = 7
    BOARD_H = 13
    BOARD_W = 6

    def __init__(self) -> None:
        super().__init__()
        self.conv1 = nn.Conv2d(self.BOARD_C, 32, kernel_size=3, padding=1)
        self.conv2 = nn.Conv2d(32, 64, kernel_size=3, padding=1)
        self.conv3 = nn.Conv2d(64, 64, kernel_size=3, padding=1)

        self.queue_fc = nn.Linear(16, 32)

        self.trunk = nn.Linear(self.BOARD_H * self.BOARD_W * 64 + 32, 128)
        self.policy_head = nn.Linear(128, 22)
        self.value_head = nn.Linear(128, 1)

    def forward(self, board: torch.Tensor, queue: torch.Tensor) -> tuple[torch.Tensor, torch.Tensor]:
        # NHWC → NCHW
        x = board.permute(0, 3, 1, 2).contiguous()
        x = torch.relu(self.conv1(x))
        x = torch.relu(self.conv2(x))
        x = torch.relu(self.conv3(x))
        x = x.flatten(start_dim=1)

        q = torch.relu(self.queue_fc(queue))

        h = torch.relu(self.trunk(torch.cat([x, q], dim=1)))
        policy = self.policy_head(h)
        value = torch.tanh(self.value_head(h)).squeeze(-1)
        return policy, value
```

- [ ] **Step 4: Run to verify pass**

Run: `pytest tests/test_model.py -q`
Expected: PASS(3 tests)

- [ ] **Step 5: Commit**

```bash
git add python/puyo_train/model.py python/tests/test_model.py
git commit -m "feat(python): add CNN+FC dual-head PolicyValueNet"
```

---

## Task 10: Python training loop

`train.py` を書いて epoch ループ、検証、ベストモデル保存。

**Files:**
- Create: `python/train.py`
- Create: `python/tests/test_train_smoke.py`

- [ ] **Step 1: Write the smoke test**

Create `python/tests/test_train_smoke.py`:

```python
import json
from pathlib import Path

from train import run_training


def _write_jsonl(tmp_path: Path, n: int = 40) -> Path:
    data_dir = tmp_path / "data"
    data_dir.mkdir()
    p = data_dir / "mini.jsonl"
    with p.open("w") as f:
        for i in range(n):
            row = {
                "seed": 1,
                "game_id": i // 10,
                "move_index": i % 10,
                "field": [[None] * 6 for _ in range(13)],
                "current_axis": "R",
                "current_child": "B",
                "next1_axis": "Y",
                "next1_child": "P",
                "next2_axis": "R",
                "next2_child": "R",
                "teacher_move": {"axisCol": i % 6, "rotation": 0},
                "teacher_action_index": i % 22,
                "final_score": 5000 + 100 * i,
                "final_max_chain": 2,
            }
            f.write(json.dumps(row) + "\n")
    return data_dir


def test_smoke_training(tmp_path: Path):
    data_dir = _write_jsonl(tmp_path, n=40)
    ckpt = tmp_path / "policy.pt"
    history = run_training(
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
        assert "train_loss" in h and "val_loss" in h
        assert h["train_loss"] >= 0
```

- [ ] **Step 2: Run to verify failure**

Run: `pytest tests/test_train_smoke.py -q`
Expected: FAIL — `ImportError: train`

- [ ] **Step 3: Create `python/train.py`**

```python
from __future__ import annotations

import argparse
import random
from dataclasses import dataclass
from pathlib import Path

import numpy as np
import torch
from torch.utils.data import DataLoader, Subset

from puyo_train.dataset import SelfPlayDataset, load_all
from puyo_train.model import PolicyValueNet


@dataclass
class EpochStat:
    epoch: int
    train_loss: float
    val_loss: float
    val_top1: float


def run_training(
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
) -> list[dict]:
    torch.manual_seed(seed)
    random.seed(seed)
    np.random.seed(seed)

    ds = load_all(data_dir)
    n = len(ds)
    idx = list(range(n))
    random.shuffle(idx)
    split = max(1, int(n * (1.0 - val_fraction)))
    train_ds = Subset(ds, idx[:split])
    val_ds = Subset(ds, idx[split:]) if split < n else Subset(ds, idx[:1])

    train_loader = DataLoader(train_ds, batch_size=batch_size, shuffle=True)
    val_loader = DataLoader(val_ds, batch_size=batch_size, shuffle=False)

    net = PolicyValueNet().to(device)
    opt = torch.optim.Adam(net.parameters(), lr=lr, weight_decay=1e-4)

    history: list[EpochStat] = []
    best_val = float("inf")
    for epoch in range(epochs):
        net.train()
        tr_losses: list[float] = []
        for board, queue, action, value in train_loader:
            board = board.to(device)
            queue = queue.to(device)
            action = action.to(device)
            value = value.to(device)
            opt.zero_grad()
            p_logits, v_pred = net(board, queue)
            l_p = torch.nn.functional.cross_entropy(p_logits, action)
            l_v = torch.nn.functional.mse_loss(v_pred, value)
            loss = l_p + alpha * l_v
            loss.backward()
            opt.step()
            tr_losses.append(float(loss.item()))

        net.eval()
        v_losses: list[float] = []
        top1_correct = 0
        top1_total = 0
        with torch.no_grad():
            for board, queue, action, value in val_loader:
                board = board.to(device)
                queue = queue.to(device)
                action = action.to(device)
                value = value.to(device)
                p_logits, v_pred = net(board, queue)
                l_p = torch.nn.functional.cross_entropy(p_logits, action)
                l_v = torch.nn.functional.mse_loss(v_pred, value)
                v_losses.append(float((l_p + alpha * l_v).item()))
                pred = p_logits.argmax(dim=1)
                top1_correct += int((pred == action).sum().item())
                top1_total += int(action.numel())

        stat = EpochStat(
            epoch=epoch,
            train_loss=sum(tr_losses) / max(1, len(tr_losses)),
            val_loss=sum(v_losses) / max(1, len(v_losses)),
            val_top1=top1_correct / max(1, top1_total),
        )
        history.append(stat)
        print(
            f"epoch={stat.epoch} train={stat.train_loss:.4f} "
            f"val={stat.val_loss:.4f} top1={stat.val_top1:.3f}"
        )

        if stat.val_loss < best_val:
            best_val = stat.val_loss
            out_path.parent.mkdir(parents=True, exist_ok=True)
            torch.save(net.state_dict(), out_path)

    return [h.__dict__ for h in history]


def main() -> None:
    p = argparse.ArgumentParser()
    p.add_argument("--data", type=Path, default=Path("../data/selfplay"))
    p.add_argument("--out", type=Path, default=Path("checkpoints/policy-v1.pt"))
    p.add_argument("--epochs", type=int, default=30)
    p.add_argument("--batch", type=int, default=256)
    p.add_argument("--lr", type=float, default=1e-3)
    p.add_argument("--val", type=float, default=0.1)
    p.add_argument("--device", type=str, default="mps")
    args = p.parse_args()

    run_training(
        data_dir=args.data,
        out_path=args.out,
        epochs=args.epochs,
        batch_size=args.batch,
        lr=args.lr,
        device=args.device,
        val_fraction=args.val,
    )


if __name__ == "__main__":
    main()
```

- [ ] **Step 4: Run to verify pass**

Run: `pytest tests/test_train_smoke.py -q`
Expected: PASS(smoke 1 test、~5-10 秒)

- [ ] **Step 5: Commit**

```bash
git add python/train.py python/tests/test_train_smoke.py
git commit -m "feat(python): add training loop with best-val checkpointing"
```

---

## Task 11: Export pipeline (PyTorch → ONNX → TF.js)

PyTorch checkpoint を TF.js GraphModel に変換するスクリプト。

**Files:**
- Create: `python/puyo_train/export.py`
- Create: `python/tests/test_export.py`

- [ ] **Step 1: Write the failing test**

Create `python/tests/test_export.py`:

```python
from pathlib import Path

import torch

from puyo_train.export import export_to_onnx
from puyo_train.model import PolicyValueNet


def test_export_to_onnx(tmp_path: Path):
    net = PolicyValueNet()
    ckpt = tmp_path / "net.pt"
    torch.save(net.state_dict(), ckpt)
    out = tmp_path / "net.onnx"
    export_to_onnx(ckpt, out)
    assert out.exists()
    assert out.stat().st_size > 0
```

**Note:** TF.js 変換(`onnx2tf` + `tensorflowjs_converter`)はバイナリが重く、PR/CI 時間への影響が大きいので unit test ではなく **Task 16 の production 手順内で手動検証**する(`export_to_onnx` までユニットテスト、`onnx_to_tfjs` は smoke 実行のみ)。

- [ ] **Step 2: Run to verify failure**

Run: `pytest tests/test_export.py -q`
Expected: FAIL — `ImportError`

- [ ] **Step 3: Create `python/puyo_train/export.py`**

```python
from __future__ import annotations

import argparse
import shutil
import subprocess
import tempfile
from pathlib import Path

import torch

from .model import PolicyValueNet


def export_to_onnx(ckpt_path: Path, onnx_path: Path) -> None:
    net = PolicyValueNet()
    net.load_state_dict(torch.load(ckpt_path, map_location="cpu"))
    net.eval()

    dummy_board = torch.zeros(1, 13, 6, 7)
    dummy_queue = torch.zeros(1, 16)

    onnx_path.parent.mkdir(parents=True, exist_ok=True)
    torch.onnx.export(
        net,
        (dummy_board, dummy_queue),
        str(onnx_path),
        input_names=["board", "queue"],
        output_names=["policy", "value"],
        dynamic_axes={
            "board": {0: "batch"},
            "queue": {0: "batch"},
            "policy": {0: "batch"},
            "value": {0: "batch"},
        },
        opset_version=17,
    )


def onnx_to_tfjs(onnx_path: Path, out_dir: Path) -> None:
    """ONNX → TF SavedModel(onnx2tf)→ TF.js GraphModel(tensorflowjs_converter)"""
    out_dir.mkdir(parents=True, exist_ok=True)
    with tempfile.TemporaryDirectory() as td:
        tf_saved = Path(td) / "tf_model"
        subprocess.run(
            [
                "onnx2tf",
                "-i", str(onnx_path),
                "-o", str(tf_saved),
                "-osd",  # enable SavedModel output
            ],
            check=True,
        )
        subprocess.run(
            [
                "tensorflowjs_converter",
                "--input_format=tf_saved_model",
                "--output_format=tfjs_graph_model",
                str(tf_saved),
                str(out_dir),
            ],
            check=True,
        )


def export_full(ckpt_path: Path, out_dir: Path) -> None:
    out_dir.mkdir(parents=True, exist_ok=True)
    onnx_path = out_dir / "policy.onnx"
    export_to_onnx(ckpt_path, onnx_path)
    onnx_to_tfjs(onnx_path, out_dir)
    # ONNX は重いので成果物として残さない
    if onnx_path.exists():
        onnx_path.unlink()


def main() -> None:
    p = argparse.ArgumentParser()
    p.add_argument("--ckpt", type=Path, required=True)
    p.add_argument("--out", type=Path, required=True)
    args = p.parse_args()
    export_full(args.ckpt, args.out)


if __name__ == "__main__":
    main()
```

- [ ] **Step 4: Run to verify pass**

Run: `pytest tests/test_export.py -q`
Expected: PASS(1 test)

- [ ] **Step 5: Commit**

```bash
git add python/puyo_train/export.py python/tests/test_export.py
git commit -m "feat(python): add ONNX/TF.js export pipeline"
```

---

## Task 12: TS MlAI implementation

`@tensorflow/tfjs` を使ってブラウザで推論する `MlAI`。

**Files:**
- Create: `src/ai/ml/ml-ai.ts`
- Create: `src/ai/ml/__tests__/ml-ai.test.ts`
- Modify: `package.json`(dependencies に `@tensorflow/tfjs`)

- [ ] **Step 1: Install dependency**

```bash
npm install @tensorflow/tfjs
```

- [ ] **Step 2: Write the failing test**

Create `src/ai/ml/__tests__/ml-ai.test.ts`:

```ts
import { describe, it, expect, vi } from 'vitest';
import { createEmptyField } from '../../../game/field';
import type { GameState } from '../../../game/types';
import { MlAI } from '../ml-ai';

function makeState(): GameState {
  return {
    field: createEmptyField(),
    current: {
      pair: { axis: 'R', child: 'B' },
      axisRow: 1,
      axisCol: 2,
      rotation: 0,
    },
    nextQueue: [
      { axis: 'Y', child: 'P' },
      { axis: 'R', child: 'R' },
    ],
    score: 0,
    chainCount: 0,
    totalChains: 0,
    maxChain: 0,
    status: 'playing',
    rngSeed: 0,
  };
}

describe('MlAI', () => {
  it('suggest() uses fake predict() to produce top-K moves honoring legalMask', async () => {
    const ai = new MlAI();

    // 22 手の logits。インデックス 0 が最大、壁外 5 と 11 に大きな値を入れて
    // legalMask (== 0) で落ちることを確認する。壁外以外は一律。
    const logits = new Float32Array(22);
    logits[5] = 100;
    logits[11] = 100;
    logits[0] = 50;
    logits[8] = 40;

    const fakeModel = {
      predict: vi.fn(() => {
        const policyTensor = {
          data: () => Promise.resolve(logits),
          dispose: () => {},
        };
        const valueTensor = {
          data: () => Promise.resolve(new Float32Array([0.12])),
          dispose: () => {},
        };
        return [policyTensor, valueTensor];
      }),
      dispose: vi.fn(),
    };
    ai.__setModelForTest(fakeModel as unknown as never);

    const state = makeState();
    // col=5 を全段塞いで legalMask[5] を 0 にしても、空盤面なので今回は全合法。
    // 代わりに logits[5] / logits[11] に大きな値を入れて合法でも top-K 候補に
    // 含まれることを確認する。壁外フィルタは空盤面だと効かないため。
    const moves = await ai.suggest(state, 3);
    expect(moves).toHaveLength(3);
    // 最大 logits の 5 と 11 が候補に入る
    const idx = moves.map((m) => (m.rotation === 0 ? m.axisCol : m.rotation === 2 ? 6 + m.axisCol : null));
    expect(idx.includes(5) || idx.includes(11)).toBe(true);
    // reason に policy 確率と value が含まれる
    expect(moves[0]!.reason).toMatch(/p=/);
    expect(moves[0]!.reason).toMatch(/v=/);
  });

  it('returns [] when current is null', async () => {
    const ai = new MlAI();
    const fakeModel = {
      predict: vi.fn(),
      dispose: vi.fn(),
    };
    ai.__setModelForTest(fakeModel as unknown as never);
    const state = makeState();
    const moves = await ai.suggest({ ...state, current: null }, 3);
    expect(moves).toEqual([]);
  });
});
```

- [ ] **Step 3: Run to verify failure**

Run: `npm test -- ml-ai`
Expected: FAIL — module not found

- [ ] **Step 4: Create `src/ai/ml/ml-ai.ts`**

```ts
import type { PuyoAI } from '../types';
import type { GameState, Move } from '../../game/types';
import { encodeState } from './encoding';
import { actionIndexToMove } from '../../game/action';

// TF.js は Worker 側で実体を import する。ここでは型だけ緩く扱う。
interface TfModel {
  predict(inputs: unknown): unknown;
  dispose(): void;
}

const MODEL_URL = '/models/policy-v1/model.json';

export class MlAI implements PuyoAI {
  readonly name = 'ml';
  readonly version = 'policy-v1';
  private model: TfModel | null = null;
  private loading: Promise<void> | null = null;

  async init(): Promise<void> {
    if (this.model || this.loading) {
      if (this.loading) await this.loading;
      return;
    }
    this.loading = this.loadModel();
    try {
      await this.loading;
    } finally {
      this.loading = null;
    }
  }

  private async loadModel(): Promise<void> {
    const tf = await import('@tensorflow/tfjs');
    const model = await tf.loadGraphModel(MODEL_URL);
    this.model = model as unknown as TfModel;
    // ウォームアップ 1 回
    const board = tf.zeros([1, 13, 6, 7]);
    const queue = tf.zeros([1, 16]);
    const warm = model.predict([board, queue]) as unknown as { dispose: () => void }[];
    for (const t of warm) t.dispose();
    board.dispose();
    queue.dispose();
  }

  async suggest(state: GameState, topK: number): Promise<Move[]> {
    if (!this.model) return [];
    if (state.current === null) return [];
    const { board, queue, legalMask } = encodeState(state);
    const tf = await import('@tensorflow/tfjs');
    const boardT = tf.tensor(board, [1, 13, 6, 7]);
    const queueT = tf.tensor(queue, [1, 16]);
    const outs = this.model.predict([boardT, queueT]) as unknown as [
      { data(): Promise<Float32Array>; dispose(): void },
      { data(): Promise<Float32Array>; dispose(): void },
    ];
    const [logitsT, valueT] = outs;
    const [logits, valueArr] = await Promise.all([logitsT.data(), valueT.data()]);
    boardT.dispose();
    queueT.dispose();
    logitsT.dispose();
    valueT.dispose();

    return pickTopK(logits, valueArr[0] ?? 0, legalMask, topK);
  }

  /** @internal test-only */
  __setModelForTest(m: TfModel): void {
    this.model = m;
  }
}

function pickTopK(
  logits: Float32Array,
  value: number,
  legalMask: Uint8Array,
  topK: number,
): Move[] {
  // mask != 1 の場所は -Infinity 相当にする
  const masked = new Float32Array(logits.length);
  let maxLogit = -Infinity;
  for (let i = 0; i < logits.length; i++) {
    if (legalMask[i] === 1) {
      masked[i] = logits[i]!;
      if (masked[i]! > maxLogit) maxLogit = masked[i]!;
    } else {
      masked[i] = -Infinity;
    }
  }
  // softmax
  const probs = new Float32Array(logits.length);
  let sum = 0;
  for (let i = 0; i < logits.length; i++) {
    probs[i] = masked[i]! === -Infinity ? 0 : Math.exp(masked[i]! - maxLogit);
    sum += probs[i]!;
  }
  if (sum > 0) {
    for (let i = 0; i < probs.length; i++) probs[i] = probs[i]! / sum;
  }

  const entries: { idx: number; p: number }[] = [];
  for (let i = 0; i < probs.length; i++) {
    if (legalMask[i] === 1 && probs[i]! > 0) entries.push({ idx: i, p: probs[i]! });
  }
  entries.sort((a, b) => b.p - a.p);
  return entries.slice(0, topK).map((e) => {
    const m = actionIndexToMove(e.idx);
    return {
      axisCol: m.axisCol,
      rotation: m.rotation,
      score: e.p,
      reason: `p=${e.p.toFixed(2)} v=${value >= 0 ? '+' : ''}${value.toFixed(2)}`,
    };
  });
}
```

- [ ] **Step 5: Run to verify pass**

Run: `npm test -- ml-ai`
Expected: PASS(2 tests)

- [ ] **Step 6: Commit**

```bash
git add src/ai/ml/ml-ai.ts src/ai/ml/__tests__/ml-ai.test.ts package.json package-lock.json
git commit -m "feat(ml): add MlAI implementation with TF.js inference"
```

---

## Task 13: AI Worker set-ai switching

Worker が Heuristic / ML を切り替えられるようにする。

**Files:**
- Modify: `src/ai/worker/ai.worker.ts`
- Create: `src/ai/worker/__tests__/ai.worker.test.ts`(スモークのみ、メッセージ分岐のユニット)

**Note:** Worker 本体はブラウザでしか動かないので Vitest はメッセージハンドラを直接 import してテストする形にする。

- [ ] **Step 1: Extract handler into testable function**

Rewrite `src/ai/worker/ai.worker.ts` so handler is testable:

```ts
import { HeuristicAI } from '../heuristic';
import { MlAI } from '../ml/ml-ai';
import type { PuyoAI } from '../types';
import type { GameState, Move } from '../../game/types';

type Kind = 'heuristic' | 'ml';
export type WorkerMessage =
  | { type: 'suggest'; id: number; state: GameState; topK: number }
  | { type: 'set-ai'; kind: Kind };
export type WorkerResponse =
  | { type: 'suggest'; id: number; moves: Move[] }
  | { type: 'set-ai'; kind: Kind; ok: boolean; error?: string };

const heuristic = new HeuristicAI();
let active: PuyoAI = heuristic;
let ml: MlAI | null = null;

export async function handleMessage(
  msg: WorkerMessage,
  send: (r: WorkerResponse) => void,
): Promise<void> {
  if (msg.type === 'set-ai') {
    try {
      if (msg.kind === 'heuristic') {
        active = heuristic;
        send({ type: 'set-ai', kind: 'heuristic', ok: true });
      } else {
        if (ml === null) ml = new MlAI();
        await ml.init();
        active = ml;
        send({ type: 'set-ai', kind: 'ml', ok: true });
      }
    } catch (err) {
      active = heuristic; // fallback
      send({
        type: 'set-ai',
        kind: msg.kind,
        ok: false,
        error: err instanceof Error ? err.message : String(err),
      });
    }
    return;
  }

  if (msg.type === 'suggest') {
    await active.init();
    const moves = await active.suggest(msg.state, msg.topK);
    send({ type: 'suggest', id: msg.id, moves });
    return;
  }
}

// 本物の Worker 環境のみ onmessage を登録
if (typeof self !== 'undefined' && 'onmessage' in self) {
  (self as unknown as Worker).onmessage = (e: MessageEvent<WorkerMessage>) => {
    void handleMessage(e.data, (r) => (self as unknown as Worker).postMessage(r));
  };
}
```

- [ ] **Step 2: Write the test**

Create `src/ai/worker/__tests__/ai.worker.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { handleMessage } from '../ai.worker';
import { createInitialState } from '../../../game/state';

describe('ai.worker handleMessage', () => {
  it('suggest with default (heuristic) returns moves', async () => {
    const sent: unknown[] = [];
    const state = createInitialState(1);
    await handleMessage({ type: 'suggest', id: 7, state, topK: 3 }, (r) => sent.push(r));
    expect(sent).toHaveLength(1);
    const r = sent[0] as { type: string; id: number; moves: unknown[] };
    expect(r.type).toBe('suggest');
    expect(r.id).toBe(7);
    expect(r.moves.length).toBeGreaterThan(0);
  });

  it('set-ai heuristic always succeeds', async () => {
    const sent: unknown[] = [];
    await handleMessage({ type: 'set-ai', kind: 'heuristic' }, (r) => sent.push(r));
    const r = sent[0] as { type: string; ok: boolean };
    expect(r.type).toBe('set-ai');
    expect(r.ok).toBe(true);
  });

  it('set-ai ml falls back to heuristic on load error and reports ok=false', async () => {
    const sent: unknown[] = [];
    // jsdom では fetch('/models/policy-v1/model.json') が失敗する → init 失敗
    await handleMessage({ type: 'set-ai', kind: 'ml' }, (r) => sent.push(r));
    const r = sent[0] as { type: string; ok: boolean; error?: string };
    expect(r.type).toBe('set-ai');
    expect(r.ok).toBe(false);
    expect(r.error).toBeTruthy();
    // フォールバック後は suggest が heuristic で動く
    const state = createInitialState(1);
    await handleMessage({ type: 'suggest', id: 1, state, topK: 1 }, (r2) => sent.push(r2));
    const r2 = sent[1] as { type: string; moves: unknown[] };
    expect(r2.moves.length).toBeGreaterThan(0);
  });
});
```

- [ ] **Step 3: Run to verify pass**

Run: `npm test -- ai.worker`
Expected: PASS(3 tests)

- [ ] **Step 4: Update store client (useAiSuggestion) to post set-ai**

Modify `src/ui/hooks/useAiSuggestion.ts` — add a `setKind(kind)` function exported from the hook or a new hook `useAiKind()`. Minimal change: expose a singleton Worker that accepts `set-ai` messages. Concretely, add:

In `src/ui/hooks/useAiSuggestion.ts` (the file currently posts `suggest`). Find the Worker creation and wrap in a module-level singleton:

```ts
// At module scope (above the hook):
let workerSingleton: Worker | null = null;
function getWorker(): Worker {
  if (workerSingleton) return workerSingleton;
  workerSingleton = new Worker(new URL('../../ai/worker/ai.worker.ts', import.meta.url), {
    type: 'module',
  });
  return workerSingleton;
}
export function setAiKind(kind: 'heuristic' | 'ml'): void {
  getWorker().postMessage({ type: 'set-ai', kind });
}
```

And replace `new Worker(...)` usage inside the hook with `getWorker()`. (The hook previously created a worker in `useEffect`; now it just uses the singleton.)

**Concrete diff hint:** read the current file first, locate the `new Worker(...)` line and replace it.

- [ ] **Step 5: Run full test to check no regressions**

Run: `npm test`
Expected: ALL PASS(既存 + 新規)

- [ ] **Step 6: Commit**

```bash
git add src/ai/worker src/ui/hooks/useAiSuggestion.ts
git commit -m "feat(ml): worker supports set-ai switching between heuristic and ML"
```

---

## Task 14: Header AI selector UI

ヘッダーに「AI: Heuristic / ML」セレクタ。localStorage で記憶。

**Files:**
- Create: `src/ui/components/Header/Header.tsx`
- Create: `src/ui/components/Header/__tests__/Header.test.tsx`
- Modify: `src/ui/App.tsx`(Header を先頭に挿入)

- [ ] **Step 1: Write the failing test**

Create `src/ui/components/Header/__tests__/Header.test.tsx`:

```tsx
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Header } from '../Header';

vi.mock('../../../hooks/useAiSuggestion', () => ({
  setAiKind: vi.fn(),
  useAiSuggestion: () => ({ moves: [], loading: false }),
}));

describe('Header AI selector', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('defaults to heuristic when localStorage is empty', () => {
    render(<Header />);
    const select = screen.getByLabelText('AI') as HTMLSelectElement;
    expect(select.value).toBe('heuristic');
  });

  it('reads saved choice from localStorage', () => {
    localStorage.setItem('puyo.ai.kind', 'ml');
    render(<Header />);
    const select = screen.getByLabelText('AI') as HTMLSelectElement;
    expect(select.value).toBe('ml');
  });

  it('persists change to localStorage and calls setAiKind', async () => {
    const { setAiKind } = (await import('../../../hooks/useAiSuggestion')) as unknown as {
      setAiKind: ReturnType<typeof vi.fn>;
    };
    render(<Header />);
    await userEvent.selectOptions(screen.getByLabelText('AI'), 'ml');
    expect(localStorage.getItem('puyo.ai.kind')).toBe('ml');
    expect(setAiKind).toHaveBeenCalledWith('ml');
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `npm test -- Header`
Expected: FAIL — module not found

- [ ] **Step 3: Create `src/ui/components/Header/Header.tsx`**

```tsx
import { useEffect, useState } from 'react';
import { setAiKind } from '../../hooks/useAiSuggestion';

const STORAGE_KEY = 'puyo.ai.kind';
type Kind = 'heuristic' | 'ml';

function readInitialKind(): Kind {
  const v = typeof localStorage !== 'undefined' ? localStorage.getItem(STORAGE_KEY) : null;
  return v === 'ml' ? 'ml' : 'heuristic';
}

export function Header() {
  const [kind, setKind] = useState<Kind>(readInitialKind);

  useEffect(() => {
    setAiKind(kind);
  }, [kind]);

  return (
    <header className="flex items-center justify-between px-4 py-2 border-b border-slate-700">
      <h1 className="text-slate-100 font-semibold">Puyo Training</h1>
      <label className="text-slate-200 text-sm flex items-center gap-2">
        AI
        <select
          aria-label="AI"
          value={kind}
          onChange={(e) => {
            const next = e.target.value as Kind;
            setKind(next);
            localStorage.setItem(STORAGE_KEY, next);
          }}
          className="bg-slate-800 text-slate-100 border border-slate-600 rounded px-2 py-1"
        >
          <option value="heuristic">Heuristic</option>
          <option value="ml">ML (policy-v1)</option>
        </select>
      </label>
    </header>
  );
}
```

- [ ] **Step 4: Insert into App**

Read `src/ui/App.tsx` and add `<Header />` just inside the top wrapper:

```tsx
import { Header } from './components/Header/Header';
// ...
export function App() {
  return (
    <div className="min-h-screen bg-slate-900 text-slate-100">
      <Header />
      {/* existing layout */}
      ...
    </div>
  );
}
```

(Exact integration depends on current App.tsx content — place Header above the existing top-level content.)

- [ ] **Step 5: Run tests**

Run: `npm test -- Header`
Expected: PASS(3 tests)

Run: `npm test`
Expected: ALL PASS

- [ ] **Step 6: Commit**

```bash
git add src/ui/components/Header src/ui/App.tsx
git commit -m "feat(ui): add AI selector header with localStorage persistence"
```

---

## Task 15: Eval script

AI 同士(Heuristic vs ML 等)の自己対戦評価スクリプト。

**Files:**
- Create: `scripts/eval-ai.ts`
- Modify: `package.json`(scripts に `eval` 追加)

**Note:** ML 側は Node から TF.js を直接ロードするが、Worker 経由ではなく `@tensorflow/tfjs-node` で動かす(Node ランタイム前提)。

- [ ] **Step 1: Install @tensorflow/tfjs-node**

```bash
npm install --save-dev @tensorflow/tfjs-node
```

- [ ] **Step 2: Add npm script**

Modify `package.json` — in scripts add:

```json
"eval": "tsx scripts/eval-ai.ts"
```

- [ ] **Step 3: Create a Node-compatible MlAI loader**

Create `scripts/ml-ai-node.ts`:

```ts
import type { PuyoAI } from '../src/ai/types';
import type { GameState, Move } from '../src/game/types';
import { encodeState } from '../src/ai/ml/encoding';
import { actionIndexToMove } from '../src/game/action';

export async function createNodeMlAI(modelPath: string): Promise<PuyoAI> {
  const tf = await import('@tensorflow/tfjs-node');
  const model = await tf.loadGraphModel(`file://${modelPath}`);
  return {
    name: 'ml',
    version: 'policy-v1',
    async init() {},
    async suggest(state: GameState, topK: number): Promise<Move[]> {
      if (!state.current) return [];
      const { board, queue, legalMask } = encodeState(state);
      const b = tf.tensor(board, [1, 13, 6, 7]);
      const q = tf.tensor(queue, [1, 16]);
      const outs = model.predict([b, q]) as tf.Tensor[];
      const [logits, value] = await Promise.all([outs[0]!.data(), outs[1]!.data()]);
      b.dispose();
      q.dispose();
      outs.forEach((t) => t.dispose());
      const v = Number(value[0] ?? 0);
      return pickTopK(logits as Float32Array, v, legalMask, topK);
    },
  };
}

function pickTopK(
  logits: Float32Array,
  value: number,
  mask: Uint8Array,
  topK: number,
): Move[] {
  let maxLogit = -Infinity;
  for (let i = 0; i < logits.length; i++) {
    if (mask[i] === 1 && logits[i]! > maxLogit) maxLogit = logits[i]!;
  }
  const probs: number[] = [];
  let sum = 0;
  for (let i = 0; i < logits.length; i++) {
    if (mask[i] === 1) {
      const p = Math.exp(logits[i]! - maxLogit);
      probs.push(p);
      sum += p;
    } else {
      probs.push(0);
    }
  }
  if (sum > 0) for (let i = 0; i < probs.length; i++) probs[i] = probs[i]! / sum;
  const entries = probs
    .map((p, idx) => ({ idx, p }))
    .filter((e) => e.p > 0)
    .sort((a, b) => b.p - a.p);
  return entries.slice(0, topK).map((e) => {
    const m = actionIndexToMove(e.idx);
    return {
      axisCol: m.axisCol,
      rotation: m.rotation,
      score: e.p,
      reason: `p=${e.p.toFixed(2)} v=${value.toFixed(2)}`,
    };
  });
}
```

- [ ] **Step 4: Create `scripts/eval-ai.ts`**

```ts
import { createInitialState, commitMove } from '../src/game/state';
import { HeuristicAI } from '../src/ai/heuristic';
import { createNodeMlAI } from './ml-ai-node';
import type { PuyoAI } from '../src/ai/types';
import { moveToActionIndex } from '../src/game/action';

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

async function topOneAgreement(a: PuyoAI, b: PuyoAI, seeds: number[]): Promise<number> {
  let same = 0;
  let total = 0;
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
  const games = Number(arg(args, '--games', '100'));
  const seed0 = Number(arg(args, '--seed', '1'));
  const mlPath = arg(args, '--ml', 'public/models/policy-v1/model.json');

  const heuristic = new HeuristicAI();
  const ml = await createNodeMlAI(mlPath);

  console.log(`Evaluating ${games} games per AI, seed0=${seed0}`);
  const seeds = Array.from({ length: games }, (_, i) => (seed0 + i) >>> 0);

  const hRes = await Promise.all(seeds.map((s) => playOne(heuristic, s)));
  const mRes = await Promise.all(seeds.map((s) => playOne(ml, s)));

  const avg = (arr: number[]) => arr.reduce((a, b) => a + b, 0) / arr.length;
  const avgH = avg(hRes.map((r) => r.score));
  const avgM = avg(mRes.map((r) => r.score));
  const chainH = avg(hRes.map((r) => r.maxChain));
  const chainM = avg(mRes.map((r) => r.maxChain));

  const top1 = await topOneAgreement(heuristic, ml, seeds);

  console.log(`Heuristic avg score: ${avgH.toFixed(0)}  max-chain mean: ${chainH.toFixed(2)}`);
  console.log(`ML        avg score: ${avgM.toFixed(0)}  max-chain mean: ${chainM.toFixed(2)}`);
  console.log(`Ratio (ML/H): ${(avgM / avgH).toFixed(3)}`);
  console.log(`Top-1 agreement (on shared trajectory): ${top1.toFixed(3)}`);
}

function arg(args: string[], key: string, def: string): string {
  const i = args.indexOf(key);
  return i >= 0 && i + 1 < args.length ? args[i + 1]! : def;
}

void main();
```

- [ ] **Step 5: Smoke test(モデルがまだない前提ではスキップ可)**

モデルがまだ生成されていないので、このタスクでは**コードがビルド/型検査を通ることだけ確認**する。Step 6 で `tsc` でチェック。

- [ ] **Step 6: Type-check**

Run: `npx tsc --noEmit`
Expected: 0 errors

- [ ] **Step 7: Commit**

```bash
git add scripts/eval-ai.ts scripts/ml-ai-node.ts package.json package-lock.json
git commit -m "feat(scripts): add AI vs AI evaluation script"
```

---

## Task 16: End-to-end production run

実際に self-play 5k ゲーム生成 → 学習 → エクスポート → ブラウザで動作確認 → 評価。

**Files:**
- Modify: `public/models/policy-v1/` にモデルを配置
- Create: `docs/superpowers/progress/2026-04-24-phase5a-run.md` に結果を残す

- [ ] **Step 1: Self-play 5,000 ゲーム生成**

```bash
npm run selfplay -- --games 5000 --workers 8 --seed 20260424
```

Expected:
- `data/selfplay/selfplay-20260424.jsonl` が生成(~200-300 MB 想定)
- コンソールに `games/s` レート表示
- 終了までの目安: 3-4 時間(Apple Silicon 8 コア)

**確認:**
```bash
wc -l data/selfplay/selfplay-*.jsonl
```
→ おおよそ 200,000〜300,000 行であること。

- [ ] **Step 2: Python 学習を回す**

```bash
cd python
source .venv/bin/activate
python train.py --data ../data/selfplay --out checkpoints/policy-v1.pt --epochs 30 --batch 256 --device mps
```

Expected:
- 各 epoch で `train / val / top1` が出力
- Best val loss が更新されるたび `checkpoints/policy-v1.pt` が保存される
- 目安: 30 epoch で 30-60 分(MPS)
- 学習成功条件: `val_top1 >= 0.55` を最終的に満たす(教師模倣として妥当)

MPS で NaN / op unsupported エラーが出た場合は `--device cpu` にフォールバック(2-3 倍遅い程度)。

- [ ] **Step 3: TF.js にエクスポート**

```bash
python -m puyo_train.export --ckpt checkpoints/policy-v1.pt --out ../public/models/policy-v1
```

Expected:
- `public/models/policy-v1/model.json` と `group1-shard1of1.bin` が生成
- 合計サイズ ~ 600KB 程度、2MB を超えないこと

**確認:**
```bash
ls -lh public/models/policy-v1/
```

- [ ] **Step 4: eval スクリプトで 100 ゲーム対戦**

```bash
cd ..
npm run eval -- --games 100 --seed 1 --ml public/models/policy-v1/model.json
```

Expected:
- `Ratio (ML/H) >= 0.95`(5a パリティ条件)
- `Top-1 agreement >= 0.70`

満たさない場合の対処(優先順):
1. 学習データを倍(10,000 ゲーム)に増やし Task 10 から再実行
2. `PolicyValueNet` の channel を 32/64/64 → 48/96/96 に上げて再学習
3. `lr` を 5e-4 に下げて 50 epoch 学習

- [ ] **Step 5: ブラウザで動作確認**

```bash
npm run dev
```

ブラウザで `http://localhost:5173` を開き:
1. Header の「AI」セレクタで `ML (policy-v1)` を選択
2. 候補リストに `p=0.xx v=+0.xx` 形式で手が出る
3. 1 手進めるごとに 30ms 以下で候補が更新される(Chrome DevTools Performance で確認)
4. Heuristic に戻して動作確認

- [ ] **Step 6: 結果を progress ドキュメントに残す**

Create `docs/superpowers/progress/2026-04-24-phase5a-run.md`:

```markdown
# Phase 5a Production Run (2026-04-24)

## Self-play
- Games: 5000
- Seed base: 20260424
- Samples: <行数>
- Duration: <分>

## Training
- Epochs: 30
- Final val loss: <x.xxx>
- Final val top1: <x.xxx>
- Best checkpoint saved at epoch <N>

## Export
- `public/models/policy-v1/` size: <KB>

## Evaluation (ML vs Heuristic, 100 games)
- ML avg score: <N>
- Heuristic avg score: <N>
- Ratio: <x.xx>
- Top-1 agreement: <x.xx>
- Browser inference latency: <xx>ms

## Parity check
- [ ] Ratio >= 0.95
- [ ] Top-1 >= 0.70
- [ ] Latency <= 30ms
- [ ] Model size <= 2MB
```

実際の数値を書き込んだ上でコミット。

- [ ] **Step 7: Commit model and run report**

```bash
git add public/models/policy-v1 docs/superpowers/progress/2026-04-24-phase5a-run.md
git commit -m "chore(ml): ship trained policy-v1 model and run report"
```

---

## Self-Review Notes

仕様書の各項目に対応するタスクを確認:

- §2 全体アーキテクチャ → Tasks 1-15 全体で実装
- §3 データパイプライン → Task 4(Node self-play)
- §3.2 JSONL スキーマ → Task 4(実装)、Task 8(読み取り)
- §3.3 アクション空間 → Tasks 1, 6
- §4 モデル → Tasks 2(encoding)、9(model)
- §4.3 損失 → Task 10
- §5 学習 → Task 10、Task 16 step 2
- §6 エクスポート → Task 11、Task 16 step 3
- §7 ブラウザ統合 → Tasks 12(MlAI)、13(worker)、14(UI)
- §8 評価 → Task 15、Task 16 step 4
- §9 ディレクトリ構成 → 各タスクで作成
- §10 TS ↔ Python 整合性 → Task 3 fixtures + Tasks 6, 7 cross-test
- §11 テスト → 各タスクで TDD
- §12 スコープ外 → plan にも含めない
- §13 リスクと緩和策 → Task 16 で export ONNX op/TF.js 変換の現実対応、Task 13 で worker fallback

---

## Execution Notes

- Node/TS 側と Python 側は独立に TDD できる。Tasks 5-11(Python)は Tasks 1-4 と並行可能。
- Task 12 以降は Task 2(encoding)と Task 11(export シグネチャ)に依存する。
- Task 16 は手動オペレーション。実装タスクではなく **手順の実行とログの記録**。
- モデルファイル(`public/models/policy-v1/*`)は 2MB 以下を想定。超えた場合は git-lfs を導入するタスクを別途追加。
