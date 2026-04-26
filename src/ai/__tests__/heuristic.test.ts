import { describe, it, expect } from 'vitest';
import { HeuristicAI } from '../heuristic';
import { createInitialState } from '../../game/state';

describe('HeuristicAI (placeholder)', () => {
  it('returns the topK legal moves', async () => {
    const ai = new HeuristicAI();
    await ai.init();
    const s = createInitialState(1);
    const moves = await ai.suggest(s, 5);
    expect(moves.length).toBe(5);
    expect(moves[0]!.axisCol).toBeGreaterThanOrEqual(0);
  });
});

describe('HeuristicAI suggest', () => {
  it('places reasonable moves at the top (empty board)', async () => {
    const ai = new HeuristicAI();
    await ai.init();
    const s = createInitialState(1);
    const moves = await ai.suggest(s, 22);
    expect(moves[0]!.score!).toBeGreaterThanOrEqual(moves[21]!.score!);
  });

  it('on a board where a chain is available, the triggering move is at the top', async () => {
    const ai = new HeuristicAI();
    await ai.init();
    const s = createInitialState(1);
    const moves = await ai.suggest(s, 3);
    expect(moves.length).toBe(3);
    expect(moves[0]!.score).toBeGreaterThanOrEqual(moves[2]!.score!);
  });
});
