import { create } from 'zustand';
import type { GameState, Input, Move, ChainStep } from '../game/types';
import { createInitialState, spawnNext } from '../game/state';
import { applyInput } from '../game/moves';
import { resolveChain } from '../game/chain';
import { lockActive } from '../game/landing';

export interface PoppingCell {
  row: number;
  col: number;
}

interface Store {
  game: GameState;
  animatingSteps: ChainStep[];
  /** 今まさに消えようとしているセル(highlight phase で光らせる) */
  poppingCells: PoppingCell[];
  history: GameState[];
  reset(seed?: number): void;
  dispatch(input: Input): void;
  commit(move: Move): Promise<void>;
  undo(steps?: number): void;
  canUndo(): boolean;
}

// 連鎖ステップのタイミング。ユーザが「ぷよがだんだん消える」実感を得られる長さにしている。
const LOCK_PAUSE_MS = 200; // ツモが着地してから最初の連鎖チェックまで
const HIGHLIGHT_MS = 400; // 消えるぷよを点滅強調する時間
const POP_MS = 150; // ぷよが盤面から消えた直後(重力落下前)を見せる時間
const GRAVITY_MS = 300; // 重力落下後の余韻

const MAX_HISTORY = 100;

export const useGameStore = create<Store>((set, get) => ({
  game: createInitialState(Date.now() | 0),
  animatingSteps: [],
  poppingCells: [],
  history: [],
  reset: (seed?: number) =>
    set({
      game: createInitialState(seed ?? (Date.now() | 0)),
      animatingSteps: [],
      poppingCells: [],
      history: [],
    }),
  dispatch: (input: Input) => set((s) => ({ game: applyInput(s.game, input) })),
  commit: async (move: Move) => {
    const s = get().game;
    if (!s.current) return;
    // ぷよぷよ通信(eスポーツ)ルール:跨ぎ禁止は適用しない。任意の (axisCol,
    // rotation) を直接配置できる(壁キック/瞬間移動相当)。

    const placed = {
      ...s.current,
      axisCol: move.axisCol,
      rotation: move.rotation,
    };

    const locked = lockActive(s.field, placed);
    const { finalField, steps } = resolveChain(locked);

    const priorHistory = get().history;
    const newHistory = [...priorHistory, s].slice(-MAX_HISTORY);

    // 着地直後の盤面を表示
    set({
      game: { ...s, field: locked, current: null, status: 'resolving' },
      animatingSteps: steps,
      poppingCells: [],
      history: newHistory,
    });

    if (steps.length > 0) {
      await sleep(LOCK_PAUSE_MS);
    }

    let score = s.score;
    let maxChain = s.maxChain;
    for (const step of steps) {
      // Phase A: 消える直前(まだぷよはある)+ 点滅ハイライト
      set((st) => ({
        game: { ...st.game, field: step.beforeField },
        poppingCells: step.popped.map((p) => ({ row: p.row, col: p.col })),
      }));
      await sleep(HIGHLIGHT_MS);

      // Phase B: ぷよが消えた直後(重力落下前)
      set((st) => ({
        game: { ...st.game, field: step.afterPop },
        poppingCells: [],
      }));
      await sleep(POP_MS);

      // Phase C: 重力落下 + スコア反映
      score += step.scoreDelta;
      maxChain = Math.max(maxChain, step.chainIndex);
      set((st) => ({
        game: {
          ...st.game,
          field: step.afterGravity,
          chainCount: step.chainIndex,
          score,
          maxChain,
        },
      }));
      await sleep(GRAVITY_MS);
    }

    const finalState: GameState = {
      ...get().game,
      field: finalField,
      score,
      chainCount: steps.length,
      totalChains: s.totalChains + steps.length,
      maxChain,
      status: 'resolving',
    };
    set({ game: spawnNext(finalState), animatingSteps: [], poppingCells: [] });
  },
  undo: (steps = 1) => {
    const { history, animatingSteps } = get();
    if (history.length === 0) return;
    if (animatingSteps.length > 0) return;
    const n = Math.min(Math.max(1, steps), history.length);
    const targetIndex = history.length - n;
    const target = history[targetIndex]!;
    set({
      game: target,
      history: history.slice(0, targetIndex),
      animatingSteps: [],
      poppingCells: [],
    });
  },
  canUndo: () => get().history.length > 0 && get().animatingSteps.length === 0,
}));

function sleep(ms: number) {
  return new Promise<void>((r) => setTimeout(r, ms));
}

// Dev-only: expose store on window for debugging (e.g. __store__.getState().reset(1))
if (import.meta.env.DEV && typeof window !== 'undefined') {
  (window as unknown as { __store__: typeof useGameStore }).__store__ = useGameStore;
}
