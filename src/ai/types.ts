import type { GameState, Move } from '../game/types';

export interface PuyoAI {
  readonly name: string;
  readonly version: string;
  init(): Promise<void>;
  suggest(state: GameState, topK: number): Promise<Move[]>;
}
