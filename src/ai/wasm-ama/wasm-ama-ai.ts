import type { PuyoAI } from '../types';
import type { GameState, Move, Rotation } from '../../game/types';
import { AI_VIEW_ROWS, AI_ROW_OFFSET } from '../../game/constants';
import {
  loadAmaModule,
  setAmaPreset,
  type AmaModule,
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
// Garbage / ojama. ama の wasm_api は現状 'G' を NONE 扱いするが、将来的に
// 'G' → cell::Type::GARBAGE の認識が入ったら自動で活きるよう、こちら側で
// 先に文字を送っておく (`docs/TODO.md` 参照)。
const CHAR_G = 71;

// 単一 WASM バイナリで全 form (GTR / FRON / SGTR / KAIDAN) をカバーし、
// preset (weights + 有効 form) を実行時に切り替える。
export class WasmAmaAI implements PuyoAI {
  readonly name = 'ama-wasm';
  get version(): string {
    return `ama-wasm-${this.preset}-v1`;
  }

  private module: AmaModule | null = null;
  private suggestFn: ((...args: unknown[]) => number) | null = null;
  private legalMovesFn: ((...args: unknown[]) => number) | null = null;
  private fieldBuf = 0;
  private outBuf = 0;
  // ama_legal_moves 用の独立した out buffer (= 22 候補 × 2 byte = 44 byte)。
  // ama_suggest の outBuf (40 byte) と layout が違うので別 alloc。
  private legalMovesBuf = 0;
  private loading: Promise<void> | null = null;
  preset: string;

  constructor(preset: string = 'build') {
    this.preset = preset;
  }

  async init(): Promise<void> {
    if (this.module) {
      await setAmaPreset(this.preset);
      return;
    }
    if (this.loading) {
      await this.loading;
      await setAmaPreset(this.preset);
      return;
    }
    this.loading = (async () => {
      const m = await loadAmaModule(this.preset);
      this.suggestFn = m.cwrap('ama_suggest', 'number', [
        'number', 'number', 'number', 'number', 'number', 'number', 'number', 'number',
      ]);
      // ama_legal_moves(field_chars, ca, cc, out) → number。 全 legal moves
      // を 1 回呼びで取得 (golden test 用)。
      this.legalMovesFn = m.cwrap('ama_legal_moves', 'number', [
        'number', 'number', 'number', 'number',
      ]);
      this.fieldBuf = m._malloc(FIELD_BUFFER_BYTES);
      this.outBuf = m._malloc(OUT_BUFFER_BYTES);
      this.legalMovesBuf = m._malloc(44); // 22 * 2 byte
      this.module = m;
    })();
    try {
      await this.loading;
    } finally {
      this.loading = null;
    }
    await setAmaPreset(this.preset);
  }

  async setPreset(preset: string): Promise<void> {
    this.preset = preset;
    if (this.module) await setAmaPreset(preset);
  }

  // Encodes the field into `this.fieldBuf`. Reused by suggest and legalMoves.
  private encodeField(state: GameState): void {
    const m = this.module!;
    const heap = m.HEAPU8;
    // The wasm ama binary expects a 13-row field. The game now stores 14 rows
    // (with one extra row above the old top) — drop that top row by reading
    // from r + AI_ROW_OFFSET.
    for (let r = 0; r < AI_VIEW_ROWS; r++) {
      const row = state.field.cells[r + AI_ROW_OFFSET]!;
      for (let c = 0; c < 6; c++) {
        const cell = row[c];
        let ch = CHAR_DOT;
        if (cell === 'R') ch = CHAR_R;
        else if (cell === 'B') ch = CHAR_B;
        else if (cell === 'Y') ch = CHAR_Y;
        else if (cell === 'P') ch = CHAR_P;
        else if (cell === 'G') ch = CHAR_G;
        heap[this.fieldBuf + r * 6 + c] = ch;
      }
    }
  }

  // Encodes the state into the WASM buffers and calls ama_suggest.
  // Returns the number of candidates the WASM produced (0 means no result).
  private callSuggest(state: GameState): number {
    this.encodeField(state);

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
      // out buffer layout: [axisCol, rotation, score(int32 LE), expectedChain, _]
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

  /**
   * 本家挙動準拠の全 legal moves を ama から取得する (golden test 用)。
   * 戻り値は (axisCol, rotation) の Move[]。 score / expectedChain は無し
   * (= ama 内部の `move::generate` がスコア無しで全配置を返す API のため)。
   * 同色ペア時は ama 内部で重複 (UP/DOWN, LEFT/RIGHT) を de-dup するので、
   * 戻り値の rotation は色によって UP+RIGHT (= 14 通り) or 全 4 方向
   * (= 22 通り) に絞られる点に注意。
   */
  async legalMoves(state: GameState): Promise<Move[]> {
    await this.init();
    if (!state.current) return [];
    this.encodeField(state);
    const cur = state.current.pair;
    const code = (s: string) => s.charCodeAt(0);
    const ret = this.legalMovesFn!(
      this.fieldBuf,
      code(cur.axis),
      code(cur.child),
      this.legalMovesBuf,
    );
    if (ret <= 0) return [];
    const heap = this.module!.HEAPU8;
    const moves: Move[] = [];
    for (let i = 0; i < ret; i++) {
      const p = this.legalMovesBuf + i * 2;
      moves.push({
        axisCol: heap[p + 0]!,
        rotation: heap[p + 1]! as Rotation,
      });
    }
    return moves;
  }

  dispose(): void {
    if (this.module) {
      if (this.fieldBuf) this.module._free(this.fieldBuf);
      if (this.outBuf) this.module._free(this.outBuf);
      if (this.legalMovesBuf) this.module._free(this.legalMovesBuf);
      this.fieldBuf = 0;
      this.outBuf = 0;
    }
  }
}
