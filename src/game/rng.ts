import type { Pair, Color } from './types';

// A direct port of the real Puyo eSport RNG (ama/core/cell.h::create_queue).
// 1 seed → a deterministic queue of 128 pairs.
//
// Color mapping: ama 0=R, 1=Y, 2=G, 3=B → ours 0=R, 1=Y, 2=P, 3=B
//   (their Green is our Purple — purely a label difference, same logic).

const COLOR_MAP: readonly Color[] = ['R', 'Y', 'P', 'B'] as const;

function makeLcg(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (Math.imul(s, 0x5d588b65) + 0x269ec3) >>> 0;
    return s;
  };
}

export function makeEsportQueue(seed: number): readonly Pair[] {
  const rng = makeLcg(seed);
  for (let i = 0; i < 5; i++) rng();

  const queues: number[][] = [
    new Array(256).fill(0),
    new Array(256).fill(0),
    new Array(256).fill(0),
  ];
  for (let mode = 0; mode < 3; mode++) {
    const base = mode + 3; // 3, 4, 5 colors
    for (let i = 0; i < 256; i++) queues[mode]![i] = i % base;
  }

  for (let mode = 0; mode < 3; mode++) {
    const q = queues[mode]!;
    for (let col = 0; col < 15; col++) {
      for (let i = 0; i < 8; i++) {
        const n1 = (rng() >>> 28) + col * 16;
        const n2 = (rng() >>> 28) + (col + 1) * 16;
        const t = q[n1]!;
        q[n1] = q[n2]!;
        q[n2] = t;
      }
    }
    for (let col = 0; col < 7; col++) {
      for (let i = 0; i < 16; i++) {
        const n1 = (rng() >>> 27) + col * 32;
        const n2 = (rng() >>> 27) + (col + 1) * 32;
        const t = q[n1]!;
        q[n1] = q[n2]!;
        q[n2] = t;
      }
    }
    for (let col = 0; col < 3; col++) {
      for (let i = 0; i < 32; i++) {
        const n1 = (rng() >>> 26) + col * 64;
        const n2 = (rng() >>> 26) + (col + 1) * 64;
        const t = q[n1]!;
        q[n1] = q[n2]!;
        q[n2] = t;
      }
    }
  }

  for (let i = 0; i < 4; i++) {
    queues[1]![i] = queues[0]![i]!;
    queues[2]![i] = queues[0]![i]!;
  }

  const m1 = queues[1]!;
  const result: Pair[] = [];
  for (let i = 0; i < 128; i++) {
    result.push({
      axis: COLOR_MAP[m1[i * 2]!]!,
      child: COLOR_MAP[m1[i * 2 + 1]!]!,
    });
  }
  return result;
}

const cache = new Map<number, readonly Pair[]>();

export function getEsportQueue(seed: number): readonly Pair[] {
  const key = seed >>> 0;
  let q = cache.get(key);
  if (!q) {
    q = makeEsportQueue(key);
    cache.set(key, q);
  }
  return q;
}
