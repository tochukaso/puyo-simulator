import type { PuyoAI } from '../types';
import type { GameState, Move } from '../../game/types';
import { enumerateLegalMoves } from '../../game/moves';
import { commitMove } from '../../game/state';
import { evaluateFieldBreakdown, DEFAULT_WEIGHTS, type Weights } from './evaluator';

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
      const chainGain = afterState.score - state.score;
      const breakdown = evaluateFieldBreakdown(afterState.field, this.weights);
      const total = breakdown.total + chainGain;
      const reason = describeReason(breakdown, chainGain);
      return { ...m, score: total, reason };
    });
    scored.sort((a, b) => (b.score ?? 0) - (a.score ?? 0));
    return scored.slice(0, topK);
  }
}

function describeReason(b: { chainPotential: number; heightBalance: number; danger: number; connection: number }, chainGain: number): string {
  if (chainGain > 0) return `${Math.round(chainGain).toLocaleString()}点の連鎖を発火`;
  const entries = [
    { k: '連鎖の種を伸ばす', v: b.chainPotential },
    { k: '形を保つ', v: -b.heightBalance },
    { k: '3列目の危険を下げる', v: -b.danger },
    { k: '連結を増やす', v: b.connection },
  ];
  entries.sort((a, b) => b.v - a.v);
  return entries[0]!.k;
}
