import type { GameState, ActivePair, Pair, Move } from './types';
import { SPAWN_COL, SPAWN_AXIS_ROW } from './constants';
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
    axisRow: SPAWN_AXIS_ROW,
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
    maxChain: 0,
    status: 'playing',
    rngSeed: (rng.next() * 0xffffffff) | 0,
  };
}

export function spawnNext(state: GameState): GameState {
  const rng = makeRng(state.rngSeed);
  const nextPair = state.nextQueue[0]!;
  const refilled = [...state.nextQueue.slice(1), randomPair(rng)];

  const active: ActivePair = {
    pair: nextPair,
    axisRow: SPAWN_AXIS_ROW,
    axisCol: SPAWN_COL,
    rotation: 0,
  };

  if (!canPlace(state.field, active)) {
    return {
      ...state,
      current: null,
      nextQueue: refilled,
      status: 'gameover',
      rngSeed: (rng.next() * 0xffffffff) | 0,
    };
  }

  return {
    ...state,
    current: active,
    nextQueue: refilled,
    status: 'playing',
    rngSeed: (rng.next() * 0xffffffff) | 0,
  };
}

export function commitMove(state: GameState, move: Move): GameState {
  if (!state.current) return state;

  // lockActive は軸・子それぞれを「その列の最下空マス」に落とすので、
  // 入力 ActivePair の axisRow の値は結果に影響しない。
  // canPlace 判定は省く(AI 側の enumerateLegalMoves がすでに到達可能性を
  // フィルタしているため、ここに来る時点で有効な手)。
  const placed: ActivePair = {
    ...state.current,
    axisCol: move.axisCol,
    rotation: move.rotation,
  };

  const locked = lockActive(state.field, placed);

  const { finalField, steps, totalScore } = resolveChain(locked);

  const resolvedState: GameState = {
    ...state,
    field: finalField,
    current: null,
    score: state.score + totalScore,
    chainCount: steps.length,
    totalChains: state.totalChains + steps.length,
    maxChain: Math.max(state.maxChain, steps.length),
    status: 'resolving',
  };
  return spawnNext(resolvedState);
}
