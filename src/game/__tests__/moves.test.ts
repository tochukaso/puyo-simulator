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
  };
}

describe('applyInput move', () => {
  const current: ActivePair = {
    pair: { axis: 'R', child: 'B' },
    axisRow: 5, axisCol: 2, rotation: 0,
  };

  it('moveLeft で 1 列左', () => {
    const s = makeState(current);
    const s2 = applyInput(s, { type: 'moveLeft' });
    expect(s2.current!.axisCol).toBe(1);
  });

  it('moveRight で 1 列右', () => {
    const s = makeState(current);
    const s2 = applyInput(s, { type: 'moveRight' });
    expect(s2.current!.axisCol).toBe(3);
  });

  it('壁を越えては動かない', () => {
    const s = makeState({ ...current, axisCol: 0 });
    const s2 = applyInput(s, { type: 'moveLeft' });
    expect(s2.current!.axisCol).toBe(0);
  });

  it('rotateCW で rotation が +1', () => {
    const s = makeState(current);
    const s2 = applyInput(s, { type: 'rotateCW' });
    expect(s2.current!.rotation).toBe(1);
  });
});

describe('hardDrop', () => {
  it('着地後に current が null、status が resolving', () => {
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
  it('空盤面では約22手返す', () => {
    const s = makeState({
      pair: { axis: 'R', child: 'B' }, axisRow: 0, axisCol: 2, rotation: 0,
    });
    const moves = enumerateLegalMoves(s);
    expect(moves.length).toBe(22);
  });

  it('current が null なら空配列', () => {
    const s = { ...makeState({
      pair: { axis: 'R', child: 'B' }, axisRow: 0, axisCol: 2, rotation: 0,
    }), current: null };
    expect(enumerateLegalMoves(s)).toEqual([]);
  });
});
