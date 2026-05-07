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
import { createInitialState, spawnNext, commitMove } from '../game/state';
import { applyInput } from '../game/moves';
import { canPlace } from '../game/pair';
import { resolveChain } from '../game/chain';
import { lockActive } from '../game/landing';
import { suggestForState } from './hooks/useAiSuggestion';
import { getAmaPreset } from '../ai/wasm-ama/wasm-loader';
import type { MatchRecord } from '../match/records';
import { dailySeedFor, todayDateJst } from '../game/dailySeed';

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
 * Overlay state used while replaying a chain animation from history. When set,
 * Board reads `field` / `current` / `poppingCells` / `chainTexts` from here
 * (instead of the snapshot) so the user sees the chain unfold step-by-step.
 * `side` records which side the animation belongs to so we don't draw it on
 * the wrong board if the user toggles `viewing` mid-animation.
 */
export interface HistoryAnim {
  side: ViewSide;
  field: Field;
  current: ActivePair | null;
  poppingCells: PoppingCell[];
  chainTexts: ChainTextEntry[];
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

// 'free' = 自由練習(ターン無制限・ama 不在・全機能)。
// 'match' = ama とのスコア勝負(ターン上限あり・ama 並走)。
// 'score' = 一人用スコアモード(ama 不在・上限あり/無制限選択可能・undo/AI 不可)。
// 'daily' = デイリーシードチャレンジ(seed = JST 日付ハッシュ、50 手固定、
//           ama 不在、サーバに leaderboard 保存)。 score モードの特殊版扱い。
export type GameMode = 'free' | 'match' | 'score' | 'daily';
// match モードは 30/50/100 のみ、score モードは + 200 と 'unlimited' も可。
// 共通の型として持っておき、UI 側で mode 別に許可値を絞る。
export type MatchTurnLimit = 30 | 50 | 100 | 200 | 'unlimited';
export type ViewSide = 'player' | 'ai';

// 'unlimited' でも matchTurnsPlayed >= matchTurnLimit が常に false になる
// よう Infinity で評価したいので、数値 / Infinity に正規化するヘルパー。
export function turnLimitToNumber(limit: MatchTurnLimit): number {
  return limit === 'unlimited' ? Infinity : limit;
}

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
  /**
   * AI agreement metrics. Empty (measured=0) until the user clicks "Analyze".
   * Cleared on commit / undo / reset / mode change because each of those
   * invalidates the move list the previous analysis was built on.
   */
  aiStats: AiStats;
  /** True while analyzeStats() is iterating through past moves. */
  analyzing: boolean;
  /**
   * Player's moves in free mode, in commit order. Used by analyzeStats() to
   * replay the game and run ama on each pre-move state. Reset on reset() and
   * popped on undo() so the count always matches the live game state.
   * (Match mode uses `matchPlayerMoves` for the same purpose.)
   */
  freePlayerMoves: Move[];

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
  /** Player's per-turn snapshots in match mode, captured AFTER each player commit + spawnNext.
   *  Mirrors `aiHistory` so the user can scrub their own history post-match the same way. */
  playerHistory: GameState[];
  /** Which side's board the user is currently viewing. */
  viewing: ViewSide;
  /** When viewing AI side: index into aiHistory to display, or null = live. */
  aiHistoryViewIndex: number | null;
  /** When viewing player side: index into playerHistory to display, or null = live. */
  playerHistoryViewIndex: number | null;
  /** Active history-replay animation overlay; null when not animating. */
  historyAnim: HistoryAnim | null;
  matchEnded: boolean;
  matchResult: MatchResult | null;
  /**
   * 保存レコードからロードしてリプレイ表示している場合の元レコード ID。
   * null = ライブの対戦 (まだロードしていない)。
   * UI で「保存」ボタンを隠す / 「リプレイ表示中」のラベルを出す等に使う。
   */
  loadedRecordId: string | null;
  /**
   * 'daily' モード時のみ意味あり: 進行中のチャレンジがどの日 (JST) のものか。
   * 終了後にサーバ POST する dailyDate および leaderboard 表示の絞り込みに使う。
   * 他モード / 未開始時は null。
   */
  currentDailyDate: string | null;

  reset(seed?: number): void;
  dispatch(input: Input): void;
  commit(move: Move, opts?: { source?: CommitSource }): Promise<void>;
  undo(steps?: number): void;
  canUndo(): boolean;

  // ---- Match-vs-AI actions ----
  setGameMode(mode: GameMode): void;
  setMatchTurnLimit(limit: MatchTurnLimit): void;
  startMatch(opts?: { seed?: number; turnLimit?: MatchTurnLimit }): void;
  /** 一人用スコアモードを開始。ama は登場しない。
   *  turnLimit: 30 / 50 / 100 / 200 / 'unlimited'。 */
  startScore(opts?: { seed?: number; turnLimit?: MatchTurnLimit }): void;
  /** デイリーチャレンジを開始。 seed は JST 日付ハッシュ、 turnLimit は 50 固定。
   *  dailyDate を省略すると今日の JST 日付を使う (テスト用に固定可能)。 */
  startDaily(opts?: { dailyDate?: string }): void;
  /** score / daily モードのみ。ユーザーがゲームを途中で終了する (Quit ボタン)。
   *  ターン数到達と同じく matchEnded=true + matchResult をセットして、
   *  保存・共有 UI を出せる状態にする。 */
  quitScore(): void;
  /** Apply a single AI auto-play move on the AI's parallel state and snapshot it. Called by the match driver. */
  applyAiMove(move: Move): void;
  setViewing(side: ViewSide): void;
  setAiHistoryViewIndex(index: number): void;
  setPlayerHistoryViewIndex(index: number): void;
  /** Replay the chain animation for the given history index on the given side.
   *  Cancels any currently-playing replay. Resolves to true when the full
   *  animation played out, false if it was cancelled (slider scrubbed, side
   *  toggled, another replay started, etc.). */
  playHistoryChain(side: ViewSide, index: number): Promise<boolean>;
  /** Cancel any in-flight history replay and clear the overlay. */
  cancelHistoryChain(): void;
  /** Mark match ended if either side has consumed all turns or topped out. Computes result. */
  finalizeMatchIfDone(): void;
  /** Player concedes the current match. Result is set with `winner: 'ai'` regardless of score. */
  resignMatch(): void;
  /**
   * 保存済みマッチをリプレイ用にロード。
   * `seed` から初期状態を作り、`playerMoves` / `aiMoves` を順に再シミュレート
   * して playerHistory / aiHistory を再構築する。終了状態 (matchEnded=true,
   * matchResult, viewing='player', view index = 末尾) でセットするので、
   * MatchPanel の既存 scrubber UI と「連鎖再生」ボタンがそのまま使える。
   */
  loadRecord(record: MatchRecord): void;

  /**
   * Replay every player move from the recorded sequence, run ama on each
   * pre-commit state, and aggregate the agreement metrics into `aiStats`.
   * Free mode replays from `game.rngSeed` + `freePlayerMoves`; match mode
   * replays from `matchSeed` + `matchPlayerMoves`. Sets `analyzing=true`
   * while running and writes results when done.
   */
  analyzeStats(): Promise<void>;

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

// Monotonic token used to invalidate stale history-replay animations. Each
// call to playHistoryChain bumps this; awaited steps re-check it before
// committing further state, so a new replay (or a slider scrub / mode change)
// cleanly cancels any in-flight animation without race conditions.
let historyAnimSeq = 0;

// Chain-step timing. Tuned so the user gets a sense of "the puyos are
// gradually disappearing" rather than vanishing in a single frame.
const LOCK_PAUSE_MS = 200; // From the pair landing until the first chain check.
const HIGHLIGHT_MS = 400; // How long to flash-highlight the puyos that are about to pop.
const POP_MS = 150; // Time spent showing the board right after the puyos vanish (before gravity).
const GRAVITY_MS = 300; // Pause after gravity has settled the falling puyos.

const MAX_HISTORY = 100;

function readPersistedMode(): GameMode {
  try {
    const raw = localStorage.getItem('puyo.gameMode');
    if (raw === 'match' || raw === 'score' || raw === 'daily') return raw;
    return 'free';
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
    if (raw === '200') return 200;
    if (raw === 'unlimited') return 'unlimited';
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

// 保存レコードを片側ぶん再シミュレートして、`*History[]` の中身を作る。
// `commitMove` は内部で spawnNext まで含むが、最終ターン (turnLimit 到達) では
// applyAiMove / commit と同様に spawnNext を抑止して、ライブ進行の snapshot
// 形状と完全一致させる。これで playHistoryChain が history[index-1] を pre と
// して使うパスに落ちてもズレない。途中で gameover になれば打ち切る。
function simulateRecordSide(
  seed: number,
  moves: ReadonlyArray<Move>,
  turnLimit: number,
): { history: GameState[]; lastState: GameState } {
  // turnLimit=0 は records.ts 仕様で 'unlimited' のセンチネル。Infinity に
  // 変換しないと「常に atLimit」になり spawnNext が一度も呼ばれず、初手で
  // current=null のまま再生が止まってしまう。
  const limit = turnLimit <= 0 ? Infinity : turnLimit;
  const history: GameState[] = [];
  let state = createInitialState(seed);
  for (let i = 0; i < moves.length; i++) {
    if (!state.current) break;
    const move = moves[i]!;
    const placed: ActivePair = {
      ...state.current,
      axisCol: move.axisCol,
      rotation: move.rotation,
    };
    const locked = lockActive(state.field, placed);
    const { finalField, steps, totalScore } = resolveChain(locked);
    const resolved: GameState = {
      ...state,
      field: finalField,
      current: null,
      score: state.score + totalScore,
      chainCount: steps.length,
      totalChains: state.totalChains + steps.length,
      maxChain: Math.max(state.maxChain, steps.length),
      status: 'resolving',
    };
    const atLimit = i + 1 >= limit;
    state = atLimit ? resolved : spawnNext(resolved);
    history.push(state);
  }
  return { history, lastState: state };
}

export const useGameStore = create<Store>((set, get) => ({
  game: createInitialState(Date.now() | 0),
  animatingSteps: [],
  poppingCells: [],
  chainTexts: [],
  landedCells: [],
  history: [],
  aiStats: { ...EMPTY_AI_STATS },
  analyzing: false,
  freePlayerMoves: [],

  mode: readPersistedMode(),
  matchTurnLimit: readPersistedTurnLimit(),
  matchSeed: null,
  matchPreset: 'build',
  matchTurnsPlayed: 0,
  matchPlayerMoves: [],
  matchAiMoves: [],
  aiGame: null,
  aiHistory: [],
  playerHistory: [],
  viewing: 'player',
  aiHistoryViewIndex: null,
  playerHistoryViewIndex: null,
  historyAnim: null,
  matchEnded: false,
  matchResult: null,
  loadedRecordId: null,
  currentDailyDate: null,

  editing: false,
  editSnapshot: null,
  editPalette: 'R',

  reset: (seed?: number) => {
    // Daily モードは「シード固定」が仕様の根幹なので、 reset() は当日の
    // dailySeedFor(currentDailyDate) で再起動する。 startDaily を委譲呼び
    // することで matchSeed / currentDailyDate / playerHistory 等の daily
    // 固有フィールドを atomically 揃える (Reset を押した後 leaderboard に
    // 「別シードで稼いだスコア」が混ざらないように)。
    // currentDailyDate が null になりうるのは legacy / 壊れたレコードを
    // loadRecord で拾った場合のみ。 ここで未知日付を継承すると矛盾するので
    // 当日 (JST) にフォールバック。
    const cur = get();
    if (cur.mode === 'daily') {
      get().startDaily({ dailyDate: cur.currentDailyDate ?? todayDateJst() });
      return;
    }
    // Bump the history-replay token so any in-flight playHistoryChain aborts
    // on its next sleep boundary instead of writing stale frames into the
    // freshly reset state.
    historyAnimSeq++;
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
        aiStats: { ...EMPTY_AI_STATS },
        analyzing: false,
        freePlayerMoves: [],
        aiGame,
        aiHistory: [],
        playerHistory: [],
        matchSeed: st.mode === 'match' ? newSeed : null,
        matchTurnsPlayed: 0,
        matchPlayerMoves: [],
        matchAiMoves: [],
        matchEnded: false,
        matchResult: null,
        viewing: 'player',
        aiHistoryViewIndex: null,
        playerHistoryViewIndex: null,
        historyAnim: null,
      };
    });
  },
  dispatch: (input: Input) => {
    const s = get();
    // While editing we don't want left/right/rotate to move the active pair —
    // it's being recolored, not played.
    if (s.editing) return;
    // softDrop が床 / 既存ぷよの上に達して降りられない場合は、Drop ボタンを
    // 別途押させずにそのまま現在の (axisCol, rotation) で確定する。連続入力
    // (キーリピート / 下フリック) でも自然に着地→確定の流れになる。
    if (
      input.type === 'softDrop' &&
      s.game.status === 'playing' &&
      s.game.current
    ) {
      const c = s.game.current;
      const next: ActivePair = { ...c, axisRow: c.axisRow + 1 };
      if (!canPlace(s.game.field, next)) {
        void get().commit({ axisCol: c.axisCol, rotation: c.rotation });
        return;
      }
    }
    set((st) => ({ game: applyInput(st.game, input) }));
  },
  commit: async (move: Move, opts?: { source?: CommitSource }) => {
    if (get().editing) return;
    const s = get().game;
    if (!s.current) return;
    const source: CommitSource = opts?.source ?? 'user';

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
    const newHistory = [...priorHistory, s].slice(-MAX_HISTORY);

    // Show the board right after landing. Record the cells newly occupied by
    // lockActive (= the two puyos of this pair) as bounce targets.
    const placedCells = diffNewlyOccupied(s.field, locked);
    pushLanded(set, placedCells);
    set({
      game: { ...s, field: locked, current: null, status: 'resolving' },
      animatingSteps: steps,
      poppingCells: [],
      history: newHistory,
      // AI agreement metrics are recomputed on demand via analyzeStats(); any
      // change to the move sequence invalidates the previously analyzed result.
      aiStats: { ...EMPTY_AI_STATS },
      analyzing: false,
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
    // ターン上限に達した瞬間は次のペアを spawn しない (current=null にしておけば
    // 以降の dispatch / commit が no-op になり、無意味な "ghost pair" が表示
    // されないで済む)。match / score / daily いずれも同じロジック。'unlimited' は
    // turnLimitToNumber で Infinity になるので常にこの分岐に入らない。
    const stHere = get();
    const limited =
      stHere.mode === 'match' ||
      stHere.mode === 'score' ||
      stHere.mode === 'daily';
    const playerAtLimit =
      limited &&
      !stHere.matchEnded &&
      stHere.matchTurnsPlayed + 1 >= turnLimitToNumber(stHere.matchTurnLimit);
    const nextGame: GameState = playerAtLimit
      ? finalState
      : spawnNext(finalState);
    set({ game: nextGame, animatingSteps: [], poppingCells: [] });

    // match / score / daily モードのターン記録。score / daily も playerHistory +
    // 手列を揃えておくと scrubber UI と保存・リプレイ・URL 共有がそのまま使える。
    const recordingMode = get().mode;
    if (
      (recordingMode === 'match' ||
        recordingMode === 'score' ||
        recordingMode === 'daily') &&
      !get().matchEnded
    ) {
      set((st) => ({
        matchTurnsPlayed: st.matchTurnsPlayed + 1,
        matchPlayerMoves: [
          ...st.matchPlayerMoves,
          { axisCol: move.axisCol, rotation: move.rotation },
        ],
        // post-spawn snapshot — mirrors aiHistory semantics so the player can
        // scrub their own turns the same way after the match ends.
        playerHistory: [...st.playerHistory, st.game],
      }));
      get().finalizeMatchIfDone();
    }
    // Free-mode move log. Used by analyzeStats() to replay the game later.
    // We log both 'user' and 'ai' sources — if the user delegated to "AI Best",
    // analyzeStats will still compare ama's analysis against that move (which
    // will trivially match, but that's a faithful "what was actually played").
    if (get().mode === 'free') {
      set((st) => ({
        freePlayerMoves: [
          ...st.freePlayerMoves,
          { axisCol: move.axisCol, rotation: move.rotation },
        ],
      }));
    }
    // Tag for compiler (variable was previously read; keep param for future use).
    void source;
  },
  undo: (steps = 1) => {
    const st = get();
    const { animatingSteps, mode } = st;
    if (animatingSteps.length > 0) return;

    // score / daily モードはユーザー要件で undo 不可 (一発勝負のスコアアタック前提)。
    if (mode === 'score' || mode === 'daily') return;

    if (mode === 'match') {
      // Match mode の undo はプレイヤー側だけを巻き戻す。ama の盤面・履歴は
      // 触らないので、undo 後はターン数差が出る (ama は inFlight で常に進む)。
      // 「ama の応手を見て自分の手を選び直す」が可能になる仕様だが、ユーザーが
      // 練習や misclick リカバリ用途として明示的に選んだ動作。
      // matchEnded 後・loadRecord ロード中 (matchEnded=true) は不可。
      if (st.matchEnded) return;
      if (st.matchSeed === null) return;
      const { playerHistory, matchPlayerMoves, matchTurnsPlayed } = st;
      if (matchTurnsPlayed === 0) return;
      const n = Math.min(Math.max(1, steps), matchTurnsPlayed);
      const newLen = matchTurnsPlayed - n;
      const newPlayerHistory = playerHistory.slice(0, newLen);
      const newMatchPlayerMoves = matchPlayerMoves.slice(0, newLen);
      // 巻き戻し先の game state。最初の手まで戻す場合は initial state。
      const targetGame =
        newLen === 0
          ? createInitialState(st.matchSeed)
          : newPlayerHistory[newLen - 1]!;
      // 進行中の chain replay や view scrubber を破棄。
      historyAnimSeq++;
      set({
        game: targetGame,
        playerHistory: newPlayerHistory,
        matchPlayerMoves: newMatchPlayerMoves,
        matchTurnsPlayed: newLen,
        playerHistoryViewIndex: null,
        animatingSteps: [],
        poppingCells: [],
        chainTexts: [],
        landedCells: [],
        historyAnim: null,
        // 解析結果は手列が変わったので破棄。
        aiStats: { ...EMPTY_AI_STATS },
        analyzing: false,
      });
      return;
    }

    // free mode: 既存ロジック (history + freePlayerMoves を巻き戻す)。
    const { history, freePlayerMoves } = st;
    if (history.length === 0) return;
    const n = Math.min(Math.max(1, steps), history.length);
    const targetIndex = history.length - n;
    const target = history[targetIndex]!;
    set({
      game: target,
      history: history.slice(0, targetIndex),
      // Drop the same number of recorded moves so analyze can replay correctly.
      freePlayerMoves: freePlayerMoves.slice(0, Math.max(0, freePlayerMoves.length - n)),
      // Stale analysis — clear and let the user re-run.
      aiStats: { ...EMPTY_AI_STATS },
      analyzing: false,
      animatingSteps: [],
      poppingCells: [],
      chainTexts: [],
      landedCells: [],
    });
  },
  canUndo: () => {
    const st = get();
    if (st.animatingSteps.length > 0) return false;
    // score / daily モードはユーザー要件で常時 undo 不可。
    if (st.mode === 'score' || st.mode === 'daily') return false;
    if (st.mode === 'match') {
      return !st.matchEnded && st.matchTurnsPlayed > 0;
    }
    return st.history.length > 0;
  },

  // ---- Match-vs-AI actions ----

  setGameMode: (mode) => {
    const prevMode = get().mode;
    const fromMatchOrScore =
      prevMode === 'match' ||
      prevMode === 'score' ||
      prevMode === 'daily';
    persistMode(mode);
    set({ mode });
    // Stats from the previous mode (e.g. a finished match) shouldn't bleed
    // into the new mode's display. analyzeStats can be re-run on demand.
    set({ aiStats: { ...EMPTY_AI_STATS }, analyzing: false });
    if (mode === 'free') {
      historyAnimSeq++;
      // match → free に戻る時は盤面と履歴をフルリセットして、新しい free
      // セッションを始める。理由は 2 つ:
      // (1) match の途中盤面が free に持ち越されると、ユーザーから見て
      //     「対戦中の盤面が突然フリーモードで見える」直感に反する。
      // (2) free 専用の `history` スタックは match 中は触っていないので、
      //     match 開始前に free でプレイした残骸が残ったまま match→undo→free
      //     の経路を辿ると、free の undo が古い snapshot を読み出して盤面が
      //     ジャンプする潜在バグになる。リセットすればこのチェーンを断てる。
      const fresh: Partial<Pick<Store, 'game' | 'history' | 'freePlayerMoves' | 'animatingSteps' | 'poppingCells' | 'chainTexts' | 'landedCells'>> =
        fromMatchOrScore
          ? {
              game: createInitialState(Date.now() | 0),
              history: [],
              freePlayerMoves: [],
              animatingSteps: [],
              poppingCells: [],
              chainTexts: [],
              landedCells: [],
            }
          : {};
      set({
        aiGame: null,
        aiHistory: [],
        playerHistory: [],
        matchEnded: false,
        matchResult: null,
        matchTurnsPlayed: 0,
        viewing: 'player',
        aiHistoryViewIndex: null,
        playerHistoryViewIndex: null,
        historyAnim: null,
        loadedRecordId: null,
        currentDailyDate: null,
        ...fresh,
      });
    }
  },

  setMatchTurnLimit: (limit) => {
    persistTurnLimit(limit);
    set({ matchTurnLimit: limit });
  },

  startMatch: (opts) => {
    // Same reasoning as reset(): a rematch replaces game state, so any
    // in-flight history replay must be invalidated before we set new state.
    historyAnimSeq++;
    const seed = opts?.seed ?? (Date.now() | 0);
    // match モードは 'unlimited' を許可しない (ama 側もどこかで止まる必要がある)。
    // 'unlimited' を引き継いだら 100 にフォールバック。
    let turnLimit = opts?.turnLimit ?? get().matchTurnLimit;
    if (turnLimit === 'unlimited' || turnLimit === 200) turnLimit = 100;
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
      playerHistory: [],
      matchTurnsPlayed: 0,
      matchPlayerMoves: [],
      matchAiMoves: [],
      matchEnded: false,
      matchResult: null,
      loadedRecordId: null,
      currentDailyDate: null,
      viewing: 'player',
      aiHistoryViewIndex: null,
      playerHistoryViewIndex: null,
      historyAnim: null,
      animatingSteps: [],
      poppingCells: [],
      chainTexts: [],
      landedCells: [],
      history: [],
      aiStats: { ...EMPTY_AI_STATS },
      analyzing: false,
      // Free-mode の解析ログは match 開始時点で意味を失う(再開時に古い seed
      // 由来の手列を新しい盤面に当ててしまう)。空にしておく。
      freePlayerMoves: [],
    });
  },

  startScore: (opts) => {
    // 一人用 score モード。startMatch とほぼ同じだが ama は登場しないので
    // aiGame / aiHistory / matchAiMoves は空のまま。turnLimit は 30/50/100/
    // 200/'unlimited' を受け付ける。
    historyAnimSeq++;
    const seed = opts?.seed ?? (Date.now() | 0);
    const turnLimit = opts?.turnLimit ?? get().matchTurnLimit;
    persistMode('score');
    persistTurnLimit(turnLimit);
    const playerGame = createInitialState(seed);
    set({
      mode: 'score',
      matchTurnLimit: turnLimit,
      matchSeed: seed,
      // score では preset は意味を持たないが、保存スキーマを揃えるため空文字。
      matchPreset: '',
      game: playerGame,
      aiGame: null,
      aiHistory: [],
      playerHistory: [],
      matchTurnsPlayed: 0,
      matchPlayerMoves: [],
      matchAiMoves: [],
      matchEnded: false,
      matchResult: null,
      loadedRecordId: null,
      currentDailyDate: null,
      viewing: 'player',
      aiHistoryViewIndex: null,
      playerHistoryViewIndex: null,
      historyAnim: null,
      animatingSteps: [],
      poppingCells: [],
      chainTexts: [],
      landedCells: [],
      history: [],
      aiStats: { ...EMPTY_AI_STATS },
      analyzing: false,
      freePlayerMoves: [],
    });
  },

  quitScore: () => {
    const st = get();
    if ((st.mode !== 'score' && st.mode !== 'daily') || st.matchEnded) return;
    set({
      matchEnded: true,
      matchResult: {
        playerScore: st.game.score,
        aiScore: 0,
        // score / daily モードに勝敗は無いが、MatchResult 型を再利用しているので
        // 'player' を入れる (UI 側で score / daily モードかをチェックして表示を分岐)。
        winner: 'player',
      },
    });
  },

  startDaily: (opts) => {
    // デイリーモード: seed は dailySeedFor(today JST) で固定、turnLimit は
    // 50 手固定。同日中なら何度プレイしても同じぷよ列になる。 startScore と
    // ほぼ同じだが、 dailyDate を覚えておかないと終了後に「どの日のスコア」
    // としてサーバ送信するか分からないので、 store にも持たせる。
    historyAnimSeq++;
    const dailyDate = opts?.dailyDate ?? todayDateJst();
    const seed = dailySeedFor(dailyDate);
    const turnLimit: MatchTurnLimit = 50;
    persistMode('daily');
    persistTurnLimit(turnLimit);
    const playerGame = createInitialState(seed);
    set({
      mode: 'daily',
      matchTurnLimit: turnLimit,
      matchSeed: seed,
      matchPreset: '',
      currentDailyDate: dailyDate,
      game: playerGame,
      aiGame: null,
      aiHistory: [],
      playerHistory: [],
      matchTurnsPlayed: 0,
      matchPlayerMoves: [],
      matchAiMoves: [],
      matchEnded: false,
      matchResult: null,
      loadedRecordId: null,
      viewing: 'player',
      aiHistoryViewIndex: null,
      playerHistoryViewIndex: null,
      historyAnim: null,
      animatingSteps: [],
      poppingCells: [],
      chainTexts: [],
      landedCells: [],
      history: [],
      aiStats: { ...EMPTY_AI_STATS },
      analyzing: false,
      freePlayerMoves: [],
    });
  },

  loadRecord: (record) => {
    // 在ロード中のリプレイ表示や再生中のチェーンアニメは全部破棄。
    historyAnimSeq++;
    // record.mode が無い (legacy) は 'match' 扱い。
    const recMode: 'match' | 'score' | 'daily' = record.mode ?? 'match';
    persistMode(recMode);

    const sim = simulateRecordSide(
      record.seed,
      record.playerMoves,
      record.turnLimit,
    );
    // score / daily モードは ama 側が無いので simulate しない
    // (record.aiMoves は空配列)。
    const aiSim =
      recMode === 'match'
        ? simulateRecordSide(record.seed, record.aiMoves, record.turnLimit)
        : { history: [] as GameState[], lastState: null as GameState | null };

    // matchTurnLimit のリテラル型に揃える。turnLimit=0 は score モードの
    // 「無制限」のセンチネル。それ以外はサポート対象 (30/50/100/200) のみ
    // 採用し、未知の値 (legacy で 60 など) はデフォルト 50 にフォールバック。
    const VALID_LIMITS: ReadonlyArray<MatchTurnLimit> = [30, 50, 100, 200];
    const turnLimit: MatchTurnLimit =
      record.turnLimit <= 0
        ? 'unlimited'
        : VALID_LIMITS.includes(record.turnLimit as MatchTurnLimit)
          ? (record.turnLimit as MatchTurnLimit)
          : 50;

    set({
      mode: recMode,
      matchTurnLimit: turnLimit,
      matchSeed: record.seed,
      matchPreset: record.preset,
      // 末尾スナップショットをライブの game / aiGame に置く (Board が live
      // 側を見るパスに落ちたときも矛盾しないように)。
      game: sim.lastState,
      aiGame: aiSim.lastState,
      playerHistory: sim.history,
      aiHistory: aiSim.history,
      matchTurnsPlayed: sim.history.length,
      matchPlayerMoves: record.playerMoves,
      matchAiMoves: record.aiMoves,
      matchEnded: true,
      matchResult: {
        playerScore: record.playerScore,
        aiScore: record.aiScore,
        winner: record.winner,
      },
      loadedRecordId: record.id,
      currentDailyDate: recMode === 'daily' ? (record.dailyDate ?? null) : null,
      viewing: 'player',
      // 末尾を初期スクラブ位置に。null だと「ライブ追従」と区別がつかないが、
      // matchEnded=true なので Board 側は明示的に履歴 index を見にいく。
      aiHistoryViewIndex: Math.max(0, aiSim.history.length - 1),
      playerHistoryViewIndex: Math.max(0, sim.history.length - 1),
      historyAnim: null,
      animatingSteps: [],
      poppingCells: [],
      chainTexts: [],
      landedCells: [],
      history: [],
      aiStats: { ...EMPTY_AI_STATS },
      analyzing: false,
      freePlayerMoves: [],
    });
  },

  applyAiMove: (move) => {
    const st = get();
    const { aiGame, mode, matchEnded } = st;
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
    // Symmetric with the player side: skip spawnNext on the regulated last
    // turn so we don't dangle an unplayable pair on top of the AI board.
    // 'unlimited' は match モードでは弾いている (startMatch で 100 にフォール
    // バック) ので Infinity は来ない想定だが、念のため数値化。
    const aiAtLimit =
      st.aiHistory.length + 1 >= turnLimitToNumber(st.matchTurnLimit);
    const nextAiGame = aiAtLimit ? resolved : spawnNext(resolved);
    set((cur) => ({
      aiGame: nextAiGame,
      aiHistory: [...cur.aiHistory, nextAiGame],
      matchAiMoves: [
        ...cur.matchAiMoves,
        { axisCol: move.axisCol, rotation: move.rotation },
      ],
    }));
    get().finalizeMatchIfDone();
  },

  setViewing: (side) => {
    // Toggling sides invalidates any in-flight chain replay (the overlay
    // belongs to whichever side it was started on). Preserve each side's
    // scrub index so the user can flip back without losing their position.
    if (get().viewing !== side) {
      historyAnimSeq++;
      if (get().historyAnim) set({ historyAnim: null });
    }
    set({ viewing: side });
  },

  setAiHistoryViewIndex: (index) => {
    // Scrubbing cancels any chain replay so the user immediately sees the
    // snapshot for the new index instead of stale animation frames.
    historyAnimSeq++;
    if (get().historyAnim) set({ historyAnim: null });
    set({ aiHistoryViewIndex: index });
  },
  setPlayerHistoryViewIndex: (index) => {
    historyAnimSeq++;
    if (get().historyAnim) set({ historyAnim: null });
    set({ playerHistoryViewIndex: index });
  },

  cancelHistoryChain: () => {
    historyAnimSeq++;
    if (get().historyAnim) set({ historyAnim: null });
  },

  // Replay the chain that occurred on `index`-th turn of `side` by reconstructing
  // pre-state (history[index-1] or initial state) → applying the recorded move →
  // running resolveChain → animating each step into the historyAnim overlay.
  // Snapshot is reached once the overlay clears (its post-resolution field
  // matches history[index].field, so the visual transitions seamlessly).
  playHistoryChain: async (side, index) => {
    historyAnimSeq++;
    const seq = historyAnimSeq;
    const st0 = get();
    const history = side === 'ai' ? st0.aiHistory : st0.playerHistory;
    const moves = side === 'ai' ? st0.matchAiMoves : st0.matchPlayerMoves;
    const target = history[index];
    const move = moves[index];
    if (!target || target.chainCount === 0 || !move) {
      set({ historyAnim: null });
      return false;
    }
    const seed = st0.matchSeed;
    if (seed === null) {
      set({ historyAnim: null });
      return false;
    }
    const pre =
      index === 0 ? createInitialState(seed) : history[index - 1]!;
    if (!pre.current) {
      set({ historyAnim: null });
      return false;
    }

    const placed: ActivePair = {
      ...pre.current,
      axisCol: move.axisCol,
      rotation: move.rotation,
    };
    const locked = lockActive(pre.field, placed);
    const { steps } = resolveChain(locked);

    const cancelled = () => historyAnimSeq !== seq;

    set({
      historyAnim: {
        side,
        field: locked,
        current: null,
        poppingCells: [],
        chainTexts: [],
      },
    });
    if (steps.length > 0) await sleep(LOCK_PAUSE_MS);
    if (cancelled()) return false;

    for (const step of steps) {
      const avgRow =
        step.popped.reduce((a, p) => a + p.row, 0) / step.popped.length;
      const avgCol =
        step.popped.reduce((a, p) => a + p.col, 0) / step.popped.length;
      const textId = chainTextIdSeq++;
      set((st) =>
        st.historyAnim
          ? {
              historyAnim: {
                ...st.historyAnim,
                field: step.beforeField,
                poppingCells: step.popped.map((p) => ({
                  row: p.row,
                  col: p.col,
                })),
                chainTexts: [
                  ...st.historyAnim.chainTexts,
                  {
                    id: textId,
                    chainIndex: step.chainIndex,
                    row: avgRow,
                    col: avgCol,
                  },
                ],
              },
            }
          : {},
      );
      // Auto-fade the chain text. Same lifetime as live play so the look matches.
      setTimeout(() => {
        set((st) =>
          st.historyAnim
            ? {
                historyAnim: {
                  ...st.historyAnim,
                  chainTexts: st.historyAnim.chainTexts.filter(
                    (x) => x.id !== textId,
                  ),
                },
              }
            : {},
        );
      }, CHAIN_TEXT_LIFETIME_MS);
      await sleep(HIGHLIGHT_MS);
      if (cancelled()) return false;

      set((st) =>
        st.historyAnim
          ? {
              historyAnim: {
                ...st.historyAnim,
                field: step.afterPop,
                poppingCells: [],
              },
            }
          : {},
      );
      await sleep(POP_MS);
      if (cancelled()) return false;

      set((st) =>
        st.historyAnim
          ? { historyAnim: { ...st.historyAnim, field: step.afterGravity } }
          : {},
      );
      await sleep(GRAVITY_MS);
      if (cancelled()) return false;
    }

    if (cancelled()) return false;
    set({ historyAnim: null });
    return true;
  },

  finalizeMatchIfDone: () => {
    const st = get();
    if (st.matchEnded) return;
    const limit = turnLimitToNumber(st.matchTurnLimit);

    if (st.mode === 'score' || st.mode === 'daily') {
      // score / daily モードはターン上限到達 or top-out で終了。Quit ボタンは
      // 別経路 (quitScore) でセットされるのでここでは扱わない。'unlimited' は
      // limit が Infinity になるので top-out しか終了条件にならない (daily は
      // 50 手固定なので必ずターン到達で終わる)。
      const done =
        st.matchTurnsPlayed >= limit || st.game.status === 'gameover';
      if (!done) return;
      set({
        matchEnded: true,
        matchResult: {
          playerScore: st.game.score,
          aiScore: 0,
          winner: 'player',
        },
      });
      return;
    }

    if (st.mode !== 'match') return;
    const playerDone =
      st.matchTurnsPlayed >= limit || st.game.status === 'gameover';
    const aiDone =
      !st.aiGame ||
      st.aiHistory.length >= limit ||
      st.aiGame.status === 'gameover';
    if (!playerDone || !aiDone) return;
    const playerScore = st.game.score;
    const aiScore = st.aiGame ? st.aiGame.score : 0;
    const winner: MatchResult['winner'] =
      playerScore > aiScore ? 'player' : aiScore > playerScore ? 'ai' : 'draw';
    set({ matchEnded: true, matchResult: { playerScore, aiScore, winner } });
  },

  resignMatch: () => {
    const st = get();
    if (st.mode !== 'match' || st.matchEnded) return;
    const playerScore = st.game.score;
    const aiScore = st.aiGame ? st.aiGame.score : 0;
    set({
      matchEnded: true,
      matchResult: { playerScore, aiScore, winner: 'ai' },
    });
  },

  analyzeStats: async () => {
    const st0 = get();
    if (st0.analyzing) return;
    // match / score / daily いずれも matchPlayerMoves に手が記録されている。
    // free モードは freePlayerMoves。
    const usesMatchMoves =
      st0.mode === 'match' ||
      st0.mode === 'score' ||
      st0.mode === 'daily';
    const moves = usesMatchMoves ? st0.matchPlayerMoves : st0.freePlayerMoves;
    if (moves.length === 0) {
      set({ aiStats: { ...EMPTY_AI_STATS } });
      return;
    }
    const seed = usesMatchMoves ? (st0.matchSeed ?? null) : st0.game.rngSeed;
    if (seed === null) return;

    set({ analyzing: true, aiStats: { ...EMPTY_AI_STATS } });

    let state = createInitialState(seed);
    let measured = 0;
    let bestMatchCount = 0;
    let inListCount = 0;
    let pctSum = 0;
    for (const move of moves) {
      if (!state.current) break;
      // 起動中に mode/move 列が変わった (例: 解析中にユーザがリセット) なら中断。
      const stCheck = get();
      const stillUsesMatchMoves =
        stCheck.mode === 'match' ||
        stCheck.mode === 'score' ||
        stCheck.mode === 'daily';
      const stillSame =
        stCheck.analyzing &&
        (stillUsesMatchMoves
          ? stCheck.matchPlayerMoves === moves
          : stCheck.freePlayerMoves === moves);
      if (!stillSame) {
        // analyzing は別経路で false にされている想定 (reset/commit 等)。何もせず終了。
        return;
      }
      const aiMoves = await suggestForState(state, 5);
      if (aiMoves.length > 0) {
        measured++;
        const top = aiMoves[0]!;
        const topScore = aiMoves.reduce(
          (m, x) => Math.max(m, x.score ?? 0),
          0,
        );
        const inList = aiMoves.find(
          (m) => m.axisCol === move.axisCol && m.rotation === move.rotation,
        );
        if (top.axisCol === move.axisCol && top.rotation === move.rotation) {
          bestMatchCount++;
        }
        if (inList) {
          inListCount++;
          if (topScore > 0) {
            pctSum += Math.max(
              0,
              ((inList.score ?? 0) / topScore) * 100,
            );
          }
        }
      }
      state = commitMove(state, move);
    }
    set({
      aiStats: { measured, bestMatchCount, inListCount, pctSum },
      analyzing: false,
    });
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
      // Pre-edit state was already a valid replay of `freePlayerMoves` from
      // `rngSeed`, so the move log stays consistent.
      set({
        game: {
          ...st.game,
          field: st.editSnapshot.field,
          current: st.editSnapshot.current,
          nextQueue: st.editSnapshot.nextQueue,
          status: st.editSnapshot.current ? 'playing' : 'gameover',
        },
      });
      set({ editing: false, editSnapshot: null });
      return;
    }
    // Apply: keep edited board. The board now diverges from what
    // `rngSeed + freePlayerMoves` would produce, so the analysis baseline is
    // no longer valid — drop the move log and any previously analyzed stats.
    set({
      editing: false,
      editSnapshot: null,
      freePlayerMoves: [],
      aiStats: { ...EMPTY_AI_STATS },
      analyzing: false,
    });
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
      aiStats: { ...EMPTY_AI_STATS },
      analyzing: false,
      freePlayerMoves: [],
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
