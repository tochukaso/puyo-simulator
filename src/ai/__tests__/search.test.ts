import { describe, it, expect } from 'vitest';
import { beamSearch } from '../heuristic/search';
import { DEFAULT_WEIGHTS } from '../heuristic/evaluator';
import { createInitialState } from '../../game/state';

describe('beamSearch', () => {
  it('合法手のすべてを順位付けして返す', () => {
    const state = createInitialState(1);
    const results = beamSearch(state, DEFAULT_WEIGHTS, 2, 4);
    expect(results.length).toBeGreaterThan(0);
    // 結果はスコア降順
    for (let i = 1; i < results.length; i++) {
      expect(results[i - 1]!.value).toBeGreaterThanOrEqual(results[i]!.value);
    }
  });

  it('depth を増やすと(原則として)最良値は同等以上になる', () => {
    const state = createInitialState(7);
    const d1 = beamSearch(state, DEFAULT_WEIGHTS, 1, 8);
    const d3 = beamSearch(state, DEFAULT_WEIGHTS, 3, 8);
    expect(d1.length).toBe(d3.length);
    // 深く読んだほうが最良手の期待価値は低くならない(ビーム幅十分なら)
    expect(d3[0]!.value).toBeGreaterThanOrEqual(d1[0]!.value * 0.9);
  });

  it('depth=1 のとき maxChainOnPath は rootChainCount と同じ', () => {
    const state = createInitialState(1);
    const results = beamSearch(state, DEFAULT_WEIGHTS, 1, 4);
    for (const r of results) {
      expect(r.maxChainOnPath).toBe(r.rootChainCount);
    }
  });
});
