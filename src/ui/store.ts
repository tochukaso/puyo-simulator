import { create } from 'zustand';
import type { GameState, Input, Move } from '../game/types';
import { createInitialState, commitMove } from '../game/state';
import { applyInput } from '../game/moves';

interface Store {
  game: GameState;
  reset(seed?: number): void;
  dispatch(input: Input): void;
  commit(move: Move): void;
}

export const useGameStore = create<Store>((set) => ({
  game: createInitialState(Date.now() | 0),
  reset: (seed?: number) => set({ game: createInitialState(seed ?? (Date.now() | 0)) }),
  dispatch: (input: Input) => set((s) => ({ game: applyInput(s.game, input) })),
  commit: (move: Move) => set((s) => ({ game: commitMove(s.game, move) })),
}));
