import { create } from 'zustand';
import type { GameState, Field, Input, Move, ChainStep } from '../game/types';
import { ROWS, COLS } from '../game/constants';
import { createInitialState, spawnNext } from '../game/state';
import { applyInput } from '../game/moves';
import { resolveChain } from '../game/chain';
import { lockActive } from '../game/landing';

export interface PoppingCell {
  row: number;
  col: number;
}

/** 連鎖発生時に「Nれんさ!」と表示するためのオーバーレイエントリ。 */
export interface ChainTextEntry {
  id: number;
  chainIndex: number;
  /** 消えたセル群の重心。Board が overlay を絶対座標で配置するのに使う。 */
  row: number;
  col: number;
}

/** 着地直後にプヨっと弾むアニメーションを掛けるためのエントリ。 */
export interface LandedCell {
  row: number;
  col: number;
  /** Date.now() 基準の着地時刻。Board の draw が経過時間からスケールを計算する。 */
  landedAt: number;
}

interface Store {
  game: GameState;
  animatingSteps: ChainStep[];
  /** 今まさに消えようとしているセル(highlight phase で光らせる) */
  poppingCells: PoppingCell[];
  /** 連鎖テキスト("1れんさ!" 等)。CSS animation で 2 秒フェードアウト。 */
  chainTexts: ChainTextEntry[];
  /** 着地直後のぷよ。Board が squash-stretch で弾ませる。 */
  landedCells: LandedCell[];
  history: GameState[];
  reset(seed?: number): void;
  dispatch(input: Input): void;
  commit(move: Move): Promise<void>;
  undo(steps?: number): void;
  canUndo(): boolean;
}

const CHAIN_TEXT_LIFETIME_MS = 2000;
export const LANDING_BOUNCE_MS = 280;
let chainTextIdSeq = 1;

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
  chainTexts: [],
  landedCells: [],
  history: [],
  reset: (seed?: number) =>
    set({
      game: createInitialState(seed ?? (Date.now() | 0)),
      animatingSteps: [],
      poppingCells: [],
      chainTexts: [],
      landedCells: [],
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

    // 着地直後の盤面を表示。lockActive で増えたセル(=このツモの 2 つ)を bounce
    // 対象として記録する。
    const placedCells = diffNewlyOccupied(s.field, locked);
    pushLanded(set, placedCells);
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
      // Phase A: 消える直前(まだぷよはある)+ 点滅ハイライト + 連鎖テキスト出現
      const avgRow = step.popped.reduce((a, p) => a + p.row, 0) / step.popped.length;
      const avgCol = step.popped.reduce((a, p) => a + p.col, 0) / step.popped.length;
      const textId = chainTextIdSeq++;
      set((st) => ({
        game: { ...st.game, field: step.beforeField },
        poppingCells: step.popped.map((p) => ({ row: p.row, col: p.col })),
        chainTexts: [
          ...st.chainTexts,
          { id: textId, chainIndex: step.chainIndex, row: avgRow, col: avgCol },
        ],
      }));
      // CSS の fade animation 完了に合わせて自動撤去。setTimeout が undo / reset と
      // 競合しないよう、エントリが残っていれば消すだけにしておく。
      setTimeout(() => {
        set((st) => ({
          chainTexts: st.chainTexts.filter((x) => x.id !== textId),
        }));
      }, CHAIN_TEXT_LIFETIME_MS);
      await sleep(HIGHLIGHT_MS);

      // Phase B: ぷよが消えた直後(重力落下前)
      set((st) => ({
        game: { ...st.game, field: step.afterPop },
        poppingCells: [],
      }));
      await sleep(POP_MS);

      // Phase C: 重力落下 + スコア反映 + 落ちて着地したセルを bounce 対象に
      score += step.scoreDelta;
      maxChain = Math.max(maxChain, step.chainIndex);
      const fallen = diffNewlyOccupied(step.afterPop, step.afterGravity);
      pushLanded(set, fallen);
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
      chainTexts: [],
      landedCells: [],
    });
  },
  canUndo: () => get().history.length > 0 && get().animatingSteps.length === 0,
}));

function sleep(ms: number) {
  return new Promise<void>((r) => setTimeout(r, ms));
}

// Returns cells that are non-null in `after` but were null (or absent) in
// `before`. Used to detect freshly placed / freshly fallen puyos so the
// renderer can play the squash-stretch landing animation on exactly those.
function diffNewlyOccupied(
  before: Field,
  after: Field,
): Array<{ row: number; col: number }> {
  const result: Array<{ row: number; col: number }> = [];
  for (let r = 0; r < ROWS; r++) {
    for (let c = 0; c < COLS; c++) {
      if (after.cells[r]![c] !== null && before.cells[r]![c] === null) {
        result.push({ row: r, col: c });
      }
    }
  }
  return result;
}

// Adds landing entries with the current timestamp, dropping any earlier
// entry at the same (row, col) so the freshest landing wins. Schedules
// a single setTimeout per batch to expire entries past LANDING_BOUNCE_MS.
function pushLanded(
  set: (fn: (s: { landedCells: LandedCell[] }) => Partial<{ landedCells: LandedCell[] }>) => void,
  cells: ReadonlyArray<{ row: number; col: number }>,
): void {
  if (cells.length === 0) return;
  const landedAt = Date.now();
  const newOnes: LandedCell[] = cells.map((c) => ({ row: c.row, col: c.col, landedAt }));
  set((st) => {
    const carryOver = st.landedCells.filter(
      (e) => !newOnes.some((n) => n.row === e.row && n.col === e.col),
    );
    return { landedCells: [...carryOver, ...newOnes] };
  });
  setTimeout(() => {
    set((st) => ({
      landedCells: st.landedCells.filter((e) => e.landedAt !== landedAt),
    }));
  }, LANDING_BOUNCE_MS + 50);
}

// Dev-only: expose store on window for debugging (e.g. __store__.getState().reset(1))
if (import.meta.env.DEV && typeof window !== 'undefined') {
  (window as unknown as { __store__: typeof useGameStore }).__store__ = useGameStore;
}
