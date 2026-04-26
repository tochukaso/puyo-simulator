// Standard seed set for repeatable AI eval. One preset, intentionally —
// branching the seed set across runs makes histories incomparable.
export const STANDARD = {
  base: 0,
  count: 20,
  maxMoves: 500,
} as const;

export type Preset = typeof STANDARD;

export function expandSeeds(p: { base: number; count: number }): number[] {
  return Array.from({ length: p.count }, (_, i) => p.base + i);
}
