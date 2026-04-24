import { ROWS } from './constants';
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
  for (let r = ROWS - 1; r >= 0; r--) {
    if (field.cells[r]![col]! === null) return r;
  }
  return -1;
}
