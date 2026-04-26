import { describe, it, expect } from 'vitest';
import { encodeState } from '../encoding';
import { createEmptyField, withCell } from '../../../game/field';
import spec from '../../../shared/specs/encoding_spec.json';
import type { Color, GameState, Rotation } from '../../../game/types';

type FieldMod = { row: number; col: number; color: Color } | null;
type SpecState = {
  field: FieldMod[] | null;
  current: {
    axis: Color;
    child: Color;
    axisRow: number;
    axisCol: number;
    rotation: number;
  };
  nextQueue: { axis: Color; child: Color }[];
};

function buildState(s: SpecState): GameState {
  let field = createEmptyField();
  if (s.field !== null) {
    for (const m of s.field) {
      if (m !== null) field = withCell(field, m.row, m.col, m.color);
    }
  }
  return {
    field,
    current: {
      pair: { axis: s.current.axis, child: s.current.child },
      axisRow: s.current.axisRow,
      axisCol: s.current.axisCol,
      rotation: s.current.rotation as Rotation,
    },
    nextQueue: s.nextQueue.map((p) => ({ axis: p.axis, child: p.child })),
    score: 0,
    chainCount: 0,
    totalChains: 0,
    maxChain: 0,
    status: 'playing',
    rngSeed: 0,
    queueIndex: 0,
  };
}

describe('encoding_spec.json', () => {
  for (const c of spec.cases) {
    it(c.name, () => {
      const state = buildState(c.state as SpecState);
      const e = encodeState(state);
      const [R, C, CH] = c.expected.board_shape;
      expect(e.board.length).toBe(R! * C! * CH!);
      expect(e.queue.length).toBe(c.expected.queue_shape[0]);
      for (const s of c.expected.board_samples) {
        const off = s.r * C! * CH! + s.c * CH! + s.ch;
        expect(e.board[off]).toBeCloseTo(s.value, 6);
      }
      for (let i = 0; i < c.expected.queue_values.length; i++) {
        expect(e.queue[i]).toBeCloseTo(c.expected.queue_values[i]!, 6);
      }
      expect(e.legalMask.reduce((a, b) => a + b, 0)).toBe(c.expected.legal_mask_sum);
    });
  }
});
