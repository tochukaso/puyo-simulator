import { ROWS, COLS } from './constants';
import type { Field, Cell, Color } from './types';

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

export function applyGravity(field: Field): Field {
  const newCells: Cell[][] = Array.from({ length: ROWS }, () => Array(COLS).fill(null));
  for (let c = 0; c < COLS; c++) {
    const stack: Color[] = [];
    for (let r = 0; r < ROWS; r++) {
      const v = field.cells[r]![c]!;
      if (v !== null) stack.push(v);
    }
    let row = ROWS - 1;
    for (let i = stack.length - 1; i >= 0; i--, row--) {
      newCells[row]![c] = stack[i]!;
    }
  }
  return { cells: newCells };
}
