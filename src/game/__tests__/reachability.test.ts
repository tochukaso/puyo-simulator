import { describe, it, expect } from 'vitest';
import { reachableTargets, isMoveReachable } from '../reachability';
import { createEmptyField, withCell } from '../field';
import type { ActivePair, GameState } from '../types';

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
  };
}

const spawnPair = (axisRow: number, axisCol: number): ActivePair => ({
  pair: { axis: 'R', child: 'B' },
  axisRow,
  axisCol,
  rotation: 0,
});

describe('reachableTargets', () => {
  it('空盤面では全 22 手に到達できる', () => {
    const field = createEmptyField();
    const current = spawnPair(1, 2);
    const targets = reachableTargets(field, current);
    // 6列×4回転(対称性で削減せず、壁外の rot=1 col=5 と rot=3 col=0 のみ除外)= 22
    // ここでは「出現可能」な 22 セット (col 0-5, rot 0-3 から壁外除外) が含まれているか
    const expectedTargets = new Set<string>();
    for (let col = 0; col < 6; col++) {
      for (const rot of [0, 1, 2, 3]) {
        const dc = rot === 1 ? 1 : rot === 3 ? -1 : 0;
        if (col + dc < 0 || col + dc >= 6) continue;
        expectedTargets.add(`${col}-${rot}`);
      }
    }
    for (const t of expectedTargets) {
      expect(targets.has(t), `target ${t} not reached`).toBe(true);
    }
  });

  it('天井段に障害物があると跨いだ先の列には到達できない', () => {
    // 左から3列目(spawn列 col=2)にツモ。col=4 の row=0 と row=1 を R で塞ぐ。
    // col=5 には物理的に到達できない。
    let field = createEmptyField();
    // col 4 の一番上2段を塞ぐ
    field = withCell(field, 0, 4, 'R');
    field = withCell(field, 1, 4, 'R');
    // col 4 の下の方も塞いでおかないと softDrop で下から回り込まれる
    for (let r = 2; r <= 12; r++) {
      field = withCell(field, r, 4, 'R');
    }
    const current = spawnPair(1, 2);

    const targets = reachableTargets(field, current);
    // col 5 への到達は不可のはず
    expect(targets.has('5-0')).toBe(false);
    // col 0,1,2,3 は普通に到達可能
    expect(targets.has('0-0')).toBe(true);
    expect(targets.has('3-0')).toBe(true);
  });
});

describe('isMoveReachable', () => {
  it('到達可能な手は true', () => {
    const state = makeState(createEmptyField(), spawnPair(1, 2));
    expect(isMoveReachable(state, { axisCol: 0, rotation: 0 })).toBe(true);
  });

  it('current が null なら false', () => {
    const field = createEmptyField();
    const state: GameState = {
      field,
      current: null,
      nextQueue: [],
      score: 0,
      chainCount: 0,
      totalChains: 0,
      maxChain: 0,
      status: 'playing',
      rngSeed: 0,
    };
    expect(isMoveReachable(state, { axisCol: 0, rotation: 0 })).toBe(false);
  });
});
