import { ROWS, COLS, VISIBLE_ROW_START } from './constants';
import type { Field, Color } from './types';
import { withCell, applyGravity } from './field';
import type { ChainStep } from './types';

export interface PoppedCell {
  row: number;
  col: number;
  /** 'G' indicates garbage cleared by adjacency to a color group pop. */
  color: Color | 'G';
}

export interface ConnectedGroup {
  color: Color;
  cells: PoppedCell[];
}

// Standard Puyo rules: row 0 (ceiling, the 13th row) puyos exist for stacking but
// do NOT participate in 4-connection pops. Restricting the search to
// VISIBLE_ROW_START..ROWS keeps clusters that cross the ceiling row from
// counting that ceiling cell, matching native ama / Puyo eSports behavior.
export function findConnectedGroups(field: Field): ConnectedGroup[] {
  const visited: boolean[][] = Array.from({ length: ROWS }, () => Array(COLS).fill(false));
  const groups: ConnectedGroup[] = [];

  for (let r = VISIBLE_ROW_START; r < ROWS; r++) {
    for (let c = 0; c < COLS; c++) {
      if (visited[r]![c]!) continue;
      const v = field.cells[r]![c]!;
      // Empty cells and garbage never form groups themselves.
      if (v === null || v === 'G') {
        visited[r]![c] = true;
        continue;
      }
      const cluster = bfs(field, r, c, v, visited);
      if (cluster.length >= 4) groups.push({ color: v, cells: cluster });
    }
  }
  return groups;
}

function bfs(field: Field, sr: number, sc: number, color: Color, visited: boolean[][]): PoppedCell[] {
  const queue: [number, number][] = [[sr, sc]];
  const out: PoppedCell[] = [];
  visited[sr]![sc] = true;
  while (queue.length > 0) {
    const [r, c] = queue.shift()!;
    out.push({ row: r, col: c, color });
    for (const [dr, dc] of [[-1, 0], [1, 0], [0, -1], [0, 1]] as const) {
      const nr = r + dr, nc = c + dc;
      if (nr < VISIBLE_ROW_START || nr >= ROWS || nc < 0 || nc >= COLS) continue;
      if (visited[nr]![nc]!) continue;
      if (field.cells[nr]![nc]! !== color) continue;
      visited[nr]![nc] = true;
      queue.push([nr, nc]);
    }
  }
  return out;
}

export function removePoppedCells(field: Field, popped: ReadonlyArray<PoppedCell>): Field {
  let f = field;
  for (const p of popped) f = withCell(f, p.row, p.col, null);
  return f;
}

const CHAIN_BONUS = [0, 0, 8, 16, 32, 64, 96, 128, 160, 192, 224, 256, 288, 320, 352, 384, 416, 448, 480, 512];
const CONNECT_BONUS = [0, 0, 0, 0, 0, 2, 3, 4, 5, 6, 7, 10];
const COLOR_BONUS = [0, 0, 3, 6, 12, 24];

function scoreForStep(popped: ConnectedGroup[], chainIndex: number): number {
  const cleared = popped.reduce((s, g) => s + g.cells.length, 0);
  const chainBonus = CHAIN_BONUS[Math.min(chainIndex, CHAIN_BONUS.length - 1)]!;
  const connectBonus = popped
    .map(g => CONNECT_BONUS[Math.min(g.cells.length, CONNECT_BONUS.length - 1)]!)
    .reduce((a, b) => a + b, 0);
  const uniqueColors = new Set(popped.map(g => g.color)).size;
  const colorBonus = COLOR_BONUS[Math.min(uniqueColors, COLOR_BONUS.length - 1)]!;
  const bonus = Math.max(chainBonus + connectBonus + colorBonus, 1);
  return cleared * bonus * 10;
}

export function resolveChain(field: Field): {
  finalField: Field;
  steps: ChainStep[];
  totalScore: number;
} {
  let current = field;
  const steps: ChainStep[] = [];
  let total = 0;
  let chainIndex = 0;

  while (true) {
    const groups = findConnectedGroups(current);
    if (groups.length === 0) break;
    chainIndex++;
    const colorPopped = groups.flatMap(g => g.cells);
    // Standard puyo: garbage adjacent (orthogonally) to any popping color cell
    // is cleared in the same step. Score is unaffected (only color cells score).
    const garbagePopped = findAdjacentGarbage(current, colorPopped);
    const popped = [...colorPopped, ...garbagePopped];
    const before = current;
    const afterPop = removePoppedCells(current, popped);
    const afterGravity = applyGravity(afterPop);
    const delta = scoreForStep(groups, chainIndex);
    steps.push({
      beforeField: before,
      popped,
      afterPop,
      afterGravity,
      chainIndex,
      scoreDelta: delta,
    });
    total += delta;
    current = afterGravity;
  }

  return { finalField: current, steps, totalScore: total };
}

function findAdjacentGarbage(field: Field, popped: ReadonlyArray<PoppedCell>): PoppedCell[] {
  const seen = new Set<string>();
  const out: PoppedCell[] = [];
  for (const p of popped) {
    for (const [dr, dc] of [[-1, 0], [1, 0], [0, -1], [0, 1]] as const) {
      const nr = p.row + dr;
      const nc = p.col + dc;
      if (nr < VISIBLE_ROW_START || nr >= ROWS || nc < 0 || nc >= COLS) continue;
      if (field.cells[nr]![nc]! !== 'G') continue;
      const key = `${nr},${nc}`;
      if (seen.has(key)) continue;
      seen.add(key);
      out.push({ row: nr, col: nc, color: 'G' });
    }
  }
  return out;
}
