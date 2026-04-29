import type { Move, Field, ActivePair } from '../../../game/types';
import { ROWS, COLS } from '../../../game/constants';
import { pairCells } from '../../../game/pair';

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
  const { axisPos, childPos } = pairCells(placed);

  // For each column, initialize "the lowest empty row that can be stacked next" from the field.
  const colTop: number[] = new Array(COLS);
  for (let c = 0; c < COLS; c++) {
    let r = ROWS - 1;
    while (r >= 0 && field.cells[r]![c]! !== null) r--;
    colTop[c] = r;
  }

  // Process pieces in the same drop order as lockActive (larger startRow =
  // lower piece first). This ensures that when both pieces fall into the same
  // column (rot 0/2), the upper piece stacks on top of the lower one.
  const pieces = [
    { kind: 'axis' as const, col: axisPos.col, startRow: axisPos.row },
    { kind: 'child' as const, col: childPos.col, startRow: childPos.row },
  ].sort((a, b) => b.startRow - a.startRow);

  const result: GhostPos[] = [];
  for (const p of pieces) {
    const r = colTop[p.col]!;
    // If the column is filled up to the ceiling and the piece can't fit,
    // silently drop it just like lockActive does (matching the original
    // game's behavior). Still display the ghost of the remaining piece.
    if (r < 0) continue;
    result.push({ row: r, col: p.col, kind: p.kind });
    colTop[p.col] = r - 1;
  }

  return result.length > 0 ? result : null;
}
