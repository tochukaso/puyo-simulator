import type { ActivePair, Field, GameState, Move } from './types';
import { canPlace } from './pair';
import { tryRotate } from './rotation';

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
