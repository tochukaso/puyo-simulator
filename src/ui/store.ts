import { create } from 'zustand';
import type { GameState, Field, Input, Move, ChainStep } from '../game/types';
import { ROWS, COLS } from '../game/constants';
import { createInitialState, spawnNext } from '../game/state';
import { applyInput } from '../game/moves';
import { resolveChain } from '../game/chain';
import { lockActive } from '../game/landing';
import { getCurrentAiMoves } from './hooks/useAiSuggestion';

export interface PoppingCell {
  row: number;
  col: number;
}

/** Overlay entry used to display the localized "N-chain!" label when a chain triggers. */
export interface ChainTextEntry {
  id: number;
  chainIndex: number;
  /** Centroid of the cleared cell group. Board uses this to place the overlay in absolute coordinates. */
  row: number;
  col: number;
}

/** Entry used to apply a squash-and-stretch bounce animation right after landing. */
export interface LandedCell {
  row: number;
  col: number;
  /** Landing time based on Date.now(). Board's draw computes the scale from the elapsed time. */
  landedAt: number;
}

/**
 * AI agreement metrics. Updated by commit() against the current AI suggestion
 * snapshot, except when the commit was initiated by the AI itself (source='ai').
 *   measured       : total user-initiated commits where AI snapshot was available
 *   bestMatchCount : commits where the user's move == AI's #1 candidate
 *   inListCount    : commits where the user's move appeared anywhere in the AI's topK
 *   pctSum         : sum of (userMoveScore / topScore * 100) over inListCount commits
 */
export interface AiStats {
  measured: number;
  bestMatchCount: number;
  inListCount: number;
  pctSum: number;
}

const EMPTY_AI_STATS: AiStats = {
  measured: 0,
  bestMatchCount: 0,
  inListCount: 0,
  pctSum: 0,
};

export type CommitSource = 'user' | 'ai';

interface Store {
  game: GameState;
  animatingSteps: ChainStep[];
  /** Cells about to pop (lit up during the highlight phase). */
  poppingCells: PoppingCell[];
  /** Chain text (e.g. "1-chain!"). Fades out over 2 seconds via CSS animation. */
  chainTexts: ChainTextEntry[];
  /** Puyos that just landed. Board bounces them with a squash-and-stretch. */
  landedCells: LandedCell[];
  history: GameState[];
  /** Snapshots of aiStats taken before each commit; same length as `history`. Undo pops from both. */
  aiStatsHistory: AiStats[];
  aiStats: AiStats;
  reset(seed?: number): void;
  dispatch(input: Input): void;
  commit(move: Move, opts?: { source?: CommitSource }): Promise<void>;
  undo(steps?: number): void;
  canUndo(): boolean;
}

const CHAIN_TEXT_LIFETIME_MS = 2000;
export const LANDING_BOUNCE_MS = 280;
let chainTextIdSeq = 1;

// Chain-step timing. Tuned so the user gets a sense of "the puyos are
// gradually disappearing" rather than vanishing in a single frame.
const LOCK_PAUSE_MS = 200; // From the pair landing until the first chain check.
const HIGHLIGHT_MS = 400; // How long to flash-highlight the puyos that are about to pop.
const POP_MS = 150; // Time spent showing the board right after the puyos vanish (before gravity).
const GRAVITY_MS = 300; // Pause after gravity has settled the falling puyos.

const MAX_HISTORY = 100;

export const useGameStore = create<Store>((set, get) => ({
  game: createInitialState(Date.now() | 0),
  animatingSteps: [],
  poppingCells: [],
  chainTexts: [],
  landedCells: [],
  history: [],
  aiStatsHistory: [],
  aiStats: { ...EMPTY_AI_STATS },
  reset: (seed?: number) =>
    set({
      game: createInitialState(seed ?? (Date.now() | 0)),
      animatingSteps: [],
      poppingCells: [],
      chainTexts: [],
      landedCells: [],
      history: [],
      aiStatsHistory: [],
      aiStats: { ...EMPTY_AI_STATS },
    }),
  dispatch: (input: Input) => set((s) => ({ game: applyInput(s.game, input) })),
  commit: async (move: Move, opts?: { source?: CommitSource }) => {
    const s = get().game;
    if (!s.current) return;
    const source: CommitSource = opts?.source ?? 'user';

    // AI agreement metric. Skip when the AI itself executed the move (e.g. "AI Best" button).
    // Compute the next aiStats and snapshot the previous one for undo.
    const priorAiStats = get().aiStats;
    let nextAiStats = priorAiStats;
    if (source === 'user') {
      const ai = getCurrentAiMoves();
      if (ai && ai.state === s && ai.moves.length > 0) {
        const top = ai.moves[0]!;
        const topScore = ai.moves.reduce((m, x) => Math.max(m, x.score ?? 0), 0);
        const inList = ai.moves.find(
          (m) => m.axisCol === move.axisCol && m.rotation === move.rotation,
        );
        const isBest = top.axisCol === move.axisCol && top.rotation === move.rotation;
        nextAiStats = {
          measured: priorAiStats.measured + 1,
          bestMatchCount: priorAiStats.bestMatchCount + (isBest ? 1 : 0),
          inListCount: priorAiStats.inListCount + (inList ? 1 : 0),
          pctSum:
            priorAiStats.pctSum +
            (inList && topScore > 0
              ? Math.max(0, ((inList.score ?? 0) / topScore) * 100)
              : 0),
        };
      }
    }

    // Puyo Puyo Tsuu (eSport) rules: no "no-crossing" restriction. Any
    // (axisCol, rotation) can be placed directly (equivalent to wall-kick
    // and teleportation).

    const placed = {
      ...s.current,
      axisCol: move.axisCol,
      rotation: move.rotation,
    };

    const locked = lockActive(s.field, placed);
    const { finalField, steps } = resolveChain(locked);

    const priorHistory = get().history;
    const priorAiStatsHistory = get().aiStatsHistory;
    const newHistory = [...priorHistory, s].slice(-MAX_HISTORY);
    const newAiStatsHistory = [...priorAiStatsHistory, priorAiStats].slice(-MAX_HISTORY);

    // Show the board right after landing. Record the cells newly occupied by
    // lockActive (= the two puyos of this pair) as bounce targets.
    const placedCells = diffNewlyOccupied(s.field, locked);
    pushLanded(set, placedCells);
    set({
      game: { ...s, field: locked, current: null, status: 'resolving' },
      animatingSteps: steps,
      poppingCells: [],
      history: newHistory,
      aiStatsHistory: newAiStatsHistory,
      aiStats: nextAiStats,
    });

    if (steps.length > 0) {
      await sleep(LOCK_PAUSE_MS);
    }

    let score = s.score;
    let maxChain = s.maxChain;
    for (const step of steps) {
      // Phase A: just before pop (puyos still on board) + flash highlight + chain text appears.
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
      // Auto-remove when the CSS fade animation finishes. The setTimeout must
      // not conflict with undo / reset, so we just delete the entry if it still exists.
      setTimeout(() => {
        set((st) => ({
          chainTexts: st.chainTexts.filter((x) => x.id !== textId),
        }));
      }, CHAIN_TEXT_LIFETIME_MS);
      await sleep(HIGHLIGHT_MS);

      // Phase B: right after the puyos vanish (before gravity).
      set((st) => ({
        game: { ...st.game, field: step.afterPop },
        poppingCells: [],
      }));
      await sleep(POP_MS);

      // Phase C: gravity drop + score update + record cells that fell-and-landed as bounce targets.
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
    const { history, animatingSteps, aiStatsHistory } = get();
    if (history.length === 0) return;
    if (animatingSteps.length > 0) return;
    const n = Math.min(Math.max(1, steps), history.length);
    const targetIndex = history.length - n;
    const target = history[targetIndex]!;
    const targetAiStats = aiStatsHistory[targetIndex] ?? { ...EMPTY_AI_STATS };
    set({
      game: target,
      history: history.slice(0, targetIndex),
      aiStatsHistory: aiStatsHistory.slice(0, targetIndex),
      aiStats: targetAiStats,
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
