import type { GameState, ActivePair, Input } from './types';
import { canPlace } from './pair';
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
