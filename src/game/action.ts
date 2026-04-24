import type { ActivePair, Field, Move, Rotation } from './types';
import { reachableTargets } from './reachability';

export const ACTION_COUNT = 22;

export function moveToActionIndex(move: Move): number {
  const { axisCol, rotation } = move;
  if (!Number.isInteger(axisCol) || axisCol < 0 || axisCol > 5) {
    throw new Error(`invalid axisCol: ${axisCol}`);
  }
  if (rotation === 0) return axisCol;
  if (rotation === 2) return 6 + axisCol;
  if (rotation === 1) {
    if (axisCol < 0 || axisCol > 4) throw new Error(`rot=1 axisCol out of range: ${axisCol}`);
    return 12 + axisCol;
  }
  if (rotation === 3) {
    if (axisCol < 1 || axisCol > 5) throw new Error(`rot=3 axisCol out of range: ${axisCol}`);
    return 17 + axisCol - 1;
  }
  throw new Error(`invalid rotation: ${String(rotation)}`);
}

export function actionIndexToMove(index: number): Move {
  if (!Number.isInteger(index) || index < 0 || index >= ACTION_COUNT) {
    throw new Error(`invalid action index: ${index}`);
  }
  if (index < 6) return { axisCol: index, rotation: 0 as Rotation };
  if (index < 12) return { axisCol: index - 6, rotation: 2 as Rotation };
  if (index < 17) return { axisCol: index - 12, rotation: 1 as Rotation };
  return { axisCol: index - 17 + 1, rotation: 3 as Rotation };
}

export function legalActionMask(field: Field, start: ActivePair): Uint8Array {
  const reachable = reachableTargets(field, start);
  const mask = new Uint8Array(ACTION_COUNT);
  for (let i = 0; i < ACTION_COUNT; i++) {
    const { axisCol, rotation } = actionIndexToMove(i);
    if (reachable.has(`${axisCol}-${rotation}`)) mask[i] = 1;
  }
  return mask;
}
