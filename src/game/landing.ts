import { ROWS, AI_ROW_OFFSET } from './constants';
import type { ActivePair, Field } from './types';
import { pairCells } from './pair';
import { withCell } from './field';

export function dropDistance(field: Field, active: ActivePair): number {
  let d = 0;
  while (true) {
    const next: ActivePair = { ...active, axisRow: active.axisRow + d + 1 };
    if (!canLand(field, next)) break;
    d++;
  }
  return active.axisRow + d;
}

function canLand(field: Field, active: ActivePair): boolean {
  const { axisPos, childPos } = pairCells(active);
  for (const p of [axisPos, childPos]) {
    if (p.row < 0) continue;
    if (p.row >= ROWS) return false;
    if (p.col < 0 || p.col >= 6) return false;
    if (field.cells[p.row]![p.col]! !== null) return false;
  }
  return true;
}

// Drops the active pair into the field via gravity. Pieces that don't fit in
// the column (column already full to the ceiling) are silently discarded —
// matching standard Puyo eSports / native ama behaviour. Game-over is decided
// at spawn time (see `spawnNext` in state.ts), not here.
export function lockActive(field: Field, active: ActivePair): Field {
  const { axisPos, childPos, axisColor, childColor } = pairCells(active);

  const pieces = [
    { row: axisPos.row, col: axisPos.col, color: axisColor },
    { row: childPos.row, col: childPos.col, color: childColor },
  ].sort((a, b) => b.row - a.row);

  let f = field;
  for (const p of pieces) {
    const landRow = lowestEmpty(f, p.col);
    if (landRow < 0) continue;
    f = withCell(f, landRow, p.col, p.color);
  }
  return f;
}

function lowestEmpty(field: Field, col: number): number {
  // Stop at AI_ROW_OFFSET (row 1 = "13段目"). Rows above that form the
  // transient "14段目" buffer — used during rotation only — so a locked
  // puyo can never settle there. Anything that would have landed in the
  // 14段目 is discarded as sutepuyo (matches Puyo Puyo Tsu behaviour).
  for (let r = ROWS - 1; r >= AI_ROW_OFFSET; r--) {
    if (field.cells[r]![col]! === null) return r;
  }
  return -1;
}
