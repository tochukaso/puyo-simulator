import type { GameState, ActivePair, Pair, Move } from './types';
import { SPAWN_COL } from './constants';
import { createEmptyField } from './field';
import { makeRng, randomPair } from './rng';
import { resolveChain } from './chain';
import { lockActive } from './landing';
import { canPlace } from './pair';

const QUEUE_SIZE = 5;

export function createInitialState(seed: number): GameState {
  const rng = makeRng(seed);
  const queue: Pair[] = Array.from({ length: QUEUE_SIZE + 1 }, () => randomPair(rng));
  const first = queue.shift()!;

  const active: ActivePair = {
    pair: first,
    axisRow: 0,
    axisCol: SPAWN_COL,
    rotation: 0,
  };

  return {
    field: createEmptyField(),
    current: active,
    nextQueue: queue,
    score: 0,
    chainCount: 0,
    totalChains: 0,
    status: 'playing',
    rngSeed: rng.next() * 0xffffffff | 0,
  };
}

export function spawnNext(state: GameState): GameState {
  const rng = makeRng(state.rngSeed);
  const nextPair = state.nextQueue[0]!;
  const refilled = [...state.nextQueue.slice(1), randomPair(rng)];

  const active: ActivePair = {
    pair: nextPair,
    axisRow: 0,
    axisCol: SPAWN_COL,
    rotation: 0,
  };

  if (!canPlace(state.field, active)) {
    return { ...state, current: null, nextQueue: refilled, status: 'gameover', rngSeed: rng.next() * 0xffffffff | 0 };
  }

  return {
    ...state,
    current: active,
    nextQueue: refilled,
    status: 'playing',
    rngSeed: rng.next() * 0xffffffff | 0,
  };
}

export function commitMove(state: GameState, move: Move): GameState {
  if (!state.current) return state;

  const placed: ActivePair = {
    ...state.current,
    axisCol: move.axisCol,
    rotation: move.rotation,
  };
  if (!canPlace(state.field, placed)) return state;

  const locked = lockActive(state.field, placed);

  const { finalField, steps, totalScore } = resolveChain(locked);

  const resolvedState: GameState = {
    ...state,
    field: finalField,
    current: null,
    score: state.score + totalScore,
    chainCount: steps.length,
    totalChains: state.totalChains + steps.length,
    status: 'resolving',
  };
  return spawnNext(resolvedState);
}
