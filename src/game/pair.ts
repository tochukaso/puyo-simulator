import type { ActivePair, Rotation, Color, Field } from './types';
import { COLS, ROWS } from './constants';
import { getCell } from './field';

export interface CellPos {
  row: number;
  col: number;
}

export function pairCells(active: ActivePair): {
  axisPos: CellPos;
  childPos: CellPos;
  axisColor: Color;
  childColor: Color;
} {
  const { axisRow, axisCol, rotation, pair } = active;
  const [dr, dc] = childOffset(rotation);
  return {
    axisPos: { row: axisRow, col: axisCol },
    childPos: { row: axisRow + dr, col: axisCol + dc },
    axisColor: pair.axis,
    childColor: pair.child,
  };
}

export function childOffset(rotation: Rotation): [number, number] {
  switch (rotation) {
    case 0: return [-1, 0];
    case 1: return [0, 1];
    case 2: return [1, 0];
    case 3: return [0, -1];
  }
}

export function canPlace(field: Field, active: ActivePair): boolean {
  const { axisPos, childPos } = pairCells(active);
  return inBoundsAndEmpty(field, axisPos) && inBoundsOrAbove(field, childPos);
}

function inBoundsAndEmpty(field: Field, p: CellPos): boolean {
  if (p.row < 0) return true;
  if (p.row >= ROWS || p.col < 0 || p.col >= COLS) return false;
  return getCell(field, p.row, p.col) === null;
}

function inBoundsOrAbove(field: Field, p: CellPos): boolean {
  if (p.col < 0 || p.col >= COLS) return false;
  if (p.row < 0) return true;
  if (p.row >= ROWS) return false;
  return getCell(field, p.row, p.col) === null;
}
