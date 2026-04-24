import type { PuyoAI } from '../src/ai/types';
import type { GameState, Move } from '../src/game/types';
import { encodeState } from '../src/ai/ml/encoding';
import { actionIndexToMove } from '../src/game/action';

export async function createNodeMlAI(modelPath: string): Promise<PuyoAI> {
  const tf = await import('@tensorflow/tfjs-node');
  const model = await tf.loadGraphModel(`file://${modelPath}`);
  return {
    name: 'ml',
    version: 'policy-v1',
    async init() {},
    async suggest(state: GameState, topK: number): Promise<Move[]> {
      if (!state.current) return [];
      const { board, queue, legalMask } = encodeState(state);
      const b = tf.tensor(board, [1, 13, 6, 7]);
      const q = tf.tensor(queue, [1, 16]);
      const outs = model.predict([b, q]) as tf.Tensor[];
      const [logits, value] = await Promise.all([outs[0]!.data(), outs[1]!.data()]);
      b.dispose();
      q.dispose();
      outs.forEach((t) => t.dispose());
      const v = Number(value[0] ?? 0);
      return pickTopK(logits as Float32Array, v, legalMask, topK);
    },
  };
}

function pickTopK(
  logits: Float32Array,
  value: number,
  mask: Uint8Array,
  topK: number,
): Move[] {
  let maxLogit = -Infinity;
  for (let i = 0; i < logits.length; i++) {
    if (mask[i] === 1 && logits[i]! > maxLogit) maxLogit = logits[i]!;
  }
  const probs: number[] = [];
  let sum = 0;
  for (let i = 0; i < logits.length; i++) {
    if (mask[i] === 1) {
      const p = Math.exp(logits[i]! - maxLogit);
      probs.push(p);
      sum += p;
    } else {
      probs.push(0);
    }
  }
  if (sum > 0) for (let i = 0; i < probs.length; i++) probs[i] = probs[i]! / sum;
  const entries = probs
    .map((p, idx) => ({ idx, p }))
    .filter((e) => e.p > 0)
    .sort((a, b) => b.p - a.p);
  return entries.slice(0, topK).map((e) => {
    const m = actionIndexToMove(e.idx);
    return {
      axisCol: m.axisCol,
      rotation: m.rotation,
      score: e.p,
      reason: `p=${e.p.toFixed(2)} v=${value.toFixed(2)}`,
    };
  });
}
