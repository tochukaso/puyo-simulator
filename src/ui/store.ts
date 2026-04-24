import { create } from 'zustand';
import type { GameState, Input, Move, ChainStep } from '../game/types';
import { createInitialState, spawnNext } from '../game/state';
import { applyInput } from '../game/moves';
import { resolveChain } from '../game/chain';
import { lockActive } from '../game/landing';
import { canPlace } from '../game/pair';

interface Store {
  game: GameState;
  animatingSteps: ChainStep[];
  history: GameState[];
  reset(seed?: number): void;
  dispatch(input: Input): void;
  commit(move: Move): Promise<void>;
  undo(steps?: number): void;
  canUndo(): boolean;
}

const STEP_MS = 400;
const MAX_HISTORY = 100;

export const useGameStore = create<Store>((set, get) => ({
  game: createInitialState(Date.now() | 0),
  animatingSteps: [],
  history: [],
  reset: (seed?: number) =>
    set({
      game: createInitialState(seed ?? (Date.now() | 0)),
      animatingSteps: [],
      history: [],
    }),
  dispatch: (input: Input) => set((s) => ({ game: applyInput(s.game, input) })),
  commit: async (move: Move) => {
    const s = get().game;
    if (!s.current) return;
    // spawn 基準で合法性をチェック(current.axisRow がユーザ操作でズレていても
    // AI 推奨手が適用できるように)。lockActive は列の最下空マスを使うので
    // axisRow に依存しない。
    const placed = {
      ...s.current,
      axisRow: 0,
      axisCol: move.axisCol,
      rotation: move.rotation,
    };
    if (!canPlace(s.field, placed)) return;

    const locked = lockActive(s.field, placed);
    const { finalField, steps } = resolveChain(locked);

    const priorHistory = get().history;
    const newHistory = [...priorHistory, s].slice(-MAX_HISTORY);

    set({
      game: { ...s, field: locked, current: null, status: 'resolving' },
      animatingSteps: steps,
      history: newHistory,
    });

    let score = s.score;
    for (const step of steps) {
      await sleep(STEP_MS);
      score += step.scoreDelta;
      set((st) => ({
        game: { ...st.game, field: step.afterGravity, chainCount: step.chainIndex, score },
      }));
    }

    const finalState: GameState = {
      ...get().game,
      field: finalField,
      score,
      chainCount: steps.length,
      totalChains: s.totalChains + steps.length,
      status: 'resolving',
    };
    set({ game: spawnNext(finalState), animatingSteps: [] });
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
    });
  },
  canUndo: () => get().history.length > 0 && get().animatingSteps.length === 0,
}));

function sleep(ms: number) {
  return new Promise<void>((r) => setTimeout(r, ms));
}
