export interface AmaCandidate {
  axisCol: number;
  rotation: number;
  score: number;
  expectedChain: number;
}

export const OUT_BUFFER_BYTES = 40;
export const FIELD_BUFFER_BYTES = 78;
export const MAX_CANDIDATES = 5;
