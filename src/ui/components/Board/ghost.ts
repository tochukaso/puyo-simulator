import type { Move, Field, ActivePair } from '../../../game/types';
import { ROWS, COLS } from '../../../game/constants';
import { lockActive } from '../../../game/landing';

export interface GhostPos {
  row: number;
  col: number;
  kind: 'axis' | 'child';
}

export function ghostCells(
  field: Field,
  current: ActivePair | null,
  bestMove: Move | null,
): GhostPos[] | null {
  if (!current || !bestMove) return null;

  const placed: ActivePair = {
    ...current,
    axisCol: bestMove.axisCol,
    rotation: bestMove.rotation,
    axisRow: 0,
  };
  const after = lockActive(field, placed);
  if (!after) return null;

  const axisColor = current.pair.axis;
  const newCells: Array<{ row: number; col: number; color: string }> = [];
  for (let r = 0; r < ROWS; r++) {
    for (let c = 0; c < COLS; c++) {
      const before = field.cells[r]![c]!;
      const now = after.cells[r]![c]!;
      if (before === null && now !== null) {
        newCells.push({ row: r, col: c, color: now });
      }
    }
  }
  if (newCells.length !== 2) return null;

  let axisIdx = newCells.findIndex(
    (cell) => cell.col === bestMove.axisCol && cell.color === axisColor,
  );
  if (axisIdx === -1) axisIdx = 0;
  const childIdx = 1 - axisIdx;

  return [
    { row: newCells[axisIdx]!.row, col: newCells[axisIdx]!.col, kind: 'axis' },
    { row: newCells[childIdx]!.row, col: newCells[childIdx]!.col, kind: 'child' },
  ];
}
