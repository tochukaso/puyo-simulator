// 本家ぷよぷよ通の「13段目封印列」 と 「14段目 ghost wall」 ルール準拠の
// 挙動を unit test で固定する。 期待値は以下のドキュメント由来:
//
//   - https://puyo-camp.jp/posts/65520 (まわし、画面外操作完全攻略)
//   - https://puyonexus.com/wiki/Special_Maneuvers_and_Mechanics
//
// 我々の実装方針 (commit gate):
//   isMoveValid(state, move) = isMoveReachable && isMoveProductive
//   ・reachable: BFS で実際に (moveLeft/Right/softDrop/rotate) で辿れる
//                (axisCol, rotation) であること
//   ・productive: lockActive 後に盤面が 1 マス以上増えること
//                 (= 「両方とも 14 段目で discard されて turn だけ消費」
//                  という no-op を弾く)
//
// reachable 単独だと floor kick で row 0 col=sealed まで辿り着くと
// 「reachable」 と判定されるが、 commit すると lockActive で全 discard。
// productive を併せて要求することで本家挙動 = 「封印列に縦置き不可」 を再現。

import { describe, it, expect } from 'vitest';
import {
  isMoveProductive,
  isMoveReachable,
  isMoveValid,
} from '../reachability';
import { createEmptyField, withCell } from '../field';
import { ROWS } from '../constants';
import type { ActivePair, Field, GameState, Color } from '../types';

function makeState(field = createEmptyField(), current: ActivePair): GameState {
  return {
    field,
    current,
    nextQueue: [],
    score: 0,
    chainCount: 0,
    totalChains: 0,
    maxChain: 0,
    status: 'playing',
    rngSeed: 0,
    queueIndex: 0,
  };
}

const spawn = (axisCol: number, rotation: 0 | 1 | 2 | 3 = 0): ActivePair => ({
  pair: { axis: 'R', child: 'B' },
  axisRow: 1,
  axisCol,
  rotation,
});

// 列 col を 13段目 (row 1) まで完全に埋める = 「封印列」 状態。
function sealColumn(field: Field, col: number, c: Color = 'R'): Field {
  let f = field;
  for (let r = 1; r < ROWS; r++) {
    f = withCell(f, r, col, c);
  }
  return f;
}

describe('isMoveProductive (封印列の no-op を検出)', () => {
  it('封印列に縦置き (rot 0/2) は両方 discard で no-op', () => {
    const field = sealColumn(createEmptyField(), 0);
    const state = makeState(field, spawn(2));
    expect(isMoveProductive(state, { axisCol: 0, rotation: 0 })).toBe(false);
    expect(isMoveProductive(state, { axisCol: 0, rotation: 2 })).toBe(false);
  });

  it('封印列を axis にした横置き (rot 1) は child が隣の空列に着地して productive', () => {
    // col 0 を封印、 col 1 は空。 axisCol=0 rotation=1 → axis col 0 (discard),
    // child col 1 (lands at row 13)。 1 マス追加されるので productive。
    const field = sealColumn(createEmptyField(), 0);
    const state = makeState(field, spawn(2));
    expect(isMoveProductive(state, { axisCol: 0, rotation: 1 })).toBe(true);
  });

  it('空盤面では全 22 配置が productive', () => {
    const state = makeState(createEmptyField(), spawn(2));
    for (let col = 0; col < 6; col++) {
      for (const rot of [0, 1, 2, 3] as const) {
        const dc = rot === 1 ? 1 : rot === 3 ? -1 : 0;
        if (col + dc < 0 || col + dc >= 6) continue;
        expect(
          isMoveProductive(state, { axisCol: col, rotation: rot }),
          `col=${col} rot=${rot} should be productive on empty board`,
        ).toBe(true);
      }
    }
  });

  it('全列封印で全配置 no-op (productive=false)', () => {
    let field = createEmptyField();
    for (let c = 0; c < 6; c++) field = sealColumn(field, c);
    const state = makeState(field, spawn(2));
    for (let col = 0; col < 6; col++) {
      for (const rot of [0, 1, 2, 3] as const) {
        expect(isMoveProductive(state, { axisCol: col, rotation: rot })).toBe(
          false,
        );
      }
    }
  });
});

describe('isMoveValid = reachable + productive (本家挙動の commit gate)', () => {
  it('封印列縦置きは isMoveReachable=true でも isMoveValid=false', () => {
    // 重要な回帰テスト: reachable だけでは floor kick 経由で「届くが no-op」
    // な move を弾けない。 productive を併せて要求して初めて 「捨てぷよ無限」
    // バグが直る。
    const field = sealColumn(createEmptyField(), 5);
    const state = makeState(field, spawn(2));
    // BFS は floor kick で (axisRow=0, axisCol=5, rotation=0) に到達できる。
    expect(isMoveReachable(state, { axisCol: 5, rotation: 0 })).toBe(true);
    // しかし lockActive で全 discard なので productive=false。
    expect(isMoveProductive(state, { axisCol: 5, rotation: 0 })).toBe(false);
    // → isMoveValid=false。
    expect(isMoveValid(state, { axisCol: 5, rotation: 0 })).toBe(false);
  });

  it('封印列を「横向き軸」 で経由する横置きは valid (= 捨てぷよが許される本来挙動)', () => {
    // col 5 を封印、 spawn col 2 から col 5 隣接 col 4 に置く。 axisCol=4
    // rotation=1 で child は col 5 (sealed)。 child は 14段目 で discard、
    // 軸は col 4 row 13 に着地 → 1 マス追加 = productive。
    const field = sealColumn(createEmptyField(), 5);
    const state = makeState(field, spawn(2));
    expect(isMoveValid(state, { axisCol: 4, rotation: 1 })).toBe(true);
  });

  it('空盤面では全 22 配置 valid', () => {
    const state = makeState(createEmptyField(), spawn(2));
    for (let col = 0; col < 6; col++) {
      for (const rot of [0, 1, 2, 3] as const) {
        const dc = rot === 1 ? 1 : rot === 3 ? -1 : 0;
        if (col + dc < 0 || col + dc >= 6) continue;
        expect(
          isMoveValid(state, { axisCol: col, rotation: rot }),
          `col=${col} rot=${rot} should be valid on empty board`,
        ).toBe(true);
      }
    }
  });

  it('14段目 ghost wall (row 0 col 3) があっても col 3 への通常配置は valid (壁の下に着地)', () => {
    // wall の下は空なので、 lockActive で col 3 row 13/12 に着地 → productive。
    // canPlace は (1, 3, 0) で fail だが、 BFS は softDrop で (≥2, 3, 0) に
    // 到達できるため reachable=true。
    const field = withCell(createEmptyField(), 0, 3, 'R');
    const state = makeState(field, spawn(2));
    expect(isMoveValid(state, { axisCol: 3, rotation: 0 })).toBe(true);
  });
});
