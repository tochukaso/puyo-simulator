import type { Pair, Color } from './types';

export interface Rng {
  next(): number;            // [0, 1)
  nextInt(max: number): number;
}

// Mulberry32
export function makeRng(seed: number): Rng {
  let s = seed >>> 0;
  const next = () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  return {
    next,
    nextInt: (max: number) => Math.floor(next() * max),
  };
}

const COLORS: Color[] = ['R', 'B', 'Y', 'P'];

export function randomPair(rng: Rng): Pair {
  return {
    axis: COLORS[rng.nextInt(4)]!,
    child: COLORS[rng.nextInt(4)]!,
  };
}
