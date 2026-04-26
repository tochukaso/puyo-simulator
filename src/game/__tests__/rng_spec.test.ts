import { describe, it, expect } from 'vitest';
import { getEsportQueue } from '../rng';
import spec from '../../shared/specs/rng_spec.json';
import type { Color } from '../types';

describe('rng_spec.json', () => {
  it('has 5 cases', () => {
    expect(spec.cases.length).toBe(5);
  });

  it('each case matches getEsportQueue output', () => {
    for (const c of spec.cases) {
      const q = getEsportQueue(c.seed);
      const first8 = q.slice(0, 8).map((p) => ({ axis: p.axis as Color, child: p.child as Color }));
      expect(first8).toEqual(c.first8);
    }
  });
});
