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
//                  という pure no-op だけを弾く。 片方 discard の捨てぷよは
//                  本家ぷよぷよ通でも有効な技なので許可)
//
// reachable 単独だと floor kick で row 0 col=sealed まで辿り着くと
// 「reachable」 と判定されるが、 両方 discard される配置は productive=false。
// 片方着地する捨てぷよ (本家で頻出) は productive=true として通す。

import { describe, it, expect } from 'vitest';
import {
  isMoveProductive,
  isMoveReachable,
  isMoveValid,
} from '../reachability';
import { createEmptyField, withCell } from '../field';
import type { ActivePair } from '../types';
import { makeState, sealColumn } from './_helpers';

const spawn = (axisCol: number, rotation: 0 | 1 | 2 | 3 = 0): ActivePair => ({
  pair: { axis: 'R', child: 'B' },
  axisRow: 1,
  axisCol,
  rotation,
});

describe('isMoveProductive (封印列の no-op を検出)', () => {
  it('封印列に縦置き (rot 0/2) は両方 discard で no-op', () => {
    const field = sealColumn(createEmptyField(), 0);
    const state = makeState(spawn(2), field);
    expect(isMoveProductive(state, { axisCol: 0, rotation: 0 })).toBe(false);
    expect(isMoveProductive(state, { axisCol: 0, rotation: 2 })).toBe(false);
  });

  it('封印列を axis にした横置き (rot 1) は axis discard でも child が着地するので productive=true (捨てぷよ)', () => {
    // col 0 を封印、 col 1 は空。 axisCol=0 rotation=1 → axis col 0 (discard),
    // child col 1 (lands)。 1 ぷよでも着地するなら productive=true。 本家でも
    // 1 個捨てる手は有効な技 (連鎖の上で目標形を作るため意図的に捨てる等)。
    const field = sealColumn(createEmptyField(), 0);
    const state = makeState(spawn(2), field);
    expect(isMoveProductive(state, { axisCol: 0, rotation: 1 })).toBe(true);
  });

  it('空盤面では全 22 配置が productive', () => {
    const state = makeState(spawn(2));
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
    const state = makeState(spawn(2), field);
    for (let col = 0; col < 6; col++) {
      for (const rot of [0, 1, 2, 3] as const) {
        expect(isMoveProductive(state, { axisCol: col, rotation: rot })).toBe(
          false,
        );
      }
    }
  });

  // ↓ sutepuyo (片方着地) の挙動を固定。 added>=1 でゲートしているので
  //   片方が discard されても残り 1 ぷよが着地すれば productive。

  it('片方着地 sutepuyo (rot 1: axis 空き列 + child 封印列) は productive=true', () => {
    // col 5 を封印、 axisCol=4 rot=1 → axis col 4 (lands), child col 5 (sutepuyo)。
    const field = sealColumn(createEmptyField(), 5);
    const state = makeState(spawn(2), field);
    expect(isMoveProductive(state, { axisCol: 4, rotation: 1 })).toBe(true);
  });

  it('片方着地 sutepuyo (rot 3: axis 空き列 + child 左の封印列) は productive=true', () => {
    // col 0 を封印、 axisCol=1 rot=3 → axis col 1 (lands), child col 0 (sutepuyo)。
    const field = sealColumn(createEmptyField(), 0);
    const state = makeState(spawn(2), field);
    expect(isMoveProductive(state, { axisCol: 1, rotation: 3 })).toBe(true);
  });

  it('片方着地 sutepuyo (rot 1: axis 封印列 + child 空き列) は productive=true', () => {
    // col 0 を封印、 axisCol=0 rot=1 → axis col 0 (sutepuyo), child col 1 (lands)。
    const field = sealColumn(createEmptyField(), 0);
    const state = makeState(spawn(2), field);
    expect(isMoveProductive(state, { axisCol: 0, rotation: 1 })).toBe(true);
  });

  it('封印列の隣に rot 0/2 縦置きすると両方着地で productive=true (封印列とは別の列)', () => {
    // 封印列の隣 col 1 は空き、 そこに縦置きしても両方着地。 隣の封印列は無関係。
    const field = sealColumn(createEmptyField(), 0);
    const state = makeState(spawn(2), field);
    expect(isMoveProductive(state, { axisCol: 1, rotation: 0 })).toBe(true);
    expect(isMoveProductive(state, { axisCol: 1, rotation: 2 })).toBe(true);
  });

  it('5 列封印 + 1 列空きでも空き列に縦置きは productive (周囲に依存しない)', () => {
    // col 0..4 を封印、 col 5 だけ空。 axisCol=5 rot=0 で両方 col 5 に着地。
    let field = createEmptyField();
    for (let c = 0; c < 5; c++) field = sealColumn(field, c);
    const state = makeState(spawn(2), field);
    expect(isMoveProductive(state, { axisCol: 5, rotation: 0 })).toBe(true);
  });
});

describe('isMoveValid = reachable + productive (本家挙動の commit gate)', () => {
  it('封印列縦置きは isMoveReachable=true でも isMoveValid=false', () => {
    // 重要な回帰テスト: reachable だけでは floor kick 経由で「届くが no-op」
    // な move を弾けない。 productive を併せて要求して初めて 「捨てぷよ無限」
    // バグが直る。
    const field = sealColumn(createEmptyField(), 5);
    const state = makeState(spawn(2), field);
    // BFS は floor kick で (axisRow=0, axisCol=5, rotation=0) に到達できる。
    expect(isMoveReachable(state, { axisCol: 5, rotation: 0 })).toBe(true);
    // しかし lockActive で全 discard なので productive=false。
    expect(isMoveProductive(state, { axisCol: 5, rotation: 0 })).toBe(false);
    // → isMoveValid=false。
    expect(isMoveValid(state, { axisCol: 5, rotation: 0 })).toBe(false);
  });

  it('封印列に child が重なる横置きは片方着地で valid=true (捨てぷよ)', () => {
    // col 5 を封印。 axisCol=4 rotation=1 で child は col 5 (sealed)。 child
    // discard、 軸は col 4 に着地。 1 ぷよ着地すれば valid=true。 ama も
    // 同じ手を legal として suggest してくる (= AI Best が commit できる)。
    const field = sealColumn(createEmptyField(), 5);
    const state = makeState(spawn(2), field);
    expect(isMoveValid(state, { axisCol: 4, rotation: 1 })).toBe(true);
  });

  it('空盤面では全 22 配置 valid', () => {
    const state = makeState(spawn(2));
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
    const state = makeState(spawn(2), field);
    expect(isMoveValid(state, { axisCol: 3, rotation: 0 })).toBe(true);
  });

  it('片方着地 sutepuyo の横置きは reachable + productive で valid=true', () => {
    // 天井近くまで埋まった盤面で 「端列が封印 + 隣列に横置きで一方が discard」
    // という状況。 reachable / productive / valid の 3 つが揃って初めて
    // commit gate を通るので、 ここでは 3 段すべて明示的に固定する。
    const field = sealColumn(createEmptyField(), 0);
    const state = makeState(spawn(2), field);
    expect(isMoveReachable(state, { axisCol: 0, rotation: 1 })).toBe(true);
    expect(isMoveProductive(state, { axisCol: 0, rotation: 1 })).toBe(true);
    expect(isMoveValid(state, { axisCol: 0, rotation: 1 })).toBe(true);
  });
});
