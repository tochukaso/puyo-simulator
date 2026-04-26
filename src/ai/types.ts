import type { GameState, Move } from '../game/types';

export interface PuyoAI {
  readonly name: string;
  readonly version: string;
  init(): Promise<void>;
  suggest(state: GameState, topK: number): Promise<Move[]>;
}

export type AiKind = 'heuristic' | 'ml-v1' | 'ml-ama-v1' | 'ml-ama-v2-search' | 'ml-ama-v3-search' | 'ama-wasm';
