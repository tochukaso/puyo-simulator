import { describe, it, expect } from 'vitest';
import { tryRotate } from '../rotation';
import { createEmptyField, withCell } from '../field';
import type { ActivePair } from '../types';

const basePair = { pair: { axis: 'R' as const, child: 'B' as const } };

describe('tryRotate', () => {
  it('通常回転が通る', () => {
    const f = createEmptyField();
    const a: ActivePair = { ...basePair, axisRow: 5, axisCol: 2, rotation: 0 };
    const r = tryRotate(f, a, 'cw');
    expect(r).not.toBeNull();
    expect(r!.rotation).toBe(1);
  });

  it('左壁際で rotation=0→3(左向き)が不可 → 壁蹴りで軸を右にずらす', () => {
    const f = createEmptyField();
    const a: ActivePair = { ...basePair, axisRow: 5, axisCol: 0, rotation: 0 };
    const r = tryRotate(f, a, 'ccw');
    expect(r).not.toBeNull();
    expect(r!.rotation).toBe(3);
    expect(r!.axisCol).toBe(1);
  });

  it('両側塞がれていたらクイックターン(180度)', () => {
    let f = createEmptyField();
    f = withCell(f, 5, 1, 'Y');
    f = withCell(f, 5, 3, 'Y');
    const a: ActivePair = { ...basePair, axisRow: 5, axisCol: 2, rotation: 0 };
    const r = tryRotate(f, a, 'cw');
    expect(r).not.toBeNull();
    expect(r!.rotation).toBe(2);
  });
});
