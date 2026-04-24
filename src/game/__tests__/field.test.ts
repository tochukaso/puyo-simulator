import { describe, it, expect } from 'vitest';
import { createEmptyField, getCell } from '../field';
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
