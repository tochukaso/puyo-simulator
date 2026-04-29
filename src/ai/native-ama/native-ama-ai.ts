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
  get version(): string {
    return `ama-native-${this.preset}-v1`;
  }

  preset: string = 'build';

  static isAvailable(): boolean {
    return isTauri();
  }

  async init(): Promise<void> {
    // Rust ensures init lazily on first suggest with the active preset.
  }

  async setPreset(preset: string): Promise<void> {
    console.log('[ama-native] setPreset', { from: this.preset, to: preset });
    this.preset = preset;
    // Eagerly trigger init for the new preset so AI-ready can flip true.
    // We do a no-op suggest with an empty field; the Rust side will
    // ensure_init the new preset before returning. This costs ~100ms but
    // happens only on trainer-mode change, not per move.
    const empty = '.'.repeat(78);
    try {
      const t0 = performance.now();
      await invokeAmaSuggest({
        preset,
        field: empty,
        current: ['R', 'B'],
        next1: ['Y', 'P'],
        next2: ['R', 'Y'],
      });
      console.log(
        '[ama-native] setPreset primed',
        preset,
        `${(performance.now() - t0).toFixed(0)}ms`,
      );
    } catch (e) {
      console.error('[ama-native] setPreset prime failed:', e);
    }
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
      const t0 = performance.now();
      const r = await invokeAmaSuggest({
        preset: this.preset,
        field,
        current: [cur.axis, cur.child],
        next1: [n1.axis, n1.child],
        next2: [n2.axis, n2.child],
      });
      console.log(
        '[ama-native] suggest',
        { preset: this.preset, ...r },
        `${(performance.now() - t0).toFixed(0)}ms`,
      );
      return r;
    } catch (e) {
      console.error('[ama-native] invoke failed:', e);
      return null;
    }
  }

  dispose(): void {
    // Process-lifetime FFI; nothing to dispose.
  }
}
