import type { GameState, ActivePair, Input, Move, Rotation } from './types';
import { COLS } from './constants';
import { canPlace, childOffset } from './pair';
import { tryRotate } from './rotation';
import { lockActive } from './landing';

export function applyInput(state: GameState, input: Input): GameState {
  if (state.status !== 'playing' || !state.current) return state;
  const c = state.current;

  switch (input.type) {
    case 'moveLeft': {
      const next: ActivePair = { ...c, axisCol: c.axisCol - 1 };
      return canPlace(state.field, next) ? { ...state, current: next } : state;
    }
    case 'moveRight': {
      const next: ActivePair = { ...c, axisCol: c.axisCol + 1 };
      return canPlace(state.field, next) ? { ...state, current: next } : state;
    }
    case 'rotateCW': {
      const rotated = tryRotate(state.field, c, 'cw');
      return rotated ? { ...state, current: rotated } : state;
    }
    case 'rotateCCW': {
      const rotated = tryRotate(state.field, c, 'ccw');
      return rotated ? { ...state, current: rotated } : state;
    }
    case 'hardDrop': {
      const locked = lockActive(state.field, c);
      return { ...state, field: locked, current: null, status: 'resolving' };
    }
    case 'softDrop': {
      const next: ActivePair = { ...c, axisRow: c.axisRow + 1 };
      return canPlace(state.field, next) ? { ...state, current: next } : state;
    }
  }
}

export function enumerateLegalMoves(state: GameState): Move[] {
  if (!state.current) return [];
  const out: Move[] = [];
  for (let col = 0; col < COLS; col++) {
    for (const rot of [0, 1, 2, 3] as Rotation[]) {
      const [, dc] = childOffset(rot);
      const childCol = col + dc;
      if (childCol < 0 || childCol >= COLS) continue;
      out.push({ axisCol: col, rotation: rot });
    }
  }
  return out;
}
