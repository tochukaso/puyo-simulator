import { describe, it, expect } from 'vitest';
import { HeuristicAI } from '../heuristic';
import { createInitialState } from '../../game/state';

describe('HeuristicAI (placeholder)', () => {
  it('合法手の topK を返す', async () => {
    const ai = new HeuristicAI();
    await ai.init();
    const s = createInitialState(1);
    const moves = await ai.suggest(s, 5);
    expect(moves.length).toBe(5);
    expect(moves[0]!.axisCol).toBeGreaterThanOrEqual(0);
  });
});
