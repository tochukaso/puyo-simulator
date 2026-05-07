import type { GameState, ActivePair, Input, Move, Rotation } from './types';
import { COLS } from './constants';
import { canPlace, childOffset } from './pair';
import { tryRotate } from './rotation';
import { lockActive } from './landing';
import { isMoveProductive, reachableTargets } from './reachability';

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

// 本家準拠の合法手列挙: (col, rotation) が
//   reachable (= BFS で実際に辿れる経路がある) かつ
//   productive (= lockActive で 2 マス追加され、 軸/子の両方が着地する)
// な move のみを返す。 reachable 単独だと floor kick で row 0 col=sealed
// まで届く 「届くが no-op」 なケースを許してしまい、 ama の `move::generate`
// と diverge する (= 「捨てぷよ無限」 体感バグの原因)。 productive は
// 「1 つでも discard されたら不可」 の本家挙動 (ama は `is_valid` で同等
// 判定) に揃えてある。
export function enumerateLegalMoves(state: GameState): Move[] {
  if (!state.current) return [];
  const reachable = reachableTargets(state.field, state.current);
  const out: Move[] = [];
  for (let col = 0; col < COLS; col++) {
    for (const rot of [0, 1, 2, 3] as Rotation[]) {
      const [, dc] = childOffset(rot);
      const childCol = col + dc;
      if (childCol < 0 || childCol >= COLS) continue;
      if (!reachable.has(`${col}-${rot}`)) continue;
      if (!isMoveProductive(state, { axisCol: col, rotation: rot })) continue;
      out.push({ axisCol: col, rotation: rot });
    }
  }
  return out;
}
