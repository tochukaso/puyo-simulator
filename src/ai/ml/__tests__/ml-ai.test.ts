import { describe, it, expect, vi } from 'vitest';
import { createEmptyField } from '../../../game/field';
import type { GameState } from '../../../game/types';
import { MlAI } from '../ml-ai';

function makeState(): GameState {
  return {
    field: createEmptyField(),
    current: {
      pair: { axis: 'R', child: 'B' },
      axisRow: 1,
      axisCol: 2,
      rotation: 0,
    },
    nextQueue: [
      { axis: 'Y', child: 'P' },
      { axis: 'R', child: 'R' },
    ],
    score: 0,
    chainCount: 0,
    totalChains: 0,
    maxChain: 0,
    status: 'playing',
    rngSeed: 0,
    queueIndex: 0,
  };
}

describe('MlAI', () => {
  it('suggest() uses fake predict() to produce top-K moves honoring legalMask', async () => {
    const ai = new MlAI();

    const logits = new Float32Array(22);
    logits[5] = 100;
    logits[11] = 100;
    logits[0] = 50;
    logits[8] = 40;

    const fakeModel = {
      predict: vi.fn(() => {
        const policyTensor = {
          size: 22,
          data: () => Promise.resolve(logits),
          dispose: () => {},
        };
        const valueTensor = {
          size: 1,
          data: () => Promise.resolve(new Float32Array([0.12])),
          dispose: () => {},
        };
        return [policyTensor, valueTensor];
      }),
      dispose: vi.fn(),
    };
    ai.__setModelForTest(fakeModel as unknown as never);

    const state = makeState();
    const moves = await ai.suggest(state, 3);
    expect(moves).toHaveLength(3);
    // logits[5] and logits[11] are max (both 100), should appear in top-3
    const indices = moves.map((m) => {
      if (m.rotation === 0) return m.axisCol;
      if (m.rotation === 2) return 6 + m.axisCol;
      return null;
    });
    expect(indices.includes(5) || indices.includes(11)).toBe(true);
    expect(moves[0]!.reason).toMatch(/p=/);
    expect(moves[0]!.reason).toMatch(/v=/);
  });

  it('returns [] when current is null', async () => {
    const ai = new MlAI();
    const fakeModel = {
      predict: vi.fn(),
      dispose: vi.fn(),
    };
    ai.__setModelForTest(fakeModel as unknown as never);
    const state = makeState();
    const moves = await ai.suggest({ ...state, current: null }, 3);
    expect(moves).toEqual([]);
  });
});
