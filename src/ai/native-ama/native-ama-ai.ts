import type { PuyoAI } from '../types';
import type { GameState, Move, Rotation } from '../../game/types';
import {
  invokeAmaSuggest,
  isTauri,
  type NativeSuggestion,
} from './tauri-bridge';

export interface NativeAmaResult {
  axisCol: number;
  rotation: number;
  score: number;
  expectedChain: number;
}

export class NativeAmaAI implements PuyoAI {
  readonly name = 'ama-native';
  readonly version = 'ama-native-build-v1';

  static isAvailable(): boolean {
    return isTauri();
  }

  async init(): Promise<void> {
    // Rust side OnceLock initialises on first invoke; nothing to do here.
  }

  async suggest(state: GameState, topK: number): Promise<Move[]> {
    if (!state.current) return [];
    const r = await this.callSuggest(state);
    if (!r) return [];
    const move: Move = {
      axisCol: r.axisCol,
      rotation: r.rotation as Rotation,
      score: r.score | 0,
    };
    return [move].slice(0, topK);
  }

  async suggestWithScores(state: GameState, _topK: number): Promise<NativeAmaResult[]> {
    if (!state.current) return [];
    const r = await this.callSuggest(state);
    return r ? [r] : [];
  }

  private async callSuggest(state: GameState): Promise<NativeSuggestion | null> {
    const cur = state.current!.pair;
    const n1 = state.nextQueue[0]!;
    const n2 = state.nextQueue[1]!;

    let field = '';
    for (let r = 0; r < 13; r++) {
      const row = state.field.cells[r]!;
      for (let c = 0; c < 6; c++) {
        const cell = row[c];
        field +=
          cell === 'R' || cell === 'B' || cell === 'Y' || cell === 'P'
            ? cell
            : '.';
      }
    }

    try {
      return await invokeAmaSuggest({
        field,
        current: [cur.axis, cur.child],
        next1: [n1.axis, n1.child],
        next2: [n2.axis, n2.child],
      });
    } catch (e) {
      console.error('[ama-native] invoke failed:', e);
      return null;
    }
  }

  dispose(): void {
    // Process-lifetime FFI; nothing to dispose.
  }
}
