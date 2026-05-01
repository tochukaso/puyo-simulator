import { describe, it, expect } from 'vitest';
import { dropDistance, lockActive } from '../landing';
import { createEmptyField, withCell, getCell } from '../field';
import { ROWS } from '../constants';
import type { ActivePair } from '../types';

describe('dropDistance', () => {
  it('falls to the bottom row on an empty board with rotation=0 (vertical)', () => {
    const f = createEmptyField();
    const a: ActivePair = {
      pair: { axis: 'R', child: 'B' }, axisRow: 0, axisCol: 2, rotation: 0,
    };
    expect(dropDistance(f, a)).toBe(ROWS - 1);
  });

  it('stops on top of a puyo below', () => {
    let f = createEmptyField();
    f = withCell(f, ROWS - 1, 2, 'Y');
    const a: ActivePair = {
      pair: { axis: 'R', child: 'B' }, axisRow: 0, axisCol: 2, rotation: 0,
    };
    expect(dropDistance(f, a)).toBe(ROWS - 2);
  });
});

describe('lockActive (chigiri / split landing)', () => {
  it('with rotation=1 over columns of different heights, axis and child fall independently', () => {
    let f = createEmptyField();
    f = withCell(f, ROWS - 1, 3, 'Y');
    const a: ActivePair = {
      pair: { axis: 'R', child: 'B' }, axisRow: ROWS - 2, axisCol: 2, rotation: 1,
    };
    const locked = lockActive(f, a);
    expect(getCell(locked, ROWS - 1, 2)).toBe('R');
    expect(getCell(locked, ROWS - 2, 3)).toBe('B');
  });
});
