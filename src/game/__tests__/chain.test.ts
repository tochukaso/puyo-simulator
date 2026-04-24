import { describe, it, expect } from 'vitest';
import { findConnectedGroups, removePoppedCells } from '../chain';
import { createEmptyField, withCell } from '../field';

describe('findConnectedGroups', () => {
  it('4つ以上の同色連結を検出', () => {
    let f = createEmptyField();
    f = withCell(f, 12, 0, 'R');
    f = withCell(f, 12, 1, 'R');
    f = withCell(f, 12, 2, 'R');
    f = withCell(f, 12, 3, 'R');
    const groups = findConnectedGroups(f);
    expect(groups.length).toBe(1);
    expect(groups[0]!.color).toBe('R');
    expect(groups[0]!.cells.length).toBe(4);
  });

  it('3つでは検出しない', () => {
    let f = createEmptyField();
    f = withCell(f, 12, 0, 'R');
    f = withCell(f, 12, 1, 'R');
    f = withCell(f, 12, 2, 'R');
    expect(findConnectedGroups(f)).toEqual([]);
  });

  it('異なる色は別グループ、混ざらない', () => {
    let f = createEmptyField();
    f = withCell(f, 12, 0, 'R');
    f = withCell(f, 12, 1, 'B');
    f = withCell(f, 12, 2, 'R');
    f = withCell(f, 12, 3, 'R');
    expect(findConnectedGroups(f)).toEqual([]);
  });
});

describe('removePoppedCells', () => {
  it('指定セルを null に', () => {
    let f = createEmptyField();
    f = withCell(f, 12, 0, 'R');
    const removed = removePoppedCells(f, [{ row: 12, col: 0, color: 'R' }]);
    expect(removed.cells[12]![0]!).toBeNull();
  });
});
