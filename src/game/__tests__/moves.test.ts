import { describe, it, expect } from 'vitest';
import { applyInput, enumerateLegalMoves } from '../moves';
import { createEmptyField } from '../field';
import { ROWS } from '../constants';
import type { ActivePair } from '../types';
import { makeState, sealColumn } from './_helpers';

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

  it('片方着地 sutepuyo (axis 封印列 + child 空き列、 横置き) を candidate に含む', () => {
    // 1 ぷよでも盤面に着地するなら enumerate に含める (ama も同じ判定で
    // legal とするので、 ここで弾くと AI Best が candidate に存在しない手
    // を返す silent failure になる)。
    const field = sealColumn(createEmptyField(), 0);
    const s = makeState(
      { pair: { axis: 'R', child: 'B' }, axisRow: 1, axisCol: 2, rotation: 0 },
      field,
    );
    const moves = enumerateLegalMoves(s);
    // axisCol=0 rotation=1: axis col 0 (sealed → discard), child col 1 (lands)
    expect(moves.some((m) => m.axisCol === 0 && m.rotation === 1)).toBe(true);
    // axisCol=1 rotation=3: axis col 1 (lands), child col 0 (sealed → discard)
    expect(moves.some((m) => m.axisCol === 1 && m.rotation === 3)).toBe(true);
  });

  it('全列封印では legal moves が空配列 (両方 discard で productive=false)', () => {
    // 全配置が pure no-op (added===0) になる極端ケース。 enumerate も空。
    let field = createEmptyField();
    for (let c = 0; c < 6; c++) field = sealColumn(field, c);
    const s = makeState(
      { pair: { axis: 'R', child: 'B' }, axisRow: 1, axisCol: 2, rotation: 0 },
      field,
    );
    expect(enumerateLegalMoves(s)).toEqual([]);
  });
});
