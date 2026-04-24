import { describe, it, expect } from 'vitest';
import { pairCells } from '../pair';
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
    const { axisPos, childPos } = pairCells({ ...axis, rotation: 2 });
    expect(childPos).toEqual({ row: 6, col: 2 });
  });

  it('rotation=3: 子が軸の左', () => {
    const { axisPos, childPos } = pairCells({ ...axis, rotation: 3 });
    expect(childPos).toEqual({ row: 5, col: 1 });
  });
});
