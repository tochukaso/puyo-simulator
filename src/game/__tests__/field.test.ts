import { describe, it, expect } from 'vitest';
import { createEmptyField, getCell, withCell, applyGravity } from '../field';
import { ROWS, COLS } from '../constants';

describe('createEmptyField', () => {
  it('全マスが null の ROWS x COLS を作る', () => {
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
  it('元の Field を変更せず、新しい Field を返す', () => {
    const f0 = createEmptyField();
    const f1 = withCell(f0, 5, 3, 'R');
    expect(getCell(f0, 5, 3)).toBeNull();
    expect(getCell(f1, 5, 3)).toBe('R');
  });

  it('範囲外は例外', () => {
    const f0 = createEmptyField();
    expect(() => withCell(f0, -1, 0, 'R')).toThrow();
    expect(() => withCell(f0, 0, COLS, 'R')).toThrow();
  });
});

describe('applyGravity', () => {
  it('浮いているぷよが下に落ちる', () => {
    let f = createEmptyField();
    f = withCell(f, 0, 0, 'R');
    f = withCell(f, 12, 0, 'B');
    const g = applyGravity(f);
    expect(getCell(g, 0, 0)).toBeNull();
    expect(getCell(g, 11, 0)).toBe('R');
    expect(getCell(g, 12, 0)).toBe('B');
  });

  it('隙間のある縦列を詰める', () => {
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
