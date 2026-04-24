import type { PuyoAI } from '../types';
import type { GameState, Move } from '../../game/types';
import { enumerateLegalMoves } from '../../game/moves';

export class HeuristicAI implements PuyoAI {
  readonly name = 'heuristic';
  readonly version = '0.1';

  async init() {}

  async suggest(state: GameState, topK: number): Promise<Move[]> {
    const legal = enumerateLegalMoves(state);
    const scored = legal.map((m) => ({ ...m, score: 0, reason: '' }));
    return scored.slice(0, topK);
  }
}
