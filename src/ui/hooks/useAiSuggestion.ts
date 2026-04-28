import { useEffect, useMemo, useState, useSyncExternalStore } from 'react';
import { useGameStore } from '../store';
import type { GameState, Move } from '../../game/types';
import type { AiKind as Kind } from '../../ai/types';

// Singleton Worker: the Header selector and the Suggestion hook share the
// same Worker; when set-ai switches the AI, the next suggest uses the new one.
let workerSingleton: Worker | null = null;

// suggest for the current pair is wanted concurrently from three places
// (Board / CandidateList / Controls). The WASM ama_suggest does a full search
// regardless of topK, so issuing it three times costs ~3x the latency (this
// is what causes the staggered "ghost → candidate list → AI Best" appearance
// the user perceives as lag). We therefore coalesce Worker dispatch at module
// level — one request per game state — and have hooks subscribe to the result.
const SHARED_TOPK = 5;

type SharedState = {
  moves: Move[];
  loading: boolean;
  // Marker used to suppress re-sending for the same GameState (compared by reference).
  requestedFor: GameState | null;
  pendingId: number;
};

let shared: SharedState = {
  moves: [],
  loading: false,
  requestedFor: null,
  pendingId: 0,
};

const subscribers = new Set<() => void>();
function notify(): void {
  for (const cb of subscribers) cb();
}
function subscribe(cb: () => void): () => void {
  subscribers.add(cb);
  return () => {
    subscribers.delete(cb);
  };
}

let nextSuggestId = 0;

type AiReadyHandler = (kind: Kind, ok: boolean) => void;
const aiReadyHandlers = new Set<AiReadyHandler>();
let currentAiKind: Kind = 'ml-ama-v1';
let currentAiReady = false;

// One-shot suggest pending resolvers, keyed by request id.
const suggestOnceResolvers = new Map<number, (moves: Move[]) => void>();
let nextSuggestOnceId = 1_000_000; // Disjoint from regular suggest ids.

function getWorker(): Worker {
  if (workerSingleton) return workerSingleton;
  const w = new Worker(new URL('../../ai/worker/ai.worker.ts', import.meta.url), {
    type: 'module',
  });
  w.onmessage = (e: MessageEvent<{
    type: string;
    id?: number;
    moves?: Move[];
    kind?: Kind;
    ok?: boolean;
  }>) => {
    if (e.data.type === 'suggest' && typeof e.data.id === 'number' && e.data.moves) {
      // Drop responses for stale game states (a newer requestSuggestFor ran in between).
      if (e.data.id !== shared.pendingId) return;
      shared = {
        moves: e.data.moves,
        loading: false,
        requestedFor: shared.requestedFor,
        pendingId: shared.pendingId,
      };
      notify();
    } else if (
      e.data.type === 'suggest-once' &&
      typeof e.data.id === 'number' &&
      e.data.moves
    ) {
      const r = suggestOnceResolvers.get(e.data.id);
      if (r) {
        suggestOnceResolvers.delete(e.data.id);
        r(e.data.moves);
      }
    } else if (e.data.type === 'set-ai' && e.data.kind && typeof e.data.ok === 'boolean') {
      if (e.data.kind === currentAiKind) currentAiReady = e.data.ok;
      for (const h of aiReadyHandlers) h(e.data.kind, e.data.ok);
    }
  };
  workerSingleton = w;
  return w;
}

// Fire-and-await suggest for an arbitrary state. Returns whatever the worker's
// active AI produces (top `topK` candidates ranked best-first). Does not affect
// the shared player-UI subscription stream. Resolves to [] on worker error.
export function suggestForState(state: GameState, topK: number = 1): Promise<Move[]> {
  const id = nextSuggestOnceId++;
  return new Promise<Move[]>((resolve) => {
    suggestOnceResolvers.set(id, resolve);
    getWorker().postMessage({ type: 'suggest-once', id, state, topK });
  });
}

export function setAiKind(kind: Kind, preset?: string): void {
  currentAiKind = kind;
  currentAiReady = false;
  for (const h of aiReadyHandlers) h(kind, false);
  getWorker().postMessage({ type: 'set-ai', kind, preset });
}

// Snapshot of the AI's most recent topK moves for the current GameState.
// Used at commit time to score the user's move against the AI's evaluation.
// Returns null if no suggestion has arrived yet (i.e. AI is still thinking
// for this state, or the game is not in a state where suggestions apply).
export function getCurrentAiMoves(): { state: GameState; moves: Move[] } | null {
  if (!shared.requestedFor) return null;
  return { state: shared.requestedFor, moves: shared.moves };
}

function requestSuggestFor(state: GameState): void {
  // Already requested for this exact state (another hook beat us to it) — no-op.
  if (shared.requestedFor === state) return;
  const id = ++nextSuggestId;
  shared = {
    moves: [],
    loading: true,
    requestedFor: state,
    pendingId: id,
  };
  notify();
  getWorker().postMessage({ type: 'suggest', id, state, topK: SHARED_TOPK });
}

function clearShared(): void {
  if (
    shared.moves.length === 0 &&
    !shared.loading &&
    shared.requestedFor === null
  ) {
    return;
  }
  // Bumping pendingId ensures that any suggest dispatched before the AI
  // switch won't be merged into shared once its response arrives after the clear.
  shared = { moves: [], loading: false, requestedFor: null, pendingId: ++nextSuggestId };
  notify();
}

const getMovesSnapshot = (): Move[] => shared.moves;
const getLoadingSnapshot = (): boolean => shared.loading;

export function useAiSuggestion(topK: number = SHARED_TOPK) {
  const field = useGameStore((s) => s.game.field);
  const currentPair = useGameStore((s) => s.game.current?.pair);
  const nextQueue = useGameStore((s) => s.game.nextQueue);
  const status = useGameStore((s) => s.game.status);
  const fullGame = useGameStore((s) => s.game);

  const allMoves = useSyncExternalStore(subscribe, getMovesSnapshot, getMovesSnapshot);
  const loading = useSyncExternalStore(subscribe, getLoadingSnapshot, getLoadingSnapshot);
  const [aiKind, setAiKindState] = useState<Kind>(currentAiKind);
  const [aiReady, setAiReady] = useState<boolean>(currentAiReady);

  useEffect(() => {
    const handler: AiReadyHandler = (kind, ok) => {
      setAiKindState(kind);
      setAiReady(ok);
    };
    aiReadyHandlers.add(handler);
    return () => {
      aiReadyHandlers.delete(handler);
    };
  }, []);

  useEffect(() => {
    getWorker();
  }, []);

  useEffect(() => {
    if (!currentPair || status !== 'playing') return;
    if (!aiReady) {
      // While the AI is loading, don't send suggest requests. Clear shared
      // state so we don't keep showing results from the previous AI (a
      // different kind).
      clearShared();
      return;
    }
    requestSuggestFor(fullGame);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [field, currentPair, nextQueue, status, aiReady]);

  const moves = useMemo(
    () => (topK >= allMoves.length ? allMoves : allMoves.slice(0, topK)),
    [allMoves, topK],
  );

  return { moves, loading, aiKind, aiReady };
}
