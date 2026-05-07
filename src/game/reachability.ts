import type { ActivePair, Field, GameState, Move } from './types';
import { ROWS, COLS } from './constants';
import { canPlace } from './pair';
import { tryRotate } from './rotation';
import { lockActive } from './landing';

const stateKey = (p: ActivePair): string => `${p.axisRow},${p.axisCol},${p.rotation}`;
const targetKey = (col: number, rot: number): string => `${col}-${rot}`;

/**
 * BFS over the set of (axisCol, rotation) targets reachable from `start` using
 * only moveLeft / moveRight / softDrop / rotateCW / rotateCCW. Keys are
 * formatted as "col-rot".
 *
 * This rules out physically impossible moves like "cross over a puyo in the
 * ceiling row to reach another column".
 */
export function reachableTargets(field: Field, start: ActivePair): Set<string> {
  const visited = new Set<string>();
  const targets = new Set<string>();

  const stack: ActivePair[] = [start];
  visited.add(stateKey(start));
  targets.add(targetKey(start.axisCol, start.rotation));

  while (stack.length > 0) {
    const cur = stack.pop()!;

    const candidates: ActivePair[] = [];
    const left: ActivePair = { ...cur, axisCol: cur.axisCol - 1 };
    if (canPlace(field, left)) candidates.push(left);
    const right: ActivePair = { ...cur, axisCol: cur.axisCol + 1 };
    if (canPlace(field, right)) candidates.push(right);
    const down: ActivePair = { ...cur, axisRow: cur.axisRow + 1 };
    if (canPlace(field, down)) candidates.push(down);
    const cw = tryRotate(field, cur, 'cw');
    if (cw) candidates.push(cw);
    const ccw = tryRotate(field, cur, 'ccw');
    if (ccw) candidates.push(ccw);

    for (const n of candidates) {
      const k = stateKey(n);
      if (visited.has(k)) continue;
      visited.add(k);
      targets.add(targetKey(n.axisCol, n.rotation));
      stack.push(n);
    }
  }
  return targets;
}

export function isMoveReachable(state: GameState, move: Move): boolean {
  if (!state.current) return false;
  const targets = reachableTargets(state.field, state.current);
  return targets.has(targetKey(move.axisCol, move.rotation));
}

/**
 * 「その move を commit したときに、 盤面に 1 マス以上ぷよが増えるか」 を
 * チェックする。 13段目封印列に axisCol=その列, rotation=0/2 で投げると
 * axis も child も lockActive 内で discard されて盤面が変わらない (= 「無限
 * 捨てぷよ」 で turn だけ消費する体感バグの原因)。 isMoveReachable 単独では
 * floor kick 経由で row 0 col=sealed が geometric に到達可能と判定されるので、
 * productivity を別軸でチェックする必要がある。
 */
export function isMoveProductive(state: GameState, move: Move): boolean {
  if (!state.current) return false;
  const placed = {
    ...state.current,
    axisCol: move.axisCol,
    rotation: move.rotation,
  };
  const after = lockActive(state.field, placed);
  // 1 セル以上 diff があれば productive。 lockActive は新規セルを追加 only
  // (既存を消さない) なので、 「after !== before」 = 「1 セル以上追加された」
  // と等価。
  for (let r = 0; r < ROWS; r++) {
    const a = after.cells[r];
    const b = state.field.cells[r];
    for (let c = 0; c < COLS; c++) {
      if (a![c] !== b![c]) return true;
    }
  }
  return false;
}

/**
 * 本家挙動準拠の「実際に commit してよい move か」 を判定。
 *   reachable (=ジェスチャー経路で辿れる) && productive (=盤面に変化を生む)。
 * store.commit / gestures preview のゲートに使う。
 */
export function isMoveValid(state: GameState, move: Move): boolean {
  return isMoveReachable(state, move) && isMoveProductive(state, move);
}
