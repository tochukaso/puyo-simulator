import type { GameState, ActivePair, Pair, Move } from './types';
import { SPAWN_COL, SPAWN_AXIS_ROW, VISIBLE_ROW_START } from './constants';
import { createEmptyField } from './field';
import { getEsportQueue } from './rng';
import { resolveChain } from './chain';
import { lockActive } from './landing';
import { canPlace } from './pair';

const VISIBLE_QUEUE_SIZE = 5;

export function createInitialState(seed: number): GameState {
  const queue = getEsportQueue(seed);
  const first = queue[0]!;
  const nextQueue: Pair[] = [];
  for (let i = 1; i <= VISIBLE_QUEUE_SIZE; i++) nextQueue.push(queue[i]!);

  const active: ActivePair = {
    pair: first,
    axisRow: SPAWN_AXIS_ROW,
    axisCol: SPAWN_COL,
    rotation: 0,
  };

  return {
    field: createEmptyField(),
    current: active,
    nextQueue,
    score: 0,
    chainCount: 0,
    totalChains: 0,
    maxChain: 0,
    status: 'playing',
    rngSeed: seed,
    queueIndex: 1 + VISIBLE_QUEUE_SIZE,
  };
}

export function spawnNext(state: GameState): GameState {
  const queue = getEsportQueue(state.rngSeed);
  const nextPair = state.nextQueue[0]!;
  const newPair = queue[state.queueIndex % queue.length]!;
  const refilled = [...state.nextQueue.slice(1), newPair];

  const active: ActivePair = {
    pair: nextPair,
    axisRow: SPAWN_AXIS_ROW,
    axisCol: SPAWN_COL,
    rotation: 0,
  };

  // 「バツマーク」 game-over: standard Puyo Puyo Tsu fires gameover the moment
  // a puyo settles in the death cell — the topmost visible cell of SPAWN_COL
  // (12段目, 3 列目). canPlace alone wouldn't catch this in our 14-row model
  // because the spawn position sits one row above the death cell, so the new
  // pair could still spawn even with the death cell occupied.
  const deathCellOccupied =
    state.field.cells[VISIBLE_ROW_START]![SPAWN_COL]! !== null;

  if (deathCellOccupied || !canPlace(state.field, active)) {
    return {
      ...state,
      current: null,
      nextQueue: refilled,
      status: 'gameover',
      queueIndex: state.queueIndex + 1,
    };
  }

  return {
    ...state,
    current: active,
    nextQueue: refilled,
    status: 'playing',
    queueIndex: state.queueIndex + 1,
  };
}

export function commitMove(state: GameState, move: Move): GameState {
  if (!state.current) return state;
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
