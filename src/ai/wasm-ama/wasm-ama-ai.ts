import type { PuyoAI } from '../types';
import type { GameState, Move, Rotation } from '../../game/types';
import {
  loadAmaModule,
  setAmaPreset,
  type AmaModule,
  type AmaVariant,
} from './wasm-loader';
import {
  FIELD_BUFFER_BYTES,
  OUT_BUFFER_BYTES,
  MAX_CANDIDATES,
  type AmaCandidate,
} from './types';

const CHAR_DOT = 46;
const CHAR_R = 82;
const CHAR_B = 66;
const CHAR_Y = 89;
const CHAR_P = 80;

// 1 つの WasmAmaAI インスタンスは 1 つの WASM バリアント (default / gtr-only) に
// バインドされる。fieldBuf/outBuf は variant 固有の Module ヒープ上に malloc されるため、
// バリアントを跨いで使い回すことはできない。preset(重み)は variant 内で切替可能。
export class WasmAmaAI implements PuyoAI {
  readonly name = 'ama-wasm';
  get version(): string {
    return `ama-wasm-${this.variant}-${this.preset}-v1`;
  }

  private module: AmaModule | null = null;
  private suggestFn: ((...args: unknown[]) => number) | null = null;
  private fieldBuf = 0;
  private outBuf = 0;
  private loading: Promise<void> | null = null;
  preset: string;
  readonly variant: AmaVariant;

  constructor(preset: string = 'build', variant: AmaVariant = 'default') {
    this.preset = preset;
    this.variant = variant;
  }

  async init(): Promise<void> {
    if (this.module) {
      await setAmaPreset(this.variant, this.preset);
      return;
    }
    if (this.loading) {
      await this.loading;
      await setAmaPreset(this.variant, this.preset);
      return;
    }
    this.loading = (async () => {
      const m = await loadAmaModule(this.variant, this.preset);
      this.suggestFn = m.cwrap('ama_suggest', 'number', [
        'number', 'number', 'number', 'number', 'number', 'number', 'number', 'number',
      ]);
      this.fieldBuf = m._malloc(FIELD_BUFFER_BYTES);
      this.outBuf = m._malloc(OUT_BUFFER_BYTES);
      this.module = m;
    })();
    try {
      await this.loading;
    } finally {
      this.loading = null;
    }
    await setAmaPreset(this.variant, this.preset);
  }

  async setPreset(preset: string): Promise<void> {
    this.preset = preset;
    if (this.module) await setAmaPreset(this.variant, preset);
  }

  // Encodes the state into the WASM buffers and calls ama_suggest.
  // Returns the number of candidates the WASM produced (0 means no result).
  private callSuggest(state: GameState): number {
    const m = this.module!;
    const heap = m.HEAPU8;

    for (let r = 0; r < 13; r++) {
      const row = state.field.cells[r]!;
      for (let c = 0; c < 6; c++) {
        const cell = row[c];
        let ch = CHAR_DOT;
        if (cell === 'R') ch = CHAR_R;
        else if (cell === 'B') ch = CHAR_B;
        else if (cell === 'Y') ch = CHAR_Y;
        else if (cell === 'P') ch = CHAR_P;
        heap[this.fieldBuf + r * 6 + c] = ch;
      }
    }

    const cur = state.current!.pair;
    const n1 = state.nextQueue[0]!;
    const n2 = state.nextQueue[1]!;
    const code = (s: string) => s.charCodeAt(0);

    const ret = this.suggestFn!(
      this.fieldBuf,
      code(cur.axis), code(cur.child),
      code(n1.axis), code(n1.child),
      code(n2.axis), code(n2.child),
      this.outBuf,
    );
    return ret > 0 ? ret : 0;
  }

  async suggest(state: GameState, topK: number): Promise<Move[]> {
    await this.init();
    if (!state.current) return [];
    const ret = this.callSuggest(state);
    if (ret === 0) return [];
    const n = Math.min(ret, MAX_CANDIDATES, topK);
    const heap = this.module!.HEAPU8;
    const moves: Move[] = [];
    for (let i = 0; i < n; i++) {
      const p = this.outBuf + i * 8;
      // out バッファ内訳: [axisCol, rotation, score(int32 LE), expectedChain, _]
      const score =
        heap[p + 2]! |
        (heap[p + 3]! << 8) |
        (heap[p + 4]! << 16) |
        (heap[p + 5]! << 24);
      moves.push({
        axisCol: heap[p + 0]!,
        rotation: heap[p + 1]! as Rotation,
        score: score | 0,
      });
    }
    return moves;
  }

  // Future use: surface ama's score and expected chain count for the UI overlay.
  async suggestWithScores(state: GameState, topK: number): Promise<AmaCandidate[]> {
    await this.init();
    if (!state.current) return [];
    const ret = this.callSuggest(state);
    if (ret === 0) return [];
    const n = Math.min(ret, MAX_CANDIDATES, topK);
    const heap = this.module!.HEAPU8;
    const out: AmaCandidate[] = [];
    for (let i = 0; i < n; i++) {
      const p = this.outBuf + i * 8;
      const score =
        heap[p + 2]! |
        (heap[p + 3]! << 8) |
        (heap[p + 4]! << 16) |
        (heap[p + 5]! << 24);
      out.push({
        axisCol: heap[p + 0]!,
        rotation: heap[p + 1]!,
        score: score | 0,
        expectedChain: heap[p + 6]!,
      });
    }
    return out;
  }

  dispose(): void {
    if (this.module) {
      if (this.fieldBuf) this.module._free(this.fieldBuf);
      if (this.outBuf) this.module._free(this.outBuf);
      this.fieldBuf = 0;
      this.outBuf = 0;
    }
  }
}
