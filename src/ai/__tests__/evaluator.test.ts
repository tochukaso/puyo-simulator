import { describe, it, expect } from 'vitest';
import { columnHeights, heightVariance, dangerPenalty, chainPotential, connectionSeed, evaluateField, DEFAULT_WEIGHTS } from '../heuristic/evaluator';
import { createEmptyField, withCell } from '../../game/field';
import { ROWS } from '../../game/constants';

describe('columnHeights', () => {
  it('all columns are 0 on an empty board', () => {
    const f = createEmptyField();
    expect(columnHeights(f)).toEqual([0, 0, 0, 0, 0, 0]);
  });
  it('returns the correct highest point for each column', () => {
    let f = createEmptyField();
    f = withCell(f, ROWS - 1, 0, 'R');
    f = withCell(f, ROWS - 3, 2, 'B');
    const h = columnHeights(f);
    expect(h[0]).toBe(1);
    expect(h[2]).toBe(3);
  });
});

describe('heightVariance', () => {
  it('larger height differences give larger variance', () => {
    const flat = [3, 3, 3, 3, 3, 3];
    const bumpy = [0, 6, 0, 6, 0, 6];
    expect(heightVariance(bumpy)).toBeGreaterThan(heightVariance(flat));
  });
});

describe('dangerPenalty', () => {
  it('the higher the third column, the larger the penalty', () => {
    expect(dangerPenalty([0, 0, 0, 0, 0, 0])).toBe(0);
    expect(dangerPenalty([0, 0, 10, 0, 0, 0])).toBeGreaterThan(0);
  });
});

describe('chainPotential (measured via virtual drop)', () => {
  it('with 3 connected, a virtual R drop can trigger and potential > 0', () => {
    let f = createEmptyField();
    f = withCell(f, 12, 0, 'R');
    f = withCell(f, 12, 1, 'R');
    f = withCell(f, 12, 2, 'R');
    expect(chainPotential(f)).toBeGreaterThan(0);
  });
  it('an empty board returns 0', () => {
    expect(chainPotential(createEmptyField())).toBe(0);
  });
  it('three separated puyos (cannot become adjacent) give potential=0', () => {
    let f = createEmptyField();
    f = withCell(f, 12, 0, 'R');
    f = withCell(f, 12, 3, 'R');
    f = withCell(f, 12, 5, 'R');
    expect(chainPotential(f)).toBe(0);
  });
  it('a larger chain seed gives larger potential', () => {
    // 2-chain seed: bottom row R×3, upper row (vertical) B×3, plus an adjacent B×1.
    let twoChain = createEmptyField();
    twoChain = withCell(twoChain, 12, 0, 'R');
    twoChain = withCell(twoChain, 12, 1, 'R');
    twoChain = withCell(twoChain, 12, 2, 'R');
    twoChain = withCell(twoChain, 11, 0, 'B');
    twoChain = withCell(twoChain, 11, 1, 'B');
    twoChain = withCell(twoChain, 11, 2, 'B');
    twoChain = withCell(twoChain, 10, 3, 'B');

    // 1-chain only: bottom row R×3.
    let oneChain = createEmptyField();
    oneChain = withCell(oneChain, 12, 0, 'R');
    oneChain = withCell(oneChain, 12, 1, 'R');
    oneChain = withCell(oneChain, 12, 2, 'R');

    expect(chainPotential(twoChain)).toBeGreaterThan(chainPotential(oneChain));
  });
});

describe('connectionSeed', () => {
  it('more 2- and 3-connected groups give a larger seed score', () => {
    let f1 = createEmptyField();
    f1 = withCell(f1, 12, 0, 'R'); f1 = withCell(f1, 12, 1, 'R');
    let f2 = createEmptyField();
    f2 = withCell(f2, 12, 0, 'R');
    expect(connectionSeed(f1)).toBeGreaterThan(connectionSeed(f2));
  });
});

describe('evaluateField', () => {
  it('a tall board scores lower, a flat board scores higher', () => {
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
