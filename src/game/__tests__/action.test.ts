import { describe, it, expect } from 'vitest';
import { ACTION_COUNT, moveToActionIndex, actionIndexToMove, legalActionMask } from '../action';
import { createEmptyField, withCell } from '../field';
import { ROWS } from '../constants';

describe('action index', () => {
  it('ACTION_COUNT is 22', () => {
    expect(ACTION_COUNT).toBe(22);
  });

  it('rot=0 col=0..5 maps to 0..5', () => {
    for (let c = 0; c < 6; c++) {
      expect(moveToActionIndex({ axisCol: c, rotation: 0 })).toBe(c);
    }
  });

  it('rot=2 col=0..5 maps to 6..11', () => {
    for (let c = 0; c < 6; c++) {
      expect(moveToActionIndex({ axisCol: c, rotation: 2 })).toBe(6 + c);
    }
  });

  it('rot=1 col=0..4 maps to 12..16', () => {
    for (let c = 0; c < 5; c++) {
      expect(moveToActionIndex({ axisCol: c, rotation: 1 })).toBe(12 + c);
    }
  });

  it('rot=3 col=1..5 maps to 17..21', () => {
    for (let c = 1; c <= 5; c++) {
      expect(moveToActionIndex({ axisCol: c, rotation: 3 })).toBe(17 + c - 1);
    }
  });

  it('actionIndexToMove is the inverse of moveToActionIndex', () => {
    for (let i = 0; i < ACTION_COUNT; i++) {
      const move = actionIndexToMove(i);
      expect(moveToActionIndex(move)).toBe(i);
    }
  });

  it('throws on out-of-range', () => {
    expect(() => actionIndexToMove(-1)).toThrow();
    expect(() => actionIndexToMove(22)).toThrow();
    expect(() => moveToActionIndex({ axisCol: 5, rotation: 1 })).toThrow();
    expect(() => moveToActionIndex({ axisCol: 0, rotation: 3 })).toThrow();
  });
});

describe('legalActionMask', () => {
  it('all 22 entries are 1 on an empty board', () => {
    const field = createEmptyField();
    const mask = legalActionMask(field, {
      pair: { axis: 'R', child: 'B' },
      axisRow: 1,
      axisCol: 2,
      rotation: 0,
    });
    expect(mask.length).toBe(22);
    for (let i = 0; i < 22; i++) expect(mask[i]).toBe(1);
  });

  it('blocking col=5 sets all col=5 actions to 0', () => {
    let field = createEmptyField();
    for (let r = 0; r < ROWS; r++) field = withCell(field, r, 5, 'R');
    const mask = legalActionMask(field, {
      pair: { axis: 'R', child: 'B' },
      axisRow: 1,
      axisCol: 2,
      rotation: 0,
    });
    expect(mask[5]).toBe(0);
    expect(mask[11]).toBe(0);
  });
});
