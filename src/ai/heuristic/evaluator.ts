import { COLS, ROWS, SPAWN_COL } from '../../game/constants';
import type { Field, Color } from '../../game/types';
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

export function connectionSeed(field: Field): number {
  const visited: boolean[][] = Array.from({ length: ROWS }, () => Array(COLS).fill(false));
  let score = 0;
  for (let r = 0; r < ROWS; r++) {
    for (let c = 0; c < COLS; c++) {
      if (visited[r]![c]!) continue;
      const color = field.cells[r]![c]! as Color | null;
      if (!color) continue;
      const size = bfsSize(field, r, c, color, visited);
      if (size === 2) score += 1;
      else if (size === 3) score += 3;
    }
  }
  return score;
}

function bfsSize(field: Field, sr: number, sc: number, color: Color, visited: boolean[][]): number {
  let count = 0;
  const stack: [number, number][] = [[sr, sc]];
  visited[sr]![sc] = true;
  while (stack.length > 0) {
    const [r, c] = stack.pop()!;
    count++;
    for (const [dr, dc] of [[-1, 0], [1, 0], [0, -1], [0, 1]] as const) {
      const nr = r + dr, nc = c + dc;
      if (nr < 0 || nr >= ROWS || nc < 0 || nc >= COLS) continue;
      if (visited[nr]![nc]!) continue;
      if (field.cells[nr]![nc]! !== color) continue;
      visited[nr]![nc] = true;
      stack.push([nr, nc]);
    }
  }
  return count;
}

export interface Weights {
  chainPotential: number;
  heightBalance: number;
  danger: number;
  connection: number;
}

export const DEFAULT_WEIGHTS: Weights = {
  chainPotential: 1.0,
  heightBalance: 0.5,
  danger: 3.0,
  connection: 0.3,
};

export function evaluateField(field: Field, w: Weights): number {
  const heights = columnHeights(field);
  return (
    w.chainPotential * chainPotential(field)
    - w.heightBalance * heightVariance(heights)
    - w.danger * dangerPenalty(heights)
    + w.connection * connectionSeed(field)
  );
}

export interface EvalBreakdown {
  total: number;
  chainPotential: number;
  heightBalance: number;
  danger: number;
  connection: number;
}

export function evaluateFieldBreakdown(field: Field, w: Weights): EvalBreakdown {
  const heights = columnHeights(field);
  const chain = w.chainPotential * chainPotential(field);
  const hb = -w.heightBalance * heightVariance(heights);
  const dg = -w.danger * dangerPenalty(heights);
  const cn = w.connection * connectionSeed(field);
  return {
    total: chain + hb + dg + cn,
    chainPotential: chain,
    heightBalance: hb,
    danger: dg,
    connection: cn,
  };
}
