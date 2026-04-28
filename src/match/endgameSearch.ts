// Brute-force endgame move search. Used in the final few turns of a match,
// where the WASM ama (which optimizes for building potential) is not the
// right scorer — we want the move that actually banks the most score now.
//
// At depth=1: enumerate every (axisCol, rotation) for the current pair,
//             score each by the immediate chain points from playing it.
// At depth>1: recurse on the resulting state with the next pair, taking
//             the best score over the sub-tree.
//
// "Score" is the chain points produced by the placement; the final state's
// `score` field already accumulates this via commitMove + resolveChain.

import type { GameState, Move, Rotation, ActivePair } from '../game/types';
import { lockActive } from '../game/landing';
import { resolveChain } from '../game/chain';
import { canPlace } from '../game/pair';
import { spawnNext } from '../game/state';

const ROTATIONS: Rotation[] = [0, 1, 2, 3];

function applyMoveSync(state: GameState, move: Move): GameState | null {
  if (!state.current) return null;
  const placed: ActivePair = {
    ...state.current,
    axisCol: move.axisCol,
    rotation: move.rotation,
  };
  if (!canPlace(state.field, placed)) return null;
  const locked = lockActive(state.field, placed);
  const { finalField, steps, totalScore } = resolveChain(locked);
  const resolved: GameState = {
    ...state,
    field: finalField,
    current: null,
    score: state.score + totalScore,
    chainCount: steps.length,
    totalChains: state.totalChains + steps.length,
    maxChain: Math.max(state.maxChain, steps.length),
    status: 'resolving',
  };
  return spawnNext(resolved);
}

// All (axisCol, rotation) candidates that don't immediately collide with the
// field/walls. Returns at most ~22 moves.
export function enumeratePlacements(state: GameState): Move[] {
  if (!state.current) return [];
  const out: Move[] = [];
  for (let ac = 0; ac < 6; ac++) {
    for (const rot of ROTATIONS) {
      const trial: ActivePair = {
        ...state.current,
        axisCol: ac,
        rotation: rot,
      };
      if (canPlace(state.field, trial)) out.push({ axisCol: ac, rotation: rot });
    }
  }
  return out;
}

// Returns { move, score } where `score` is the highest reachable total score
// from this state by playing `depth` pairs (1 = just the current pair).
// `depth` is clamped to remaining lookahead capacity (current + nextQueue).
export function searchEndgameMove(
  state: GameState,
  depth: number,
): { move: Move | null; score: number } {
  if (depth <= 0 || !state.current) return { move: null, score: state.score };

  const placements = enumeratePlacements(state);
  if (placements.length === 0) return { move: null, score: state.score };

  let bestScore = -Infinity;
  let bestMove: Move | null = null;
  for (const m of placements) {
    const next = applyMoveSync(state, m);
    if (!next) continue;
    const reached =
      depth > 1 && next.current
        ? searchEndgameMove(next, depth - 1).score
        : next.score;
    if (reached > bestScore) {
      bestScore = reached;
      bestMove = m;
    }
  }

  return { move: bestMove ?? placements[0]!, score: bestScore };
}
