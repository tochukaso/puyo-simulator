import { describe, it, expect } from 'vitest';
import { createEmptyField, getCell, withCell, applyGravity } from '../field';
import { ROWS, COLS } from '../constants';

describe('createEmptyField', () => {
  it('creates a ROWS x COLS field with every cell null', () => {
    const f = createEmptyField();
    expect(f.cells.length).toBe(ROWS);
    expect(f.cells[0]!.length).toBe(COLS);
    for (let r = 0; r < ROWS; r++) {
      for (let c = 0; c < COLS; c++) {
        expect(getCell(f, r, c)).toBeNull();
      }
    }
  });
});

describe('withCell', () => {
  it('does not mutate the original Field; returns a new one', () => {
    const f0 = createEmptyField();
    const f1 = withCell(f0, 5, 3, 'R');
    expect(getCell(f0, 5, 3)).toBeNull();
    expect(getCell(f1, 5, 3)).toBe('R');
  });

  it('throws when out of range', () => {
    const f0 = createEmptyField();
    expect(() => withCell(f0, -1, 0, 'R')).toThrow();
    expect(() => withCell(f0, 0, COLS, 'R')).toThrow();
  });
});

describe('applyGravity', () => {
  it('floating puyos fall down', () => {
    let f = createEmptyField();
    f = withCell(f, 0, 0, 'R');
    f = withCell(f, 12, 0, 'B');
    const g = applyGravity(f);
    expect(getCell(g, 0, 0)).toBeNull();
    expect(getCell(g, 11, 0)).toBe('R');
    expect(getCell(g, 12, 0)).toBe('B');
  });

  it('packs a column with gaps so puyos stack at the bottom', () => {
    let f = createEmptyField();
    f = withCell(f, 5, 2, 'R');
    f = withCell(f, 7, 2, 'B');
    f = withCell(f, 12, 2, 'Y');
    const g = applyGravity(f);
    expect(getCell(g, 10, 2)).toBe('R');
    expect(getCell(g, 11, 2)).toBe('B');
    expect(getCell(g, 12, 2)).toBe('Y');
  });
});
