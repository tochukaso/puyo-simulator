import type { PuyoAI } from '../types';
import type { GameState, Move } from '../../game/types';
import { enumerateLegalMoves } from '../../game/moves';
import { commitMove } from '../../game/state';
import { evaluateFieldBreakdown, DEFAULT_WEIGHTS, type Weights } from './evaluator';

// 3連鎖未満の小発火は「もったいない」扱いにしてスコア寄与を弱める係数。
// これで目先のぷよ消しより、建設を優先する。
const SMALL_CHAIN_DAMPING = 0.1;
const BIG_CHAIN_THRESHOLD = 3;

export class HeuristicAI implements PuyoAI {
  readonly name = 'heuristic';
  readonly version = '1.1';
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
      const chainCount = afterState.chainCount;
      const chainScore =
        chainCount >= BIG_CHAIN_THRESHOLD ? chainGain : chainGain * SMALL_CHAIN_DAMPING;
      const breakdown = evaluateFieldBreakdown(afterState.field, this.weights);
      const total = breakdown.total + chainScore;
      const reason = describeReason(breakdown, chainGain, chainCount);
      return { ...m, score: total, reason };
    });
    scored.sort((a, b) => (b.score ?? 0) - (a.score ?? 0));
    return scored.slice(0, topK);
  }
}

function describeReason(
  b: { chainPotential: number; heightBalance: number; danger: number; connection: number },
  chainGain: number,
  chainCount: number,
): string {
  if (chainCount >= BIG_CHAIN_THRESHOLD) {
    return `${chainCount}連鎖(${Math.round(chainGain).toLocaleString()}点)を発火`;
  }
  if (chainCount > 0) {
    return `${chainCount}連鎖は温存、建設を優先`;
  }
  const entries = [
    { k: '連鎖の種を伸ばす', v: b.chainPotential },
    { k: '形を保つ', v: -b.heightBalance },
    { k: '3列目の危険を下げる', v: -b.danger },
    { k: '連結を増やす', v: b.connection },
  ];
  entries.sort((a, b) => b.v - a.v);
  return entries[0]!.k;
}
