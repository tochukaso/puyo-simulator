import { describe, it, expect } from 'vitest';
import { findConnectedGroups, removePoppedCells, resolveChain } from '../chain';
import { createEmptyField, withCell } from '../field';

describe('findConnectedGroups', () => {
  it('detects same-color groups of size 4 or more', () => {
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

  it('does not detect groups of 3', () => {
    let f = createEmptyField();
    f = withCell(f, 12, 0, 'R');
    f = withCell(f, 12, 1, 'R');
    f = withCell(f, 12, 2, 'R');
    expect(findConnectedGroups(f)).toEqual([]);
  });

  it('different colors form separate groups and do not mix', () => {
    let f = createEmptyField();
    f = withCell(f, 12, 0, 'R');
    f = withCell(f, 12, 1, 'B');
    f = withCell(f, 12, 2, 'R');
    f = withCell(f, 12, 3, 'R');
    expect(findConnectedGroups(f)).toEqual([]);
  });

  // Puyo Puyo Tsuu rules: the 13th row (row 0) can be stacked on, but
  // puyos there don't pop. Exclude row 0 puyos from the 4-connected count.
  it('does not include ceiling-row (row 0) puyos in the 4-connected count', () => {
    let f = createEmptyField();
    f = withCell(f, 0, 0, 'Y');
    f = withCell(f, 1, 0, 'Y');
    f = withCell(f, 1, 1, 'Y');
    f = withCell(f, 2, 1, 'Y');
    // Excluding row 0 leaves 3 → no pop.
    expect(findConnectedGroups(f)).toEqual([]);
  });
});

describe('removePoppedCells', () => {
  it('sets the specified cells to null', () => {
    let f = createEmptyField();
    f = withCell(f, 12, 0, 'R');
    const removed = removePoppedCells(f, [{ row: 12, col: 0, color: 'R' }]);
    expect(removed.cells[12]![0]!).toBeNull();
  });
});

describe('resolveChain', () => {
  it('a board with no chain returns empty steps', () => {
    const f = createEmptyField();
    const r = resolveChain(f);
    expect(r.steps).toEqual([]);
    expect(r.totalScore).toBe(0);
  });

  it('a 1-chain pops 4 puyos', () => {
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

  it('triggers a 2-chain', () => {
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
