import { useEffect, useState, useRef, useCallback } from 'react';
import { useGameStore } from '../store';
import type { Move } from '../../game/types';
import type { AiKind as Kind } from '../../ai/types';

// シングルトン Worker: Header のセレクタと Suggestion Hook が同じ Worker を
// 共有し、set-ai で AI を切り替えると次の suggest からそれが使われる。
let workerSingleton: Worker | null = null;
const suggestHandlers = new Set<(msg: { id: number; moves: Move[] }) => void>();

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
      for (const h of suggestHandlers) h({ id: e.data.id, moves: e.data.moves });
    } else if (e.data.type === 'set-ai' && e.data.kind && typeof e.data.ok === 'boolean') {
      if (e.data.kind === currentAiKind) currentAiReady = e.data.ok;
      for (const h of aiReadyHandlers) h(e.data.kind, e.data.ok);
    }
  };
  workerSingleton = w;
  return w;
}

export function setAiKind(kind: Kind): void {
  currentAiKind = kind;
  currentAiReady = false;
  for (const h of aiReadyHandlers) h(kind, false);
  getWorker().postMessage({ type: 'set-ai', kind });
}

export function useAiSuggestion(topK = 5) {
  const field = useGameStore((s) => s.game.field);
  const currentPair = useGameStore((s) => s.game.current?.pair);
  const nextQueue = useGameStore((s) => s.game.nextQueue);
  const status = useGameStore((s) => s.game.status);
  const fullGame = useGameStore((s) => s.game);

  const [moves, setMoves] = useState<Move[]>([]);
  const [loading, setLoading] = useState(false);
  const [aiKind, setAiKindState] = useState<Kind>(currentAiKind);
  const [aiReady, setAiReady] = useState<boolean>(currentAiReady);
  const idRef = useRef(0);

  const handleSuggest = useCallback((msg: { id: number; moves: Move[] }) => {
    if (msg.id === idRef.current) {
      setMoves(msg.moves);
      setLoading(false);
    }
  }, []);

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
    suggestHandlers.add(handleSuggest);
    return () => {
      suggestHandlers.delete(handleSuggest);
    };
  }, [handleSuggest]);

  useEffect(() => {
    if (!currentPair || status !== 'playing') return;
    if (!aiReady) {
      // AI がロード中の間は suggest を送らない。古い AI(別 kind)から suggest が
      // 戻ってくるのを避けるため、moves はクリアしておく。
      setMoves([]);
      setLoading(false);
      return;
    }
    const id = ++idRef.current;
    // Clear stale moves so the candidate list and board ghost don't display
    // the previous turn's suggestion while ama recomputes.
    setMoves([]);
    getWorker().postMessage({ type: 'suggest', id, state: fullGame, topK });
    setLoading(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [field, currentPair, nextQueue, status, topK, aiReady]);

  return { moves, loading, aiKind, aiReady };
}
