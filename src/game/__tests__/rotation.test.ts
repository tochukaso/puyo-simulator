import { describe, it, expect } from 'vitest';
import { tryRotate } from '../rotation';
import { createEmptyField, withCell } from '../field';
import type { ActivePair } from '../types';

const basePair = { pair: { axis: 'R' as const, child: 'B' as const } };

describe('tryRotate', () => {
  it('a normal rotation succeeds', () => {
    const f = createEmptyField();
    const a: ActivePair = { ...basePair, axisRow: 5, axisCol: 2, rotation: 0 };
    const r = tryRotate(f, a, 'cw');
    expect(r).not.toBeNull();
    expect(r!.rotation).toBe(1);
  });

  it('against the left wall, rotation 0→3 (facing left) is impossible → wall kick shifts the axis right', () => {
    const f = createEmptyField();
    const a: ActivePair = { ...basePair, axisRow: 5, axisCol: 0, rotation: 0 };
    const r = tryRotate(f, a, 'ccw');
    expect(r).not.toBeNull();
    expect(r!.rotation).toBe(3);
    expect(r!.axisCol).toBe(1);
  });

  it('quick turn (180 degrees) when sides AND lift are all blocked', () => {
    let f = createEmptyField();
    f = withCell(f, 5, 1, 'Y');
    f = withCell(f, 5, 3, 'Y');
    // Block (4, 3) so floor-kick can't promote the rotation; only the 180°
    // flip remains viable.
    f = withCell(f, 4, 3, 'Y');
    const a: ActivePair = { ...basePair, axisRow: 5, axisCol: 2, rotation: 0 };
    const r = tryRotate(f, a, 'cw');
    expect(r).not.toBeNull();
    expect(r!.rotation).toBe(2);
  });

  it('floor-kick lifts the axis when rotating against a tall neighbour ("回し")', () => {
    // Build a tower in col 3 from row 1 down (row 0 left empty so the
    // floor-kick has somewhere to land the child).
    let f = createEmptyField();
    for (let r = 1; r <= 12; r++) f = withCell(f, r, 3, 'Y');
    const a: ActivePair = { ...basePair, axisRow: 1, axisCol: 2, rotation: 0 };
    const r = tryRotate(f, a, 'cw');
    expect(r).not.toBeNull();
    // Direct rot=1 is blocked by (1,3); floor-kick lifts axisRow=0 so the
    // child can land at (0,3) — the pocket above the tower.
    expect(r!.rotation).toBe(1);
    expect(r!.axisRow).toBe(0);
    expect(r!.axisCol).toBe(2);
  });
});
