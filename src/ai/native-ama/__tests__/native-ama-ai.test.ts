import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { NativeAmaAI } from '../native-ama-ai';

vi.mock('../tauri-bridge', () => ({
  isTauri: () => true,
  invokeAmaSuggest: vi.fn().mockResolvedValue({
    axisCol: 2,
    rotation: 0,
    score: 12345,
    expectedChain: 4,
  }),
}));

describe('NativeAmaAI', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });
  afterEach(() => {
    vi.resetModules();
  });

  it('isAvailable reflects isTauri()', () => {
    expect(NativeAmaAI.isAvailable()).toBe(true);
  });

  it('returns a single Move from suggestWithScores', async () => {
    const ai = new NativeAmaAI();
    const state = makeEmptyState();
    const r = await ai.suggestWithScores(state, 1);
    expect(r).toHaveLength(1);
    expect(r[0]?.axisCol).toBe(2);
    expect(r[0]?.expectedChain).toBe(4);
  });

  it('suggest() returns one Move conforming to PuyoAI', async () => {
    const ai = new NativeAmaAI();
    const state = makeEmptyState();
    const moves = await ai.suggest(state, 5);
    expect(moves).toHaveLength(1);
    expect(moves[0]?.axisCol).toBe(2);
    expect(moves[0]?.score).toBe(12345);
  });
});

function makeEmptyState() {
  return {
    // 14-row field; the AI bridge will skip the top row when encoding.
    field: { cells: Array.from({ length: 14 }, () => new Array(6).fill(null)) },
    current: { pair: { axis: 'R', child: 'B' } },
    nextQueue: [
      { axis: 'Y', child: 'P' },
      { axis: 'R', child: 'Y' },
    ],
    status: 'playing',
  } as never;
}
