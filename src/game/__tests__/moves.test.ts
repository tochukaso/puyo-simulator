import { describe, it, expect } from 'vitest';
import { applyInput, enumerateLegalMoves } from '../moves';
import { createEmptyField } from '../field';
import { ROWS } from '../constants';
import type { GameState, ActivePair } from '../types';

function makeState(current: ActivePair): GameState {
  return {
    field: createEmptyField(),
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

describe('applyInput move', () => {
  const current: ActivePair = {
    pair: { axis: 'R', child: 'B' },
    axisRow: 5, axisCol: 2, rotation: 0,
  };

  it('moveLeft moves one column left', () => {
    const s = makeState(current);
    const s2 = applyInput(s, { type: 'moveLeft' });
    expect(s2.current!.axisCol).toBe(1);
  });

  it('moveRight moves one column right', () => {
    const s = makeState(current);
    const s2 = applyInput(s, { type: 'moveRight' });
    expect(s2.current!.axisCol).toBe(3);
  });

  it('does not move past the wall', () => {
    const s = makeState({ ...current, axisCol: 0 });
    const s2 = applyInput(s, { type: 'moveLeft' });
    expect(s2.current!.axisCol).toBe(0);
  });

  it('rotateCW increments rotation by 1', () => {
    const s = makeState(current);
    const s2 = applyInput(s, { type: 'rotateCW' });
    expect(s2.current!.rotation).toBe(1);
  });
});

describe('hardDrop', () => {
  it('after landing, current is null and status is resolving', () => {
    const s = makeState({
      pair: { axis: 'R', child: 'B' }, axisRow: 0, axisCol: 2, rotation: 0,
    });
    const s2 = applyInput(s, { type: 'hardDrop' });
    expect(s2.current).toBeNull();
    expect(s2.status).toBe('resolving');
    expect(s2.field.cells[ROWS - 1]![2]!).toBe('R');
  });
});

describe('enumerateLegalMoves', () => {
  it('returns about 22 moves on an empty board', () => {
    const s = makeState({
      pair: { axis: 'R', child: 'B' }, axisRow: 0, axisCol: 2, rotation: 0,
    });
    const moves = enumerateLegalMoves(s);
    expect(moves.length).toBe(22);
  });

  it('returns an empty array when current is null', () => {
    const s = { ...makeState({
      pair: { axis: 'R', child: 'B' }, axisRow: 0, axisCol: 2, rotation: 0,
    }), current: null };
    expect(enumerateLegalMoves(s)).toEqual([]);
  });
});
