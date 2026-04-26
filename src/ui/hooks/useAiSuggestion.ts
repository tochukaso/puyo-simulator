import { useEffect, useMemo, useState, useSyncExternalStore } from 'react';
import { useGameStore } from '../store';
import type { GameState, Move } from '../../game/types';
import type { AiKind as Kind } from '../../ai/types';
import type { AmaVariant } from '../../ai/wasm-ama/wasm-loader';

// シングルトン Worker: Header のセレクタと Suggestion Hook が同じ Worker を
// 共有し、set-ai で AI を切り替えると次の suggest からそれが使われる。
let workerSingleton: Worker | null = null;

// 同一ツモに対する suggest は Board / CandidateList / Controls の 3 か所から
// 並行して欲しがられるが、WASM ama_suggest は topK に関わらず毎回フル探索
// するため 3 回送ると 3 倍時間がかかる(ゴースト→候補→AI Best と段階的に
// UI が出てくる体感ラグの正体)。なので Worker への送信はモジュール
// レベルで 1 局面 1 回に集約し、結果を購読する形にする。
const SHARED_TOPK = 5;

type SharedState = {
  moves: Move[];
  loading: boolean;
  // 同一 GameState(参照比較)に対しては再送しないための目印。
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
      // 古い局面の応答(間に新しい requestSuggestFor が走った)は破棄。
      if (e.data.id !== shared.pendingId) return;
      shared = {
        moves: e.data.moves,
        loading: false,
        requestedFor: shared.requestedFor,
        pendingId: shared.pendingId,
      };
      notify();
    } else if (e.data.type === 'set-ai' && e.data.kind && typeof e.data.ok === 'boolean') {
      if (e.data.kind === currentAiKind) currentAiReady = e.data.ok;
      for (const h of aiReadyHandlers) h(e.data.kind, e.data.ok);
    }
  };
  workerSingleton = w;
  return w;
}

export function setAiKind(kind: Kind, preset?: string, variant?: AmaVariant): void {
  currentAiKind = kind;
  currentAiReady = false;
  for (const h of aiReadyHandlers) h(kind, false);
  getWorker().postMessage({ type: 'set-ai', kind, preset, variant });
}

function requestSuggestFor(state: GameState): void {
  // 既に同じ局面へ依頼中(他 hook が先に送った)なら何もしない。
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
  // pendingId を進めることで、AI 切替前に投げた suggest の応答が
  // クリア後に届いても shared にマージされないようにする。
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
      // AI ロード中は suggest を送らない。古い AI(別 kind)の結果を表示し
      // 続けないように、共有 state をクリアする。
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
