import { describe, it, expect } from 'vitest';
import { reachableTargets, isMoveReachable } from '../reachability';
import { createEmptyField, withCell } from '../field';
import { ROWS } from '../constants';
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
    queueIndex: 0,
  };
}

const spawnPair = (axisRow: number, axisCol: number): ActivePair => ({
  pair: { axis: 'R', child: 'B' },
  axisRow,
  axisCol,
  rotation: 0,
});

describe('reachableTargets', () => {
  it('reaches all 22 moves on an empty board', () => {
    const field = createEmptyField();
    const current = spawnPair(1, 2);
    const targets = reachableTargets(field, current);
    // 6 columns × 4 rotations, excluding only off-wall (rot=1 col=5 and rot=3 col=0) = 22.
    // Here we check that the 22 viable (col 0-5, rot 0-3, minus off-wall) targets are all reached.
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

  it('cannot reach columns past an obstacle in the ceiling row', () => {
    // Pair starts at the third column from the left (spawn column col=2).
    // Block col=4 row=0 and row=1 with R so that col=5 is physically unreachable.
    let field = createEmptyField();
    // Fill all of col 4 so the pair can't reach col 5 by rotating, walking,
    // or softdropping around.
    for (let r = 0; r < ROWS; r++) {
      field = withCell(field, r, 4, 'R');
    }
    const current = spawnPair(1, 2);

    const targets = reachableTargets(field, current);
    // col 5 must not be reachable.
    expect(targets.has('5-0')).toBe(false);
    // col 0,1,2,3 are normally reachable.
    expect(targets.has('0-0')).toBe(true);
    expect(targets.has('3-0')).toBe(true);
  });
});

describe('isMoveReachable', () => {
  it('returns true for a reachable move', () => {
    const state = makeState(createEmptyField(), spawnPair(1, 2));
    expect(isMoveReachable(state, { axisCol: 0, rotation: 0 })).toBe(true);
  });

  it('returns false when current is null', () => {
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
    queueIndex: 0,
    };
    expect(isMoveReachable(state, { axisCol: 0, rotation: 0 })).toBe(false);
  });
});
