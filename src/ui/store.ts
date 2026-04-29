import { create } from 'zustand';
import type {
  GameState,
  Field,
  Input,
  Move,
  ChainStep,
  Cell,
  Color,
  ActivePair,
  Pair,
} from '../game/types';
import { ROWS, COLS, SPAWN_AXIS_ROW, SPAWN_COL } from '../game/constants';
import { createInitialState, spawnNext } from '../game/state';
import { applyInput } from '../game/moves';
import { resolveChain } from '../game/chain';
import { lockActive } from '../game/landing';
import { getCurrentAiMoves } from './hooks/useAiSuggestion';
import { getAmaPreset } from '../ai/wasm-ama/wasm-loader';

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

export type GameMode = 'free' | 'match';
export type MatchTurnLimit = 30 | 50 | 100;
export type ViewSide = 'player' | 'ai';

/** Edit-mode palette selection. 'X' = eraser. */
export type EditPalette = Color | 'G' | 'X';
/** Which pair slot is being edited (0 = current, 1 = next, 2 = next-next). */
export type EditPairSlot = 0 | 1 | 2;
/** Which puyo of a pair is targeted. */
export type EditPairWhich = 'axis' | 'child';

/** Snapshot kept while edit mode is active so Cancel can revert exactly. */
interface EditSnapshot {
  field: Field;
  current: ActivePair | null;
  nextQueue: ReadonlyArray<Pair>;
}

export interface MatchResult {
  playerScore: number;
  aiScore: number;
  winner: 'player' | 'ai' | 'draw';
}

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

  // ---- Match-vs-AI state ----
  /** Game mode. 'free' is the default solo simulator; 'match' runs a turn-limited score race against ama. */
  mode: GameMode;
  matchTurnLimit: MatchTurnLimit;
  /** RNG seed used for the current match. Persisted with saved records to allow exact replay later. */
  matchSeed: number | null;
  /** ama-wasm preset that was active when the match started (e.g. 'build' / 'gtr' / 'kaidan'). */
  matchPreset: string;
  /** Number of pairs the player has already committed in the current match. */
  matchTurnsPlayed: number;
  /** Player's moves played, in order. Recorded for save/replay. */
  matchPlayerMoves: Move[];
  /** AI's moves played, in order. Recorded for save/replay. */
  matchAiMoves: Move[];
  /** AI's parallel game state. Same RNG seed as the player so both see identical pair sequence. */
  aiGame: GameState | null;
  /** AI's per-turn snapshots, captured AFTER each AI commit. Index = turn number (0-based). */
  aiHistory: GameState[];
  /** Which side's board the user is currently viewing. */
  viewing: ViewSide;
  /** When viewing AI side: index into aiHistory to display, or null = live. */
  aiHistoryViewIndex: number | null;
  matchEnded: boolean;
  matchResult: MatchResult | null;

  reset(seed?: number): void;
  dispatch(input: Input): void;
  commit(move: Move, opts?: { source?: CommitSource }): Promise<void>;
  undo(steps?: number): void;
  canUndo(): boolean;

  // ---- Match-vs-AI actions ----
  setGameMode(mode: GameMode): void;
  setMatchTurnLimit(limit: MatchTurnLimit): void;
  startMatch(opts?: { seed?: number; turnLimit?: MatchTurnLimit }): void;
  /** Apply a single AI auto-play move on the AI's parallel state and snapshot it. Called by the match driver. */
  applyAiMove(move: Move): void;
  setViewing(side: ViewSide): void;
  setAiHistoryViewIndex(index: number | null): void;
  /** Mark match ended if either side has consumed all turns or topped out. Computes result. */
  finalizeMatchIfDone(): void;

  // ---- Board editing ----
  /** True while the user is in edit mode. Game inputs (commit, dispatch) are no-ops. */
  editing: boolean;
  /** Snapshot of game state taken at edit entry; used by Cancel. */
  editSnapshot: EditSnapshot | null;
  /** Currently selected palette entry. */
  editPalette: EditPalette;
  enterEditMode(): void;
  /** apply=true: keep edits. apply=false: revert to the snapshot taken when entering edit mode. */
  exitEditMode(apply: boolean): void;
  setEditPalette(p: EditPalette): void;
  /** Paint a single cell with the active palette (handles erase / garbage / colors). */
  paintCell(row: number, col: number): void;
  /** Set a specific puyo of a queue slot to a color. (slot=0 means the active pair.) */
  setPairColor(slot: EditPairSlot, which: EditPairWhich, color: Color): void;
  /** Clear all field cells in the visible playfield. */
  clearEditField(): void;

  /** Load a shared position (decoded from a `?share=` URL). Replaces the
   *  current field, current pair, and the first 2 NEXT pairs. Resets score /
   *  chain counters. Stays in 'free' mode (so the receiver isn't dropped into
   *  the middle of someone else's match). */
  loadSharedPosition(p: {
    field: Field;
    current: Pair;
    next1: Pair;
    next2: Pair;
  }): void;
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

function readPersistedMode(): GameMode {
  try {
    return localStorage.getItem('puyo.gameMode') === 'match' ? 'match' : 'free';
  } catch {
    return 'free';
  }
}

function readPersistedTurnLimit(): MatchTurnLimit {
  try {
    const raw = localStorage.getItem('puyo.matchTurnLimit');
    if (raw === '30') return 30;
    if (raw === '50') return 50;
    if (raw === '100') return 100;
    return 50;
  } catch {
    return 50;
  }
}

function persistMode(mode: GameMode): void {
  try {
    localStorage.setItem('puyo.gameMode', mode);
  } catch {
    // noop
  }
}

function persistTurnLimit(limit: MatchTurnLimit): void {
  try {
    localStorage.setItem('puyo.matchTurnLimit', String(limit));
  } catch {
    // noop
  }
}

export const useGameStore = create<Store>((set, get) => ({
  game: createInitialState(Date.now() | 0),
  animatingSteps: [],
  poppingCells: [],
  chainTexts: [],
  landedCells: [],
  history: [],
  aiStatsHistory: [],
  aiStats: { ...EMPTY_AI_STATS },

  mode: readPersistedMode(),
  matchTurnLimit: readPersistedTurnLimit(),
  matchSeed: null,
  matchPreset: 'build',
  matchTurnsPlayed: 0,
  matchPlayerMoves: [],
  matchAiMoves: [],
  aiGame: null,
  aiHistory: [],
  viewing: 'player',
  aiHistoryViewIndex: null,
  matchEnded: false,
  matchResult: null,

  editing: false,
  editSnapshot: null,
  editPalette: 'R',

  reset: (seed?: number) =>
    set((st) => {
      const newSeed = seed ?? (Date.now() | 0);
      const playerGame = createInitialState(newSeed);
      // In match mode, also reset the AI's parallel state to the same seed so
      // the pair sequence stays identical for both sides.
      const aiGame = st.mode === 'match' ? createInitialState(newSeed) : null;
      return {
        game: playerGame,
        animatingSteps: [],
        poppingCells: [],
        chainTexts: [],
        landedCells: [],
        history: [],
        aiStatsHistory: [],
        aiStats: { ...EMPTY_AI_STATS },
        aiGame,
        aiHistory: [],
        matchSeed: st.mode === 'match' ? newSeed : null,
        matchTurnsPlayed: 0,
        matchPlayerMoves: [],
        matchAiMoves: [],
        matchEnded: false,
        matchResult: null,
        viewing: 'player',
        aiHistoryViewIndex: null,
      };
    }),
  dispatch: (input: Input) =>
    set((s) =>
      // While editing we don't want left/right/rotate to move the active pair —
      // it's being recolored, not played.
      s.editing ? {} : { game: applyInput(s.game, input) },
    ),
  commit: async (move: Move, opts?: { source?: CommitSource }) => {
    if (get().editing) return;
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

    // Match-mode bookkeeping. Both 'user' and 'ai' sources count as a player
    // turn — clicking AI Best is the player's chosen action for this turn, just
    // delegated. Source only gates the AI-agreement metric.
    if (get().mode === 'match' && !get().matchEnded) {
      set((st) => ({
        matchTurnsPlayed: st.matchTurnsPlayed + 1,
        matchPlayerMoves: [
          ...st.matchPlayerMoves,
          { axisCol: move.axisCol, rotation: move.rotation },
        ],
      }));
      get().finalizeMatchIfDone();
    }
  },
  undo: (steps = 1) => {
    const { history, animatingSteps, aiStatsHistory, mode } = get();
    if (history.length === 0) return;
    if (animatingSteps.length > 0) return;
    // Undo during a match would desync the AI's parallel state. Disable for now.
    if (mode === 'match') return;
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
  canUndo: () =>
    get().history.length > 0 &&
    get().animatingSteps.length === 0 &&
    get().mode !== 'match',

  // ---- Match-vs-AI actions ----

  setGameMode: (mode) => {
    persistMode(mode);
    set({ mode });
    if (mode === 'free') {
      set({
        aiGame: null,
        aiHistory: [],
        matchEnded: false,
        matchResult: null,
        matchTurnsPlayed: 0,
        viewing: 'player',
        aiHistoryViewIndex: null,
      });
    }
  },

  setMatchTurnLimit: (limit) => {
    persistTurnLimit(limit);
    set({ matchTurnLimit: limit });
  },

  startMatch: (opts) => {
    const seed = opts?.seed ?? (Date.now() | 0);
    const turnLimit = opts?.turnLimit ?? get().matchTurnLimit;
    persistMode('match');
    persistTurnLimit(turnLimit);
    const playerGame = createInitialState(seed);
    const aiGame = createInitialState(seed);
    set({
      mode: 'match',
      matchTurnLimit: turnLimit,
      matchSeed: seed,
      matchPreset: getAmaPreset(),
      game: playerGame,
      aiGame,
      aiHistory: [],
      matchTurnsPlayed: 0,
      matchPlayerMoves: [],
      matchAiMoves: [],
      matchEnded: false,
      matchResult: null,
      viewing: 'player',
      aiHistoryViewIndex: null,
      animatingSteps: [],
      poppingCells: [],
      chainTexts: [],
      landedCells: [],
      history: [],
      aiStatsHistory: [],
      aiStats: { ...EMPTY_AI_STATS },
    });
  },

  applyAiMove: (move) => {
    const { aiGame, mode, matchEnded } = get();
    if (mode !== 'match' || matchEnded || !aiGame || !aiGame.current) return;
    // Synchronous ama play: lock + resolve the chain in one step (no animation).
    // We still capture the post-spawn state so spectating uses normal puyo logic.
    const placed = {
      ...aiGame.current,
      axisCol: move.axisCol,
      rotation: move.rotation,
    };
    const locked = lockActive(aiGame.field, placed);
    const { finalField, steps, totalScore } = resolveChain(locked);
    const resolved: GameState = {
      ...aiGame,
      field: finalField,
      current: null,
      score: aiGame.score + totalScore,
      chainCount: steps.length,
      totalChains: aiGame.totalChains + steps.length,
      maxChain: Math.max(aiGame.maxChain, steps.length),
      status: 'resolving',
    };
    const nextAiGame = spawnNext(resolved);
    set((st) => ({
      aiGame: nextAiGame,
      aiHistory: [...st.aiHistory, nextAiGame],
      matchAiMoves: [
        ...st.matchAiMoves,
        { axisCol: move.axisCol, rotation: move.rotation },
      ],
    }));
    get().finalizeMatchIfDone();
  },

  setViewing: (side) =>
    set((st) => ({
      viewing: side,
      // When switching back to player (live) or to AI live tail, drop scrubbing.
      aiHistoryViewIndex: side === 'player' ? null : st.aiHistoryViewIndex,
    })),

  setAiHistoryViewIndex: (index) => set({ aiHistoryViewIndex: index }),

  finalizeMatchIfDone: () => {
    const st = get();
    if (st.mode !== 'match' || st.matchEnded) return;
    const playerDone =
      st.matchTurnsPlayed >= st.matchTurnLimit || st.game.status === 'gameover';
    const aiDone =
      !st.aiGame ||
      st.aiHistory.length >= st.matchTurnLimit ||
      st.aiGame.status === 'gameover';
    if (!playerDone || !aiDone) return;
    const playerScore = st.game.score;
    const aiScore = st.aiGame ? st.aiGame.score : 0;
    const winner: MatchResult['winner'] =
      playerScore > aiScore ? 'player' : aiScore > playerScore ? 'ai' : 'draw';
    set({ matchEnded: true, matchResult: { playerScore, aiScore, winner } });
  },

  // ---- Board editing ----

  enterEditMode: () => {
    const st = get();
    if (st.editing) return;
    if (st.animatingSteps.length > 0) return; // mid-chain — refuse silently
    // Snapshot what we'll be changing. Pair queue must be at least 2 entries
    // long (NEXT + NEXT2); pad with a default pair if not.
    const snapshot: EditSnapshot = {
      field: st.game.field,
      current: st.game.current,
      nextQueue: st.game.nextQueue,
    };
    // Spawn a usable active pair if there isn't one (e.g. mid-resolve / gameover).
    const ensuredCurrent: ActivePair =
      st.game.current ?? {
        pair: { axis: 'R', child: 'R' },
        axisRow: SPAWN_AXIS_ROW,
        axisCol: SPAWN_COL,
        rotation: 0,
      };
    const ensuredQueue: Pair[] = [...st.game.nextQueue];
    while (ensuredQueue.length < 2) ensuredQueue.push({ axis: 'R', child: 'R' });
    set({
      editing: true,
      editSnapshot: snapshot,
      game: {
        ...st.game,
        current: ensuredCurrent,
        nextQueue: ensuredQueue,
        // While editing we want the field to look stable, not 'gameover' / 'resolving'.
        status: 'playing',
        chainCount: 0,
      },
      // Animations / overlays from the prior turn would render incorrectly
      // against the edited field; clear them.
      poppingCells: [],
      chainTexts: [],
      landedCells: [],
      animatingSteps: [],
    });
  },

  exitEditMode: (apply) => {
    const st = get();
    if (!st.editing) return;
    if (!apply && st.editSnapshot) {
      // Cancel: restore the game's field/current/queue from the snapshot.
      set({
        game: {
          ...st.game,
          field: st.editSnapshot.field,
          current: st.editSnapshot.current,
          nextQueue: st.editSnapshot.nextQueue,
          status: st.editSnapshot.current ? 'playing' : 'gameover',
        },
      });
    }
    // Apply: just keep the current edited values (already in st.game).
    set({ editing: false, editSnapshot: null });
  },

  setEditPalette: (p) => set({ editPalette: p }),

  paintCell: (row, col) => {
    const st = get();
    if (!st.editing) return;
    if (row < 0 || row >= ROWS || col < 0 || col >= COLS) return;
    let next: Cell;
    switch (st.editPalette) {
      case 'X':
        next = null;
        break;
      case 'G':
        next = 'G';
        break;
      default:
        next = st.editPalette;
    }
    // Tap the same color twice to erase — feels natural and saves swapping
    // to the eraser for one-off corrections.
    const cur = st.game.field.cells[row]![col]!;
    if (cur === next && next !== null) next = null;
    const newCells = st.game.field.cells.map((rr, ri) =>
      ri === row ? rr.map((cc, ci) => (ci === col ? next : cc)) : rr,
    );
    set({ game: { ...st.game, field: { cells: newCells } } });
  },

  setPairColor: (slot, which, color) => {
    const st = get();
    if (!st.editing) return;
    if (slot === 0) {
      const cur = st.game.current;
      if (!cur) return;
      const pair: Pair =
        which === 'axis'
          ? { axis: color, child: cur.pair.child }
          : { axis: cur.pair.axis, child: color };
      set({ game: { ...st.game, current: { ...cur, pair } } });
    } else {
      const idx = slot - 1;
      const queue = [...st.game.nextQueue];
      while (queue.length <= idx) queue.push({ axis: 'R', child: 'R' });
      const old = queue[idx]!;
      queue[idx] =
        which === 'axis'
          ? { axis: color, child: old.child }
          : { axis: old.axis, child: color };
      set({ game: { ...st.game, nextQueue: queue } });
    }
  },

  clearEditField: () => {
    const st = get();
    if (!st.editing) return;
    const newCells: Cell[][] = Array.from({ length: ROWS }, () =>
      Array(COLS).fill(null),
    );
    set({ game: { ...st.game, field: { cells: newCells } } });
  },

  loadSharedPosition: ({ field, current, next1, next2 }) => {
    const st = get();
    // 親側のマッチ進行や編集モードを巻き戻して "クリーンな自由モード" にしてから流し込む。
    const newCurrent = {
      pair: current,
      axisRow: SPAWN_AXIS_ROW,
      axisCol: SPAWN_COL,
      rotation: 0,
    } as const;
    set({
      mode: 'free',
      editing: false,
      editSnapshot: null,
      game: {
        ...st.game,
        field,
        current: newCurrent,
        nextQueue: [next1, next2, ...st.game.nextQueue.slice(2)],
        score: 0,
        chainCount: 0,
        totalChains: 0,
        maxChain: 0,
        status: 'playing',
      },
      animatingSteps: [],
      poppingCells: [],
      chainTexts: [],
      landedCells: [],
      history: [],
      aiStatsHistory: [],
      aiStats: { ...EMPTY_AI_STATS },
      aiGame: null,
      aiHistory: [],
      matchEnded: false,
      matchResult: null,
      matchTurnsPlayed: 0,
      matchPlayerMoves: [],
      matchAiMoves: [],
      viewing: 'player',
      aiHistoryViewIndex: null,
    });
  },
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
