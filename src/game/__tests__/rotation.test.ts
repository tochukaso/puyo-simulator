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

  it('quick turn (180 degrees) when both sides are blocked', () => {
    let f = createEmptyField();
    f = withCell(f, 5, 1, 'Y');
    f = withCell(f, 5, 3, 'Y');
    const a: ActivePair = { ...basePair, axisRow: 5, axisCol: 2, rotation: 0 };
    const r = tryRotate(f, a, 'cw');
    expect(r).not.toBeNull();
    expect(r!.rotation).toBe(2);
  });
});
