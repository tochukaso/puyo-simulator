import { describe, it, expect } from 'vitest';
import { findConnectedGroups, removePoppedCells, resolveChain } from '../chain';
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

describe('resolveChain', () => {
  it('連鎖が発生しない盤面は空のステップ', () => {
    const f = createEmptyField();
    const r = resolveChain(f);
    expect(r.steps).toEqual([]);
    expect(r.totalScore).toBe(0);
  });

  it('1連鎖で4個消去', () => {
    let f = createEmptyField();
    f = withCell(f, 12, 0, 'R');
    f = withCell(f, 12, 1, 'R');
    f = withCell(f, 12, 2, 'R');
    f = withCell(f, 12, 3, 'R');
    const r = resolveChain(f);
    expect(r.steps.length).toBe(1);
    expect(r.steps[0]!.popped.length).toBe(4);
    expect(r.totalScore).toBeGreaterThan(0);
  });

  it('2連鎖が発生する', () => {
    let f = createEmptyField();
    f = withCell(f, 12, 0, 'R');
    f = withCell(f, 12, 1, 'R');
    f = withCell(f, 12, 2, 'R');
    f = withCell(f, 12, 3, 'R');
    f = withCell(f, 11, 0, 'B');
    f = withCell(f, 11, 1, 'B');
    f = withCell(f, 11, 2, 'B');
    f = withCell(f, 10, 3, 'B');
    const r = resolveChain(f);
    expect(r.steps.length).toBe(2);
  });
});
