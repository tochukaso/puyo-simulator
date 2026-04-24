import type { GameState, Move } from '../../game/types';
import { enumerateLegalMoves } from '../../game/moves';
import { commitMove } from '../../game/state';
import { evaluateFieldBreakdown, type Weights, type EvalBreakdown } from './evaluator';

export const SMALL_CHAIN_DAMPING = 0.1;
export const BIG_CHAIN_THRESHOLD = 3;

function dampChainGain(chainGain: number, chainCount: number): number {
  return chainCount >= BIG_CHAIN_THRESHOLD ? chainGain : chainGain * SMALL_CHAIN_DAMPING;
}

export interface SearchResult {
  rootMove: Move;
  value: number;
  depth: number;
  rootBreakdown: EvalBreakdown;
  rootChainGain: number;
  rootChainCount: number;
  maxChainOnPath: number;
}

interface Node {
  rootMove: Move;
  rootBreakdown: EvalBreakdown;
  rootChainGain: number;
  rootChainCount: number;
  state: GameState;
  pathChainValue: number;
  maxChainOnPath: number;
  nodeValue: number;
}

// depth 先まで、既知の nextQueue を使って beam search で評価する。
// 各ノードの価値 = `evaluateField(final state)` + Σ 経路上の連鎖獲得点(小連鎖はダンプ)
// これで「今小さく発火」より「N手かけて大連鎖を仕込む」経路を優先できる。
export function beamSearch(
  initial: GameState,
  weights: Weights,
  depth: number,
  beamWidth: number,
): SearchResult[] {
  const legal = enumerateLegalMoves(initial);
  if (legal.length === 0) return [];

  const initialScore = initial.score;

  // Depth 1: current tsumo の全合法手を展開
  let frontier: Node[] = legal.map((m) => {
    const next = commitMove(initial, m);
    const chainGain = next.score - initialScore;
    const chainCount = next.chainCount;
    const damped = dampChainGain(chainGain, chainCount);
    const breakdown = evaluateFieldBreakdown(next.field, weights);
    return {
      rootMove: m,
      rootBreakdown: breakdown,
      rootChainGain: chainGain,
      rootChainCount: chainCount,
      state: next,
      pathChainValue: damped,
      maxChainOnPath: chainCount,
      nodeValue: breakdown.total + damped,
    };
  });

  // ルート手ごとに「その手を選んだ場合の最良経路の価値」を残す。
  // UI は各ルート手のベスト経路値を使って上位候補を並べる。
  const bestByRoot = new Map<string, Node>();
  const rootKey = (m: Move) => `${m.axisCol}-${m.rotation}`;
  const updateBest = (n: Node) => {
    const k = rootKey(n.rootMove);
    const existing = bestByRoot.get(k);
    if (!existing || n.nodeValue > existing.nodeValue) bestByRoot.set(k, n);
  };
  frontier.forEach(updateBest);

  for (let d = 2; d <= depth; d++) {
    // Beam 幅でプルーニング
    frontier.sort((a, b) => b.nodeValue - a.nodeValue);
    const beam = frontier.slice(0, beamWidth);

    const nextFrontier: Node[] = [];
    for (const n of beam) {
      if (n.state.status === 'gameover' || !n.state.current) {
        // 終端ノード。そのまま残す。
        nextFrontier.push(n);
        continue;
      }
      const moves = enumerateLegalMoves(n.state);
      for (const m of moves) {
        const ns = commitMove(n.state, m);
        const chainGain = ns.score - n.state.score;
        const chainCount = ns.chainCount;
        const damped = dampChainGain(chainGain, chainCount);
        const newPathChainValue = n.pathChainValue + damped;
        const breakdown = evaluateFieldBreakdown(ns.field, weights);
        nextFrontier.push({
          rootMove: n.rootMove,
          rootBreakdown: n.rootBreakdown,
          rootChainGain: n.rootChainGain,
          rootChainCount: n.rootChainCount,
          state: ns,
          pathChainValue: newPathChainValue,
          maxChainOnPath: Math.max(n.maxChainOnPath, chainCount),
          nodeValue: breakdown.total + newPathChainValue,
        });
      }
    }
    frontier = nextFrontier;
    frontier.forEach(updateBest);
  }

  return Array.from(bestByRoot.values())
    .map(
      (n): SearchResult => ({
        rootMove: n.rootMove,
        value: n.nodeValue,
        depth,
        rootBreakdown: n.rootBreakdown,
        rootChainGain: n.rootChainGain,
        rootChainCount: n.rootChainCount,
        maxChainOnPath: n.maxChainOnPath,
      }),
    )
    .sort((a, b) => b.value - a.value);
}
