import type { Color, Field, GameState } from '../../game/types';
import { ROWS, COLS } from '../../game/constants';
import { legalActionMask, ACTION_COUNT } from '../../game/action';

export const BOARD_CHANNELS = 7;
export const QUEUE_DIM = 16;
export const COLOR_ORDER: readonly Color[] = ['R', 'B', 'Y', 'P'] as const;

const COLOR_INDEX: Record<Color, number> = { R: 0, B: 1, Y: 2, P: 3 };

export interface EncodedState {
  board: Float32Array;
  queue: Float32Array;
  legalMask: Uint8Array;
}

export function encodeState(state: GameState): EncodedState {
  const board = new Float32Array(ROWS * COLS * BOARD_CHANNELS);
  writeFieldChannels(board, state.field);
  writeCurrentTsumoChannels(board, state);

  const queue = writeQueueVector(state);

  const legalMask =
    state.current !== null
      ? legalActionMask(state.field, state.current)
      : new Uint8Array(ACTION_COUNT);

  return { board, queue, legalMask };
}

function writeFieldChannels(board: Float32Array, field: Field): void {
  for (let r = 0; r < ROWS; r++) {
    for (let c = 0; c < COLS; c++) {
      const base = r * COLS * BOARD_CHANNELS + c * BOARD_CHANNELS;
      const cell = field.cells[r]![c]!;
      if (cell === null) {
        board[base + 4] = 1;
      } else {
        board[base + COLOR_INDEX[cell]] = 1;
      }
    }
  }
}

function writeCurrentTsumoChannels(board: Float32Array, state: GameState): void {
  if (state.current === null) return;
  const ax = COLOR_INDEX[state.current.pair.axis] / 3;
  const ch = COLOR_INDEX[state.current.pair.child] / 3;
  for (let r = 0; r < ROWS; r++) {
    for (let c = 0; c < COLS; c++) {
      const base = r * COLS * BOARD_CHANNELS + c * BOARD_CHANNELS;
      board[base + 5] = ax;
      board[base + 6] = ch;
    }
  }
}

function writeQueueVector(state: GameState): Float32Array {
  const q = new Float32Array(QUEUE_DIM);
  const n1 = state.nextQueue[0];
  const n2 = state.nextQueue[1];
  if (n1) {
    q[COLOR_INDEX[n1.axis]] = 1;
    q[4 + COLOR_INDEX[n1.child]] = 1;
  }
  if (n2) {
    q[8 + COLOR_INDEX[n2.axis]] = 1;
    q[12 + COLOR_INDEX[n2.child]] = 1;
  }
  return q;
}
