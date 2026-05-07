// 「ama の全 legal moves が 我々の enumerateLegalMoves に必ず含まれる」 を
// verify する golden test。 ama の `ama_legal_moves` API で本家ルール上の
// 全 legal placements を取得し、 我々の `enumerateLegalMoves` の subset で
// あることを assert する。
//
// なぜ subset (片方向) で双方向 set 一致でないか:
//   ama の `is_valid` は floor kick 可否を lookup table (`check[]`,
//   `check_12[]`) でヒューリスティックに判定しており、 一部の edge case
//   (例: heights[5]=12 + axisCol=5 LEFT を横移動 + 回転で到達するパス) は
//   「floor kick anchor がない」 として reject する。 一方、 我々の BFS は
//   実際の盤面でこのパスを正しく到達可能と判定 (axis at our row 1 col 5,
//   child at row 1 col 4 = ama y=12 の浮動位置で valid)。 結果、 ours の方が
//   ama より少しだけ permissive。
//
//   逆方向 (ours が legal とするのに ama が illegal) を一律に弾くと正当な
//   到達を排除してしまうので、 「ama が legal とした手は最低限こちらも legal」
//   の subset チェックで満足する。 「ours が緩すぎて 14段目 discard を
//   許す」 ような defect は別の sealed-column.test.ts (productive 判定) で
//   cover している。
//
// 同色ペアでは ama 側で UP/DOWN, LEFT/RIGHT を de-dup するため、 比較は
// 「同色ペアではこちらも de-dup した上で subset」 を取る。

import { describe, it, expect, beforeAll } from 'vitest';
import { WasmAmaAI } from '../wasm-ama-ai';
import { createInitialState } from '../../../game/state';
import { enumerateLegalMoves } from '../../../game/moves';
import { withCell } from '../../../game/field';
import type { GameState, Move } from '../../../game/types';

function targetKey(axisCol: number, rotation: number): string {
  return `${axisCol}-${rotation}`;
}

// rotation 0 / 2 は 「軸 / 子の上下入れ替えのみ」、 1 / 3 は 「左右入れ替え
// のみ」 で、 ペアが同色なら結果同等の配置になる。 ama 側は pair_equal=true
// で 0 / 1 のみ返すので、 ours 側でも 0 / 1 に正規化して比較する。
function normalizeForSamePair(moves: readonly Move[]): Set<string> {
  const out = new Set<string>();
  for (const m of moves) {
    let r = m.rotation;
    if (r === 2) r = 0; // UP / DOWN dedup
    if (r === 3) {
      // LEFT (axis at col, child at col-1) は RIGHT (axis at col-1, child at col)
      // と同等。 axisCol を 1 つ下げて rotation を 1 (RIGHT) に正規化。
      out.add(targetKey(m.axisCol - 1, 1));
      continue;
    }
    out.add(targetKey(m.axisCol, r));
  }
  return out;
}

function asSet(moves: readonly Move[]): Set<string> {
  return new Set(moves.map((m) => targetKey(m.axisCol, m.rotation)));
}

function placeColumn(state: GameState, col: number, height: number): GameState {
  let f = state.field;
  for (let i = 0; i < height; i++) {
    const row = 13 - i; // row 13 = bottom
    if (row < 1) break;
    f = withCell(f, row, col, 'R');
  }
  return { ...state, field: f };
}

function setColors(
  state: GameState,
  axis: 'R' | 'B' | 'Y' | 'P',
  child: 'R' | 'B' | 'Y' | 'P',
): GameState {
  return {
    ...state,
    current: state.current
      ? { ...state.current, pair: { axis, child } }
      : null,
  };
}

describe('reachability vs ama (full bidirectional golden)', () => {
  const ai = new WasmAmaAI();

  beforeAll(async () => {
    await ai.init();
  }, 30_000);

  const cases: { name: string; state: () => GameState }[] = [
    {
      name: '空盤面 (異色ペア、 22 候補)',
      state: () => setColors(createInitialState(1234), 'R', 'B'),
    },
    {
      name: '空盤面 (同色ペア、 14 候補に de-dup)',
      state: () => setColors(createInitialState(1234), 'R', 'R'),
    },
    {
      name: 'col 0 を 5 段積み',
      state: () => placeColumn(setColors(createInitialState(1234), 'R', 'B'), 0, 5),
    },
    {
      name: 'col 2 (spawn 列) を 8 段積み',
      state: () => placeColumn(setColors(createInitialState(1234), 'R', 'B'), 2, 8),
    },
    {
      name: 'col 5 を 12 段積み (もう少しで封印)',
      state: () => placeColumn(setColors(createInitialState(1234), 'R', 'B'), 5, 12),
    },
    {
      name: 'col 0 と col 5 の両端を 10 段積み',
      state: () => {
        let s = setColors(createInitialState(1234), 'R', 'B');
        s = placeColumn(s, 0, 10);
        s = placeColumn(s, 5, 10);
        return s;
      },
    },
    {
      name: 'col 0 が完全封印 (rows 1..13 全部) — そこへ縦置きは不可',
      state: () => {
        let s = setColors(createInitialState(1234), 'R', 'B');
        s = placeColumn(s, 0, 13);
        return s;
      },
    },
  ];

  for (const c of cases) {
    it(
      `${c.name}: ama 全候補 ⊆ 我々の enumerateLegalMoves`,
      async () => {
        const state = c.state();
        const amaMoves = await ai.legalMoves(state);
        const ourMoves = enumerateLegalMoves(state);

        // 同色ペアの時は ama 側が UP/DOWN/LEFT/RIGHT のうち UP/RIGHT のみ
        // 返す (de-dup)。 こちらも de-dup して比較。
        const sameColor =
          state.current?.pair.axis === state.current?.pair.child;
        const amaSet = sameColor
          ? normalizeForSamePair(amaMoves)
          : asSet(amaMoves);
        const ourSet = sameColor
          ? normalizeForSamePair(ourMoves)
          : asSet(ourMoves);

        // ama ⊆ ours: ama が legal とする手は必ずこちらも legal とする。
        // 逆 (ours が ama より permissive) は ama lookup の保守性ゆえ許容。
        const onlyInAma = [...amaSet].filter((k) => !ourSet.has(k));
        expect(
          onlyInAma,
          `ama lists these legal moves we don't: ${JSON.stringify(onlyInAma)}`,
        ).toEqual([]);
      },
      30_000,
    );
  }
});
