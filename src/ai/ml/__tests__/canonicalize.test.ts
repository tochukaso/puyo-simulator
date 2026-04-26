import { describe, it, expect } from 'vitest';
import { canonicalizeColors } from '../encoding';
import { ROWS, COLS } from '../../../game/constants';
import type { Color } from '../../../game/types';

function emptyField(): (Color | null)[][] {
  return Array.from({ length: ROWS }, () => Array<Color | null>(COLS).fill(null));
}

describe('canonicalizeColors', () => {
  it('is a no-op on empty state', () => {
    const state = {
      field: { cells: emptyField() },
      current: null,
      nextQueue: [],
    };
    const { canonical, perm } = canonicalizeColors(state as any);
    expect(perm).toEqual({});
    expect(canonical.field.cells).toEqual(state.field.cells);
  });

  it('renames first-seen field color to R', () => {
    const cells = emptyField();
    cells[12]![0] = 'Y';
    cells[12]![1] = 'R';
    const state = {
      field: { cells },
      current: null,
      nextQueue: [],
    };
    const { canonical, perm } = canonicalizeColors(state as any);
    expect(perm).toEqual({ Y: 0, R: 1 });
    expect(canonical.field.cells[12]![0]).toBe('R');
    expect(canonical.field.cells[12]![1]).toBe('B');
  });

  it('continues into current then queue', () => {
    const cells = emptyField();
    cells[12]![0] = 'B';
    const state = {
      field: { cells },
      current: { pair: { axis: 'Y', child: 'P' }, axisRow: 1, axisCol: 2, rotation: 0 },
      nextQueue: [{ axis: 'R', child: 'B' }],
    };
    const { canonical, perm } = canonicalizeColors(state as any);
    expect(perm).toEqual({ B: 0, Y: 1, P: 2, R: 3 });
    expect(canonical.current!.pair.axis).toBe('B'); // Y → B
    expect(canonical.current!.pair.child).toBe('Y'); // P → Y
    expect(canonical.nextQueue[0]!.axis).toBe('P'); // R → P
    expect(canonical.nextQueue[0]!.child).toBe('R'); // B → R
  });
});
