import { describe, it, expect } from 'vitest';
import { makeRng, randomPair } from '../rng';

describe('makeRng', () => {
  it('同じシードは同じ列を生成する', () => {
    const a = makeRng(42);
    const b = makeRng(42);
    for (let i = 0; i < 5; i++) expect(a.next()).toBe(b.next());
  });
  it('異なるシードは異なる列を生成する', () => {
    const a = makeRng(1);
    const b = makeRng(2);
    expect(a.next()).not.toBe(b.next());
  });
});

describe('randomPair', () => {
  it('有効な色のツモを返す', () => {
    const rng = makeRng(7);
    const p = randomPair(rng);
    expect(['R', 'B', 'Y', 'P']).toContain(p.axis);
    expect(['R', 'B', 'Y', 'P']).toContain(p.child);
  });
});
