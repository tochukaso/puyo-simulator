import type { PuyoAI } from '../types';
import type { GameState, Move } from '../../game/types';
import { encodeState } from './encoding';
import { actionIndexToMove } from '../../game/action';

interface TfModel {
  predict(inputs: unknown): unknown;
  dispose(): void;
}

const MODEL_URL = '/models/policy-v1/model.json';

export class MlAI implements PuyoAI {
  readonly name = 'ml';
  readonly version = 'policy-v1';
  private model: TfModel | null = null;
  private loading: Promise<void> | null = null;

  async init(): Promise<void> {
    if (this.model) return;
    if (this.loading) {
      await this.loading;
      return;
    }
    this.loading = this.loadModel();
    try {
      await this.loading;
    } finally {
      this.loading = null;
    }
  }

  private async loadModel(): Promise<void> {
    const tf = await import('@tensorflow/tfjs');
    const model = await tf.loadGraphModel(MODEL_URL);
    this.model = model as unknown as TfModel;
    const board = tf.zeros([1, 13, 6, 7]);
    const queue = tf.zeros([1, 16]);
    const warm = model.predict([board, queue]) as unknown as { dispose: () => void }[];
    for (const t of warm) t.dispose();
    board.dispose();
    queue.dispose();
  }

  async suggest(state: GameState, topK: number): Promise<Move[]> {
    if (!this.model) return [];
    if (state.current === null) return [];
    const { board, queue, legalMask } = encodeState(state);
    const tf = await import('@tensorflow/tfjs');
    const boardT = tf.tensor(board, [1, 13, 6, 7]);
    const queueT = tf.tensor(queue, [1, 16]);
    const outs = this.model.predict([boardT, queueT]) as unknown as Array<{
      size: number;
      data(): Promise<Float32Array>;
      dispose(): void;
    }>;
    // Output order from onnx2tf is not guaranteed; identify by tensor size
    // (policy = 22, value = 1).
    const logitsT = outs.find((t) => t.size === 22)!;
    const valueT = outs.find((t) => t.size === 1)!;
    const [logits, valueArr] = await Promise.all([logitsT.data(), valueT.data()]);
    boardT.dispose();
    queueT.dispose();
    for (const t of outs) t.dispose();

    return pickTopK(logits, valueArr[0] ?? 0, legalMask, topK);
  }

  /** @internal test-only */
  __setModelForTest(m: TfModel): void {
    this.model = m;
  }
}

function pickTopK(
  logits: Float32Array,
  value: number,
  legalMask: Uint8Array,
  topK: number,
): Move[] {
  const masked = new Float32Array(logits.length);
  let maxLogit = -Infinity;
  for (let i = 0; i < logits.length; i++) {
    if (legalMask[i] === 1) {
      masked[i] = logits[i]!;
      if (masked[i]! > maxLogit) maxLogit = masked[i]!;
    } else {
      masked[i] = -Infinity;
    }
  }
  const probs = new Float32Array(logits.length);
  let sum = 0;
  for (let i = 0; i < logits.length; i++) {
    probs[i] = masked[i]! === -Infinity ? 0 : Math.exp(masked[i]! - maxLogit);
    sum += probs[i]!;
  }
  if (sum > 0) {
    for (let i = 0; i < probs.length; i++) probs[i] = probs[i]! / sum;
  }

  const entries: { idx: number; p: number }[] = [];
  for (let i = 0; i < probs.length; i++) {
    if (legalMask[i] === 1 && probs[i]! > 0) entries.push({ idx: i, p: probs[i]! });
  }
  entries.sort((a, b) => b.p - a.p);
  return entries.slice(0, topK).map((e) => {
    const m = actionIndexToMove(e.idx);
    return {
      axisCol: m.axisCol,
      rotation: m.rotation,
      score: e.p,
      reason: `p=${e.p.toFixed(2)} v=${value >= 0 ? '+' : ''}${value.toFixed(2)}`,
    };
  });
}
