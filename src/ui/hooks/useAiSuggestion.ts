import { useEffect, useState, useRef, useCallback } from 'react';
import { useGameStore } from '../store';
import type { Move } from '../../game/types';

export function useAiSuggestion(topK = 5) {
  const game = useGameStore((s) => s.game);
  const [moves, setMoves] = useState<Move[]>([]);
  const [loading, setLoading] = useState(false);
  const workerRef = useRef<Worker | null>(null);
  const idRef = useRef(0);

  const handleMessage = useCallback((e: MessageEvent<{ id: number; moves: Move[] }>) => {
    if (e.data.id === idRef.current) {
      setMoves(e.data.moves);
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const worker = new Worker(new URL('../../ai/worker/ai.worker.ts', import.meta.url), {
      type: 'module',
    });
    workerRef.current = worker;
    worker.onmessage = handleMessage;
    return () => worker.terminate();
  }, [handleMessage]);

  useEffect(() => {
    if (!game.current || game.status !== 'playing') return;
    const id = ++idRef.current;
    workerRef.current?.postMessage({ id, state: game, topK });
    setLoading(true);
  }, [game, topK]);

  return { moves, loading };
}
