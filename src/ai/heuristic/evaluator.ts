import { COLS, ROWS, SPAWN_COL } from '../../game/constants';
import type { Field } from '../../game/types';
import { resolveChain } from '../../game/chain';

export function columnHeights(field: Field): number[] {
  const h: number[] = [];
  for (let c = 0; c < COLS; c++) {
    let height = 0;
    for (let r = 0; r < ROWS; r++) {
      if (field.cells[r]![c]! !== null) {
        height = ROWS - r;
        break;
      }
    }
    h.push(height);
  }
  return h;
}

export function heightVariance(heights: number[]): number {
  const mean = heights.reduce((a, b) => a + b, 0) / heights.length;
  return heights.reduce((s, h) => s + (h - mean) ** 2, 0) / heights.length;
}

export function dangerPenalty(heights: number[]): number {
  const spawnHeight = heights[SPAWN_COL] ?? 0;
  return Math.max(0, spawnHeight - 8) ** 2;
}

export function chainPotential(field: Field): number {
  const { steps, totalScore } = resolveChain(field);
  return totalScore + steps.length * steps.length * 100;
}
