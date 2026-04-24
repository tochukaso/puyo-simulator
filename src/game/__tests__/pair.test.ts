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

  it('rotation=0: 子が軸の上', () => {
    const { axisPos, childPos } = pairCells(axis);
    expect(axisPos).toEqual({ row: 5, col: 2 });
    expect(childPos).toEqual({ row: 4, col: 2 });
  });

  it('rotation=1: 子が軸の右', () => {
    const { axisPos, childPos } = pairCells({ ...axis, rotation: 1 });
    expect(axisPos).toEqual({ row: 5, col: 2 });
    expect(childPos).toEqual({ row: 5, col: 3 });
  });

  it('rotation=2: 子が軸の下', () => {
    const result2 = pairCells({ ...axis, rotation: 2 });
    expect(result2.childPos).toEqual({ row: 6, col: 2 });
  });

  it('rotation=3: 子が軸の左', () => {
    const result3 = pairCells({ ...axis, rotation: 3 });
    expect(result3.childPos).toEqual({ row: 5, col: 1 });
  });
});

describe('canPlace', () => {
  it('空盤面の中央は合法', () => {
    const f = createEmptyField();
    expect(canPlace(f, { pair: { axis: 'R', child: 'B' }, axisRow: 5, axisCol: 2, rotation: 0 })).toBe(true);
  });

  it('壁の外は不可', () => {
    const f = createEmptyField();
    expect(canPlace(f, { pair: { axis: 'R', child: 'B' }, axisRow: 5, axisCol: 0, rotation: 3 })).toBe(false);
    expect(canPlace(f, { pair: { axis: 'R', child: 'B' }, axisRow: 5, axisCol: 5, rotation: 1 })).toBe(false);
  });

  it('ぷよが埋まっているマスは不可', () => {
    let f = createEmptyField();
    f = withCell(f, 5, 2, 'Y');
    expect(canPlace(f, { pair: { axis: 'R', child: 'B' }, axisRow: 5, axisCol: 2, rotation: 0 })).toBe(false);
  });

  it('子が上にはみ出す(row<0)のは合法', () => {
    const f = createEmptyField();
    expect(canPlace(f, { pair: { axis: 'R', child: 'B' }, axisRow: 0, axisCol: 2, rotation: 0 })).toBe(true);
  });
});
