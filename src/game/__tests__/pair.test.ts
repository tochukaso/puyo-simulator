import { describe, it, expect } from 'vitest';
import { pairCells, canPlace } from '../pair';
import { createEmptyField, withCell } from '../field';
import type { ActivePair } from '../types';

describe('pairCells', () => {
  const axis: ActivePair = {
    pair: { axis: 'R', child: 'B' },
    axisRow: 5,
    axisCol: 2,
    rotation: 0,
  };

  it('rotation=0: child sits above the axis', () => {
    const { axisPos, childPos } = pairCells(axis);
    expect(axisPos).toEqual({ row: 5, col: 2 });
    expect(childPos).toEqual({ row: 4, col: 2 });
  });

  it('rotation=1: child sits to the right of the axis', () => {
    const { axisPos, childPos } = pairCells({ ...axis, rotation: 1 });
    expect(axisPos).toEqual({ row: 5, col: 2 });
    expect(childPos).toEqual({ row: 5, col: 3 });
  });

  it('rotation=2: child sits below the axis', () => {
    const result2 = pairCells({ ...axis, rotation: 2 });
    expect(result2.childPos).toEqual({ row: 6, col: 2 });
  });

  it('rotation=3: child sits to the left of the axis', () => {
    const result3 = pairCells({ ...axis, rotation: 3 });
    expect(result3.childPos).toEqual({ row: 5, col: 1 });
  });
});

describe('canPlace', () => {
  it('center of an empty board is legal', () => {
    const f = createEmptyField();
    expect(canPlace(f, { pair: { axis: 'R', child: 'B' }, axisRow: 5, axisCol: 2, rotation: 0 })).toBe(true);
  });

  it('outside the wall is illegal', () => {
    const f = createEmptyField();
    expect(canPlace(f, { pair: { axis: 'R', child: 'B' }, axisRow: 5, axisCol: 0, rotation: 3 })).toBe(false);
    expect(canPlace(f, { pair: { axis: 'R', child: 'B' }, axisRow: 5, axisCol: 5, rotation: 1 })).toBe(false);
  });

  it('a cell already filled with a puyo is illegal', () => {
    let f = createEmptyField();
    f = withCell(f, 5, 2, 'Y');
    expect(canPlace(f, { pair: { axis: 'R', child: 'B' }, axisRow: 5, axisCol: 2, rotation: 0 })).toBe(false);
  });

  it('legal even when the child sticks out above the top (row<0)', () => {
    const f = createEmptyField();
    expect(canPlace(f, { pair: { axis: 'R', child: 'B' }, axisRow: 0, axisCol: 2, rotation: 0 })).toBe(true);
  });
});
