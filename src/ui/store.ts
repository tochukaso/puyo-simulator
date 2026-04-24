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
  reset(seed?: number): void;
  dispatch(input: Input): void;
  commit(move: Move): Promise<void>;
}

const STEP_MS = 400;

export const useGameStore = create<Store>((set, get) => ({
  game: createInitialState(Date.now() | 0),
  animatingSteps: [],
  reset: (seed?: number) =>
    set({
      game: createInitialState(seed ?? (Date.now() | 0)),
      animatingSteps: [],
    }),
  dispatch: (input: Input) => set((s) => ({ game: applyInput(s.game, input) })),
  commit: async (move: Move) => {
    const s = get().game;
    if (!s.current) return;
    const placed = { ...s.current, axisCol: move.axisCol, rotation: move.rotation };
    if (!canPlace(s.field, placed)) return;

    const locked = lockActive(s.field, placed);
    const { finalField, steps } = resolveChain(locked);

    set({ game: { ...s, field: locked, current: null, status: 'resolving' }, animatingSteps: steps });

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
}));

function sleep(ms: number) {
  return new Promise<void>((r) => setTimeout(r, ms));
}
