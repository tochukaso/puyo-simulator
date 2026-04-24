import { describe, it, expect } from 'vitest';
import { columnHeights, heightVariance, dangerPenalty } from '../heuristic/evaluator';
import { createEmptyField, withCell } from '../../game/field';

describe('columnHeights', () => {
  it('空盤面は全列 0', () => {
    const f = createEmptyField();
    expect(columnHeights(f)).toEqual([0, 0, 0, 0, 0, 0]);
  });
  it('各列の最高地点を正しく返す', () => {
    let f = createEmptyField();
    f = withCell(f, 12, 0, 'R');
    f = withCell(f, 10, 2, 'B');
    const h = columnHeights(f);
    expect(h[0]).toBe(1);
    expect(h[2]).toBe(3);
  });
});

describe('heightVariance', () => {
  it('差が大きいほど大きい', () => {
    const flat = [3, 3, 3, 3, 3, 3];
    const bumpy = [0, 6, 0, 6, 0, 6];
    expect(heightVariance(bumpy)).toBeGreaterThan(heightVariance(flat));
  });
});

describe('dangerPenalty', () => {
  it('3列目が高いほど大きい', () => {
    expect(dangerPenalty([0, 0, 0, 0, 0, 0])).toBe(0);
    expect(dangerPenalty([0, 0, 10, 0, 0, 0])).toBeGreaterThan(0);
  });
});
