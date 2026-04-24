import type { PuyoAI } from '../types';
import type { GameState, Move } from '../../game/types';
import { DEFAULT_WEIGHTS, type EvalBreakdown, type Weights } from './evaluator';
import { beamSearch, BIG_CHAIN_THRESHOLD } from './search';

// 3手先まで読む。NEXT と NEXT-NEXT は既知、3手目の現行は seeded RNG で確定。
const SEARCH_DEPTH = 3;
// Beam 幅。各 depth で上位 N ノードだけ展開して計算量を抑える。
const BEAM_WIDTH = 8;

export class HeuristicAI implements PuyoAI {
  readonly name = 'heuristic';
  readonly version = '1.2';
  private weights: Weights;

  constructor(weights: Weights = DEFAULT_WEIGHTS) {
    this.weights = weights;
  }

  async init() {}

  async suggest(state: GameState, topK: number): Promise<Move[]> {
    const results = beamSearch(state, this.weights, SEARCH_DEPTH, BEAM_WIDTH);
    const scored: Move[] = results.map((r) => ({
      axisCol: r.rootMove.axisCol,
      rotation: r.rootMove.rotation,
      score: r.value,
      reason: describeReason(r.rootBreakdown, r.rootChainGain, r.rootChainCount, r.maxChainOnPath),
    }));
    return scored.slice(0, topK);
  }
}

function describeReason(
  b: EvalBreakdown,
  chainGain: number,
  chainCount: number,
  maxChainOnPath: number,
): string {
  if (chainCount >= BIG_CHAIN_THRESHOLD) {
    return `${chainCount}連鎖(${Math.round(chainGain).toLocaleString()}点)を発火`;
  }
  if (maxChainOnPath >= BIG_CHAIN_THRESHOLD) {
    return `${maxChainOnPath}連鎖の種を仕込む(${maxChainOnPath}手後に発火が見える)`;
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
