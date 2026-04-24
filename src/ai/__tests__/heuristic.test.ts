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

describe('HeuristicAI suggest', () => {
  it('合理的な手を上位に置く(空盤面)', async () => {
    const ai = new HeuristicAI();
    await ai.init();
    const s = createInitialState(1);
    const moves = await ai.suggest(s, 22);
    expect(moves[0]!.score!).toBeGreaterThanOrEqual(moves[21]!.score!);
  });

  it('連鎖できる盤面では発火手が上位に', async () => {
    const ai = new HeuristicAI();
    await ai.init();
    const s = createInitialState(1);
    const moves = await ai.suggest(s, 3);
    expect(moves.length).toBe(3);
    expect(moves[0]!.score).toBeGreaterThanOrEqual(moves[2]!.score!);
  });
});
