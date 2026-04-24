import { HeuristicAI } from '../heuristic';
import type { GameState, Move } from '../../game/types';

const ai = new HeuristicAI();

self.onmessage = async (e: MessageEvent<{ id: number; state: GameState; topK: number }>) => {
  const { id, state, topK } = e.data;
  await ai.init();
  const moves = await ai.suggest(state, topK);
  (self as unknown as Worker).postMessage({ id, moves } as { id: number; moves: Move[] });
};
