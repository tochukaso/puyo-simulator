import { describe, it, expect } from 'vitest';
import { columnHeights, heightVariance, dangerPenalty, chainPotential, connectionSeed, evaluateField, DEFAULT_WEIGHTS } from '../heuristic/evaluator';
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

describe('chainPotential', () => {
  it('連鎖できる盤面では 0 より大きい', () => {
    let f = createEmptyField();
    f = withCell(f, 12, 0, 'R');
    f = withCell(f, 12, 1, 'R');
    f = withCell(f, 12, 2, 'R');
    f = withCell(f, 12, 3, 'R');
    expect(chainPotential(f)).toBeGreaterThan(0);
  });
  it('何もない盤面は 0', () => {
    expect(chainPotential(createEmptyField())).toBe(0);
  });
});

describe('connectionSeed', () => {
  it('2〜3 連結が多いほど大きい', () => {
    let f1 = createEmptyField();
    f1 = withCell(f1, 12, 0, 'R'); f1 = withCell(f1, 12, 1, 'R');
    let f2 = createEmptyField();
    f2 = withCell(f2, 12, 0, 'R');
    expect(connectionSeed(f1)).toBeGreaterThan(connectionSeed(f2));
  });
});

describe('evaluateField', () => {
  it('高い盤面は低スコア、平らな盤面は高スコア', () => {
    let flat = createEmptyField();
    flat = withCell(flat, 12, 0, 'R');
    flat = withCell(flat, 12, 1, 'B');
    flat = withCell(flat, 12, 2, 'Y');
    flat = withCell(flat, 12, 3, 'P');
    flat = withCell(flat, 12, 4, 'R');
    flat = withCell(flat, 12, 5, 'B');

    let tall = createEmptyField();
    const colors = ['R', 'B', 'Y', 'P', 'R', 'B'] as const;
    for (let r = 7; r <= 12; r++) tall = withCell(tall, r, 2, colors[12 - r]!);

    expect(evaluateField(flat, DEFAULT_WEIGHTS)).toBeGreaterThan(evaluateField(tall, DEFAULT_WEIGHTS));
  });
});
