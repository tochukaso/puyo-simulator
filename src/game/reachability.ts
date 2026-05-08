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
 * 「その move を commit したときに 盤面に少なくとも 1 ぷよ着地するか」 を判定。
 * 両方 discard される 「turn だけ消費する pure no-op」 だけを弾き、 片方 discard
 * (= 本家ぷよぷよ通の 「捨てぷよ」 テクニック) は許可する。 ama (native / wasm)
 * も同じ閾値で legal を判定する — ここを 「2 ぷよ全部着地必須」 に締めると
 * ama 推奨手が enumerate に存在せず AI Best / 手動 Drop が silent fail する。
 *
 * 弾かれる例 (両方 discard):
 *   - 13段目封印列 (heights[col]=13) に縦置き
 *   - 全列封印盤面で任意配置
 *
 * 通る例 (片方 discard):
 *   - 横置きで axis or child の一方が封印列に重なる (もう一方は空き列に着地)
 *   - 縦置きで child が 14段目 ghost wall を越える sutepuyo
 *
 * isMoveReachable 単独では floor kick で全 discard 位置まで geometric に届くので
 * productivity を別軸で残しておく必要がある。
 */
export function isMoveProductive(state: GameState, move: Move): boolean {
  if (!state.current) return false;
  const placed = {
    ...state.current,
    axisCol: move.axisCol,
    rotation: move.rotation,
  };
  const after = lockActive(state.field, placed);
  // lockActive は既存セルを消さず新規追加のみ。 1 ぷよでも盤面に乗れば
  // どこかのセルが non-null に変わる → 最初の差分を見つけた時点で確定。
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
