import { ROWS, COLS } from './constants';
import type { Field, Cell } from './types';

export function createEmptyField(): Field {
  const cells: Cell[][] = [];
  for (let r = 0; r < ROWS; r++) {
    const row: Cell[] = [];
    for (let c = 0; c < COLS; c++) row.push(null);
    cells.push(row);
  }
  return { cells };
}

export function getCell(field: Field, row: number, col: number): Cell {
  if (row < 0 || row >= ROWS || col < 0 || col >= COLS) return null;
  return field.cells[row]![col]!;
}

export function withCell(field: Field, row: number, col: number, value: Cell): Field {
  if (row < 0 || row >= ROWS || col < 0 || col >= COLS) {
    throw new Error(`withCell out of range: (${row}, ${col})`);
  }
  const newCells = field.cells.map((r, ri) =>
    ri === row ? r.map((c, ci) => (ci === col ? value : c)) : r,
  );
  return { cells: newCells };
}
