import type { PuyoAI } from '../types';
import type { GameState, Move, Color, Rotation } from '../../game/types';
import { encodeState, BOARD_CHANNELS, QUEUE_DIM } from './encoding';
import { actionIndexToMove, ACTION_COUNT } from '../../game/action';
import { commitMove } from '../../game/state';
import { ROWS, COLS } from '../../game/constants';

interface TfNS {
  loadGraphModel(url: string): Promise<unknown>;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  tensor(data: Float32Array | number[], shape: number[]): any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  zeros(shape: number[]): any;
}

interface TfModel {
  predict(inputs: unknown): unknown;
  dispose(): void;
}

interface ChanceBranch {
  pair: [Color, Color];
  weight: number;
}

const CHANCE_BRANCHES: ChanceBranch[] = [
  { pair: ['R', 'R'], weight: 0.25 }, // canonical color 0,0 (same color rep)
  { pair: ['R', 'B'], weight: 0.75 }, // canonical 0,1 (different color rep)
];

export interface MlSearchOpts {
  modelUrl: string;
  K?: number;
  // For Node side use, allow injecting a tfjs module so the search runs in Node.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  tf?: any;
  modelLoader?: (url: string) => Promise<TfModel>;
}

export class MlSearchAI implements PuyoAI {
  readonly name = 'ml-search';
  readonly version: string;
  private model: TfModel | null = null;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private tf: any = null;
  private readonly K: number;
  private readonly opts: MlSearchOpts;

  constructor(opts: MlSearchOpts) {
    this.opts = opts;
    this.K = opts.K ?? 6;
    this.version = `policy-ama-v2-search-K${this.K}`;
  }

  async init(): Promise<void> {
    if (this.model) return;
    if (this.opts.tf && this.opts.modelLoader) {
      this.tf = this.opts.tf;
      this.model = await this.opts.modelLoader(this.opts.modelUrl);
    } else {
      const mod = await import('@tensorflow/tfjs');
      this.tf = mod;
      this.model = (await mod.loadGraphModel(this.opts.modelUrl)) as unknown as TfModel;
    }
  }

  async suggest(state: GameState, topK: number): Promise<Move[]> {
    await this.init();
    if (!state.current) return [];

    // Depth 1: from root, evaluate all legal placements via policy. Pick top-K.
    const rootCands = await this.expand(state);
    if (rootCands.length === 0) return [];

    const scored: { move: Move; expValue: number }[] = [];
    for (const r1 of rootCands) {
      const next1 = applyMove(state, r1.move);
      if (next1.isTerminal) {
        scored.push({ move: r1.move, expValue: -1 + next1.scoreSoFar / 50000 });
        continue;
      }
      const cand2 = await this.expand(next1.state);
      let bestChild = -Infinity;
      for (const r2 of cand2) {
        const next2 = applyMove(next1.state, r2.move);
        if (next2.isTerminal) {
          bestChild = Math.max(bestChild, -1 + next2.scoreSoFar / 50000);
          continue;
        }
        const cand3 = await this.expand(next2.state);
        let bestGrand = -Infinity;
        for (const r3 of cand3) {
          const next3 = applyMove(next2.state, r3.move);
          // chance node at depth 4
          let expV = 0;
          for (const ch of CHANCE_BRANCHES) {
            const stateAtChance = withReplacedNextPair(next3.state, ch.pair);
            const v = await this.evalLeaf(stateAtChance);
            expV += ch.weight * v;
          }
          bestGrand = Math.max(bestGrand, expV + next3.scoreSoFar / 50000);
        }
        bestChild = Math.max(bestChild, bestGrand);
      }
      scored.push({ move: r1.move, expValue: bestChild + next1.scoreSoFar / 50000 });
    }

    scored.sort((a, b) => b.expValue - a.expValue);
    return scored
      .slice(0, topK)
      .map((s) => ({ ...s.move, score: Math.round(s.expValue * 50000) }));
  }

  private async forward(state: GameState): Promise<{ policy: Float32Array; value: number }> {
    const { board, queue } = encodeState(state);
    const tf = this.tf!;
    const b = tf.tensor(board, [1, ROWS, COLS, BOARD_CHANNELS]);
    const q = tf.tensor(queue, [1, QUEUE_DIM]);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const out = this.model!.predict([b, q]) as any[];
    const policyT = out.find((t) => t.size === ACTION_COUNT);
    const valueT = out.find((t) => t.size === 1);
    const [pol, val] = await Promise.all([policyT.data(), valueT.data()]);
    b.dispose();
    q.dispose();
    for (const t of out) t.dispose();
    return { policy: pol as Float32Array, value: (val as Float32Array)[0] ?? 0 };
  }

  private async evalLeaf(state: GameState): Promise<number> {
    const { value } = await this.forward(state);
    return value;
  }

  private async expand(state: GameState): Promise<{ move: Move; logit: number }[]> {
    if (!state.current) return [];
    const { policy } = await this.forward(state);
    const { legalMask } = encodeState(state);
    const cands: { move: Move; logit: number }[] = [];
    for (let i = 0; i < ACTION_COUNT; i++) {
      if (!legalMask[i]) continue;
      const m = actionIndexToMove(i);
      cands.push({
        move: { axisCol: m.axisCol, rotation: m.rotation as Rotation },
        logit: policy[i] ?? -Infinity,
      });
    }
    cands.sort((a, b) => b.logit - a.logit);
    return cands.slice(0, this.K);
  }
}

function applyMove(
  state: GameState,
  move: Move,
): { state: GameState; scoreSoFar: number; isTerminal: boolean } {
  const next = commitMove(state, move);
  return {
    state: next,
    scoreSoFar: next.score - state.score,
    isTerminal: next.status === 'gameover' || !next.current,
  };
}

function withReplacedNextPair(state: GameState, pair: [Color, Color]): GameState {
  // After three deterministic moves, the "next2" position is the upcoming
  // unknown pair. Patch the state's nextQueue so the value head sees the
  // chance-node sample as if it had appeared.
  const nq = state.nextQueue.slice();
  if (nq.length === 0) return state;
  const replaced = { axis: pair[0], child: pair[1] };
  if (nq.length >= 2) nq[1] = replaced;
  else nq.push(replaced);
  return { ...state, nextQueue: nq };
}

// Re-export TfNS so it can be used externally if needed
export type { TfNS };
