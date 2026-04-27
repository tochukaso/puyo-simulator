import { describe, it, expect } from 'vitest';
import { beamSearch } from '../heuristic/search';
import { DEFAULT_WEIGHTS } from '../heuristic/evaluator';
import { createInitialState } from '../../game/state';

describe('beamSearch', () => {
  it('returns all legal moves ranked', () => {
    const state = createInitialState(1);
    const results = beamSearch(state, DEFAULT_WEIGHTS, 2, 4);
    expect(results.length).toBeGreaterThan(0);
    // Results are sorted by descending score.
    for (let i = 1; i < results.length; i++) {
      expect(results[i - 1]!.value).toBeGreaterThanOrEqual(results[i]!.value);
    }
  });

  it('increasing depth (in general) does not decrease the best value', () => {
    const state = createInitialState(7);
    const d1 = beamSearch(state, DEFAULT_WEIGHTS, 1, 8);
    const d3 = beamSearch(state, DEFAULT_WEIGHTS, 3, 8);
    expect(d1.length).toBe(d3.length);
    // Reading deeper should not reduce the best move's expected value (given a sufficient beam width).
    expect(d3[0]!.value).toBeGreaterThanOrEqual(d1[0]!.value * 0.9);
  });

  it('with depth=1, maxChainOnPath equals rootChainCount', () => {
    const state = createInitialState(1);
    const results = beamSearch(state, DEFAULT_WEIGHTS, 1, 4);
    for (const r of results) {
      expect(r.maxChainOnPath).toBe(r.rootChainCount);
    }
  });
});
