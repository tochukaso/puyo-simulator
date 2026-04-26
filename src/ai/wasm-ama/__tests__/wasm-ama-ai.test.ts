import { describe, it, expect, beforeAll } from 'vitest';
import { WasmAmaAI } from '../wasm-ama-ai';
import { createInitialState } from '../../../game/state';

describe('WasmAmaAI', () => {
  const ai = new WasmAmaAI();

  beforeAll(async () => {
    await ai.init();
  }, 30_000);

  it(
    'returns top-K moves for an empty board',
    async () => {
      const state = createInitialState(7777);
      const moves = await ai.suggest(state, 5);
      expect(moves.length).toBeGreaterThan(0);
      expect(moves.length).toBeLessThanOrEqual(5);
      for (const m of moves) {
        expect(m.axisCol).toBeGreaterThanOrEqual(0);
        expect(m.axisCol).toBeLessThanOrEqual(5);
        expect(m.rotation).toBeGreaterThanOrEqual(0);
        expect(m.rotation).toBeLessThanOrEqual(3);
      }
    },
    20_000,
  );

  it(
    'suggestWithScores returns AmaCandidate with score',
    async () => {
      const state = createInitialState(42);
      const cands = await ai.suggestWithScores(state, 3);
      expect(cands.length).toBeGreaterThan(0);
      expect(typeof cands[0]!.score).toBe('number');
      expect(cands[0]!.expectedChain).toBeGreaterThanOrEqual(0);
    },
    20_000,
  );
});
