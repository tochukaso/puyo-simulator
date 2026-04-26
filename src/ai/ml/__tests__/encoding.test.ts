import { describe, it, expect } from 'vitest';
import { encodeState, BOARD_CHANNELS, COLOR_ORDER } from '../encoding';
import { createEmptyField, withCell } from '../../../game/field';
import type { GameState, Pair } from '../../../game/types';

function makeState(overrides: Partial<GameState> = {}): GameState {
  return {
    field: createEmptyField(),
    current: {
      pair: { axis: 'R', child: 'B' },
      axisRow: 1,
      axisCol: 2,
      rotation: 0,
    },
    nextQueue: [
      { axis: 'Y', child: 'P' } as Pair,
      { axis: 'R', child: 'R' } as Pair,
    ],
    score: 0,
    chainCount: 0,
    totalChains: 0,
    maxChain: 0,
    status: 'playing',
    rngSeed: 0,
    queueIndex: 0,
    ...overrides,
  };
}

describe('encodeState', () => {
  it('BOARD_CHANNELS is 11, COLOR_ORDER has 4 colors', () => {
    expect(BOARD_CHANNELS).toBe(11);
    expect(COLOR_ORDER).toEqual(['R', 'B', 'Y', 'P']);
  });

  it('空盤面: empty チャンネルが全マス 1、色チャンネルは 0', () => {
    const e = encodeState(makeState());
    expect(e.board.length).toBe(13 * 6 * 11);
    for (let r = 0; r < 13; r++) {
      for (let c = 0; c < 6; c++) {
        for (let ch = 0; ch < 4; ch++) {
          expect(e.board[r * 66 + c * 11 + ch]).toBe(0);
        }
        expect(e.board[r * 66 + c * 11 + 4]).toBe(1);
      }
    }
  });

  it('R を (5,3) に置くと R チャンネルが立ち、空チャンネルが落ちる', () => {
    const field = withCell(createEmptyField(), 5, 3, 'R');
    const e = encodeState(makeState({ field }));
    const off = 5 * 66 + 3 * 11;
    expect(e.board[off + 0]).toBe(1);
    expect(e.board[off + 4]).toBe(0);
  });

  it('現ツモ R/B: ch=5 が全マス R=0/3、ch=6 が B=1/3', () => {
    const e = encodeState(makeState());
    for (let r = 0; r < 13; r++) {
      for (let c = 0; c < 6; c++) {
        expect(e.board[r * 66 + c * 11 + 5]).toBe(0);
        expect(e.board[r * 66 + c * 11 + 6]).toBeCloseTo(1 / 3);
      }
    }
  });

  it('queue[16]: NEXT Y/P, NEXT2 R/R の one-hot', () => {
    const e = encodeState(makeState());
    expect(e.queue.length).toBe(16);
    expect(e.queue[0]).toBe(0);
    expect(e.queue[1]).toBe(0);
    expect(e.queue[2]).toBe(1);
    expect(e.queue[3]).toBe(0);
    expect(e.queue[4 + 3]).toBe(1);
    expect(e.queue[8 + 0]).toBe(1);
    expect(e.queue[12 + 0]).toBe(1);
  });

  it('legalMask の長さは 22、current=null なら全 0', () => {
    const e = encodeState(makeState());
    expect(e.legalMask.length).toBe(22);
    const e2 = encodeState(makeState({ current: null }));
    expect(e2.legalMask.every((v) => v === 0)).toBe(true);
  });
});
