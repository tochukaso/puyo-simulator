import { ROWS, COLS } from '../../game/constants';
import type { Color, GameState, Pair } from '../../game/types';
import { ACTION_COUNT, actionIndexToMove } from '../../game/action';

export const BOARD_CHANNELS = 11;
export const QUEUE_DIM = 16;
export const COLOR_ORDER: Color[] = ['R', 'B', 'Y', 'P'];
const COLOR_INDEX: Record<Color, number> = { R: 0, B: 1, Y: 2, P: 3 };

export interface EncodedState {
  board: Float32Array;
  queue: Float32Array;
  legalMask: Uint8Array;
}

interface CanonState {
  field: { cells: (Color | null)[][] };
  current: GameState['current'];
  nextQueue: Pair[];
}

export function canonicalizeColors(state: GameState): {
  canonical: CanonState;
  perm: Partial<Record<Color, number>>;
} {
  const perm: Partial<Record<Color, number>> = {};
  const see = (c: Color | null | undefined) => {
    if (c == null) return;
    if (perm[c] === undefined && Object.keys(perm).length < 4) {
      perm[c] = Object.keys(perm).length;
    }
  };

  const cells = state.field.cells as readonly (readonly (Color | null)[])[];
  for (let r = ROWS - 1; r >= 0; r--) {
    for (let c = 0; c < COLS; c++) see(cells[r]![c]);
  }
  if (state.current) {
    see(state.current.pair.axis);
    see(state.current.pair.child);
  }
  for (const p of state.nextQueue) {
    see(p.axis);
    see(p.child);
  }

  const remap = (c: Color | null | undefined): Color | null => {
    if (c == null) return null;
    const id = perm[c];
    return id === undefined ? c : COLOR_ORDER[id]!;
  };

  const canonField: (Color | null)[][] = cells.map((row) =>
    row.map((c) => remap(c)),
  );
  const canonCurrent = state.current
    ? {
        ...state.current,
        pair: {
          axis: remap(state.current.pair.axis)!,
          child: remap(state.current.pair.child)!,
        },
      }
    : null;
  const canonQueue: Pair[] = state.nextQueue.map((p) => ({
    axis: remap(p.axis)!,
    child: remap(p.child)!,
  }));

  return {
    canonical: {
      field: { cells: canonField },
      current: canonCurrent,
      nextQueue: canonQueue,
    },
    perm,
  };
}

export function encodeState(state: GameState): EncodedState {
  const { canonical } = canonicalizeColors(state);
  const board = new Float32Array(ROWS * COLS * BOARD_CHANNELS);
  const cellIdx = (r: number, c: number, ch: number) =>
    r * COLS * BOARD_CHANNELS + c * BOARD_CHANNELS + ch;

  // ch 0..3 + ch 4 (empty)
  for (let r = 0; r < ROWS; r++) {
    for (let c = 0; c < COLS; c++) {
      const v = canonical.field.cells[r]![c];
      if (v == null) {
        board[cellIdx(r, c, 4)] = 1;
      } else {
        board[cellIdx(r, c, COLOR_INDEX[v])] = 1;
      }
    }
  }

  // ch 5/6: axis/child broadcast
  if (canonical.current) {
    const ax = COLOR_INDEX[canonical.current.pair.axis] / 3;
    const ch = COLOR_INDEX[canonical.current.pair.child] / 3;
    for (let r = 0; r < ROWS; r++) {
      for (let c = 0; c < COLS; c++) {
        board[cellIdx(r, c, 5)] = ax;
        board[cellIdx(r, c, 6)] = ch;
      }
    }
  }

  // ch 7: heightmap
  const heights = new Array<number>(COLS).fill(0);
  for (let c = 0; c < COLS; c++) {
    for (let r = 0; r < ROWS; r++) {
      if (canonical.field.cells[r]![c] != null) {
        heights[c] = ROWS - r;
        break;
      }
    }
    for (let r = 0; r < ROWS; r++) board[cellIdx(r, c, 7)] = heights[c]! / ROWS;
  }

  // ch 8: 4-connected mask
  const mask = fourConnectedMask(canonical.field.cells);
  for (let r = 0; r < ROWS; r++) {
    for (let c = 0; c < COLS; c++) {
      if (mask[r]![c]) board[cellIdx(r, c, 8)] = 1;
    }
  }

  // ch 9 / 10: ceiling and danger occupancy per column
  for (let c = 0; c < COLS; c++) {
    if (canonical.field.cells[0]![c] != null) {
      for (let r = 0; r < ROWS; r++) board[cellIdx(r, c, 9)] = 1;
    }
    if (canonical.field.cells[1]![c] != null) {
      for (let r = 0; r < ROWS; r++) board[cellIdx(r, c, 10)] = 1;
    }
  }

  // queue
  const queue = new Float32Array(QUEUE_DIM);
  if (canonical.nextQueue.length >= 1) {
    const n1 = canonical.nextQueue[0]!;
    queue[COLOR_INDEX[n1.axis]] = 1;
    queue[4 + COLOR_INDEX[n1.child]] = 1;
  }
  if (canonical.nextQueue.length >= 2) {
    const n2 = canonical.nextQueue[1]!;
    queue[8 + COLOR_INDEX[n2.axis]] = 1;
    queue[12 + COLOR_INDEX[n2.child]] = 1;
  }

  // legal mask
  const legalMask = new Uint8Array(ACTION_COUNT);
  if (canonical.current) {
    for (let i = 0; i < ACTION_COUNT; i++) {
      const m = actionIndexToMove(i);
      const dc = m.rotation === 1 ? 1 : m.rotation === 3 ? -1 : 0;
      if (
        m.axisCol >= 0 &&
        m.axisCol < COLS &&
        m.axisCol + dc >= 0 &&
        m.axisCol + dc < COLS
      ) {
        legalMask[i] = 1;
      }
    }
  }

  return { board, queue, legalMask };
}

function fourConnectedMask(cells: readonly (readonly (Color | null)[])[]): boolean[][] {
  const seen: boolean[][] = Array.from({ length: ROWS }, () =>
    Array<boolean>(COLS).fill(false),
  );
  const out: boolean[][] = Array.from({ length: ROWS }, () =>
    Array<boolean>(COLS).fill(false),
  );
  for (let r = 0; r < ROWS; r++) {
    for (let c = 0; c < COLS; c++) {
      if (seen[r]![c] || cells[r]![c] == null) continue;
      const color = cells[r]![c]!;
      const stack: [number, number][] = [[r, c]];
      const group: [number, number][] = [];
      while (stack.length) {
        const [y, x] = stack.pop()!;
        if (y < 0 || y >= ROWS || x < 0 || x >= COLS) continue;
        if (seen[y]![x] || cells[y]![x] !== color) continue;
        seen[y]![x] = true;
        group.push([y, x]);
        stack.push([y - 1, x], [y + 1, x], [y, x - 1], [y, x + 1]);
      }
      if (group.length >= 4) for (const [y, x] of group) out[y]![x] = true;
    }
  }
  return out;
}
