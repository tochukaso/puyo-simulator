import type { PuyoAI } from '../types';
import type { GameState, Move } from '../../game/types';
import { enumerateLegalMoves } from '../../game/moves';
import { commitMove } from '../../game/state';
import { evaluateField, DEFAULT_WEIGHTS, type Weights } from './evaluator';

export class HeuristicAI implements PuyoAI {
  readonly name = 'heuristic';
  readonly version = '1.0';
  private weights: Weights;

  constructor(weights: Weights = DEFAULT_WEIGHTS) {
    this.weights = weights;
  }

  async init() {}

  async suggest(state: GameState, topK: number): Promise<Move[]> {
    const legal = enumerateLegalMoves(state);
    const scored: Move[] = legal.map((m) => {
      const afterState = commitMove(state, m);
      const score = evaluateField(afterState.field, this.weights)
        + afterState.score - state.score;
      return { ...m, score };
    });
    scored.sort((a, b) => (b.score ?? 0) - (a.score ?? 0));
    return scored.slice(0, topK);
  }
}
