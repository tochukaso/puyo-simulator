// 「ama subset golden」 テスト。 ama (citrus610/ama, 本家準拠の Puyo Puyo Tsu
// AI) が返す top-K 候補手は本家ルール上 「合法な配置」 であることを前提に、
// 我々の `enumerateLegalMoves` (= reachableTargets ベース) が ama の候補を
// すべて含むかを subset チェックする。
//
// あくまで lite golden: ama wasm の `ama_suggest` は MAX_CANDIDATES=5 で
// top-5 のみ返す仕様 (バッファ 40 byte 固定) なので、 「全 legal moves の
// 一致」 は verify できない。 拡張するには ama wasm を再ビルドして
// `ama_legal_moves` 等の API を露出する必要があり、 別 PR で対応。
//
// このテストでカバーされる回帰: ama が「ある合法な move」を返したのに
// 我々の `enumerateLegalMoves` がそれを 「到達不能」 と誤判定するケース。
// 逆 (我々のほうが余分に許す) は floor kick discard のように
// `isMoveProductive` で別途弾いており、 ama subset 一致では検出できないが、
// それは別の sealed-column.test.ts でカバー。

import { describe, it, expect, beforeAll } from 'vitest';
import { WasmAmaAI } from '../wasm-ama-ai';
import { createInitialState } from '../../../game/state';
import { enumerateLegalMoves } from '../../../game/moves';
import { withCell } from '../../../game/field';
import type { GameState } from '../../../game/types';

function targetKey(axisCol: number, rotation: number): string {
  return `${axisCol}-${rotation}`;
}

function placeColumn(state: GameState, col: number, height: number): GameState {
  // col の下から height 段ぶんぷよを積む (色は 'R' 固定、 連鎖が起きない
  // よう色は問わない単一色パターン)。 fixture 用なので gravity 整合性は不問。
  let f = state.field;
  for (let i = 0; i < height; i++) {
    const row = 13 - i; // row 13 = bottom
    if (row < 1) break;
    f = withCell(f, row, col, 'R');
  }
  return { ...state, field: f };
}

describe('reachability vs ama (lite golden subset)', () => {
  const ai = new WasmAmaAI();

  beforeAll(async () => {
    await ai.init();
  }, 30_000);

  const cases: { name: string; state: () => GameState }[] = [
    {
      name: '空盤面',
      state: () => createInitialState(1234),
    },
    {
      name: 'col 0 を 5 段積み',
      state: () => placeColumn(createInitialState(1234), 0, 5),
    },
    {
      name: 'col 2 (spawn 列) を 8 段積み',
      state: () => placeColumn(createInitialState(1234), 2, 8),
    },
    {
      name: 'col 5 を 12 段積み (もう少しで封印)',
      state: () => placeColumn(createInitialState(1234), 5, 12),
    },
    {
      name: 'col 0 と col 5 の両端を 10 段積み',
      state: () => {
        let s = createInitialState(1234);
        s = placeColumn(s, 0, 10);
        s = placeColumn(s, 5, 10);
        return s;
      },
    },
  ];

  for (const c of cases) {
    it(
      `ama 候補が全て enumerateLegalMoves に含まれる: ${c.name}`,
      async () => {
        const state = c.state();
        const amaCandidates = await ai.suggest(state, 5);
        // ama が候補を返さないケース (= 詰み判定) は特殊なのでスキップ。
        if (amaCandidates.length === 0) return;
        const ourLegal = new Set(
          enumerateLegalMoves(state).map((m) =>
            targetKey(m.axisCol, m.rotation),
          ),
        );
        for (const cand of amaCandidates) {
          const k = targetKey(cand.axisCol, cand.rotation);
          expect(
            ourLegal.has(k),
            `ama suggested ${k} but our enumerateLegalMoves missed it (case: ${c.name})`,
          ).toBe(true);
        }
      },
      30_000,
    );
  }
});
