import { describe, it, expect } from 'vitest';
import { makeEsportQueue, getEsportQueue } from '../rng';

describe('makeEsportQueue', () => {
  it('returns 128 pairs', () => {
    const q = makeEsportQueue(42);
    expect(q.length).toBe(128);
  });

  it('same seed yields same queue', () => {
    const a = makeEsportQueue(42);
    const b = makeEsportQueue(42);
    expect(a).toEqual(b);
  });

  it('different seeds yield different first pair', () => {
    const a = makeEsportQueue(1);
    const b = makeEsportQueue(2);
    expect(a[0]).not.toEqual(b[0]);
  });

  it('first 2 pairs use only 3 distinct colors', () => {
    const q = makeEsportQueue(123456);
    const colors = new Set<string>();
    colors.add(q[0]!.axis);
    colors.add(q[0]!.child);
    colors.add(q[1]!.axis);
    colors.add(q[1]!.child);
    expect(colors.size).toBeLessThanOrEqual(3);
  });

  it('all colors are valid (R B Y P)', () => {
    const q = makeEsportQueue(7);
    for (const p of q) {
      expect(['R', 'B', 'Y', 'P']).toContain(p.axis);
      expect(['R', 'B', 'Y', 'P']).toContain(p.child);
    }
  });
});

describe('getEsportQueue (memoized)', () => {
  it('returns same array reference for same seed', () => {
    const a = getEsportQueue(99);
    const b = getEsportQueue(99);
    expect(a).toBe(b);
  });
});
