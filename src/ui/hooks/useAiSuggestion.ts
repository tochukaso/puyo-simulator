import { useEffect, useState, useRef, useCallback } from 'react';
import { useGameStore } from '../store';
import type { Move } from '../../game/types';

type Kind = 'heuristic' | 'ml-v1' | 'ml-ama-v1';

// シングルトン Worker: Header のセレクタと Suggestion Hook が同じ Worker を
// 共有し、set-ai で AI を切り替えると次の suggest からそれが使われる。
let workerSingleton: Worker | null = null;
const suggestHandlers = new Set<(msg: { id: number; moves: Move[] }) => void>();

function getWorker(): Worker {
  if (workerSingleton) return workerSingleton;
  const w = new Worker(new URL('../../ai/worker/ai.worker.ts', import.meta.url), {
    type: 'module',
  });
  w.onmessage = (e: MessageEvent<{ type: string; id?: number; moves?: Move[] }>) => {
    if (e.data.type === 'suggest' && typeof e.data.id === 'number' && e.data.moves) {
      for (const h of suggestHandlers) h({ id: e.data.id, moves: e.data.moves });
    }
  };
  workerSingleton = w;
  return w;
}

export function setAiKind(kind: Kind): void {
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
  const idRef = useRef(0);

  const handleSuggest = useCallback((msg: { id: number; moves: Move[] }) => {
    if (msg.id === idRef.current) {
      setMoves(msg.moves);
      setLoading(false);
    }
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
    const id = ++idRef.current;
    getWorker().postMessage({ type: 'suggest', id, state: fullGame, topK });
    setLoading(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [field, currentPair, nextQueue, status, topK]);

  return { moves, loading };
}
