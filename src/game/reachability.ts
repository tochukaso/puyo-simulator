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
 * 「その move を commit したときに、 軸 / 子のどちらも 14段目で discard
 * されず、 盤面に 2 ぷよ全部が着地するか」 を判定する。 ama の本家
 * `move::generate` と同じ厳しさで、 1 つでも discard されると false。
 *
 * 13段目封印列 (heights[col]=13) に縦置き → 両方 discard、
 * 横置きで axis or child のどちらかが封印列に重なる → 片方 discard、
 * いずれも turn だけ消費する no-op なので reject。
 *
 * (関数名は歴史的に 「productive」 だが意味は 「lossless = 全ぷよ着地」 に
 * 近い。 isMoveReachable 単独では floor kick で row 0 col=sealed が
 * geometric に到達可能と判定されてしまうため、 productivity を別軸で
 * チェックする必要がある。)
 */
export function isMoveProductive(state: GameState, move: Move): boolean {
  if (!state.current) return false;
  const placed = {
    ...state.current,
    axisCol: move.axisCol,
    rotation: move.rotation,
  };
  const after = lockActive(state.field, placed);
  // lockActive は既存セルを消さず新規追加のみ。 ペアは 2 ぷよなので、
  // discard が 0 なら after には 2 セル追加されている。 1 個でも discard
  // されれば +1 セル、 両方 discard で +0 セル。
  let added = 0;
  for (let r = 0; r < ROWS; r++) {
    const a = after.cells[r];
    const b = state.field.cells[r];
    for (let c = 0; c < COLS; c++) {
      if (a![c] !== b![c]) added++;
    }
  }
  return added === 2;
}

/**
 * 本家挙動準拠の「実際に commit してよい move か」 を判定。
 *   reachable (=ジェスチャー経路で辿れる) && productive (=盤面に変化を生む)。
 * store.commit / gestures preview のゲートに使う。
 */
export function isMoveValid(state: GameState, move: Move): boolean {
  return isMoveReachable(state, move) && isMoveProductive(state, move);
}
