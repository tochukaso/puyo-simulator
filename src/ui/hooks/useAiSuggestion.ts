import { useEffect, useState, useRef } from 'react';
import { useGameStore } from '../store';
import type { Move } from '../../game/types';

export function useAiSuggestion(topK = 5) {
  const game = useGameStore((s) => s.game);
  const [moves, setMoves] = useState<Move[]>([]);
  const [loading, setLoading] = useState(false);
  const workerRef = useRef<Worker | null>(null);
  const idRef = useRef(0);

  useEffect(() => {
    const worker = new Worker(new URL('../../ai/worker/ai.worker.ts', import.meta.url), {
      type: 'module',
    });
    workerRef.current = worker;
    worker.onmessage = (e: MessageEvent<{ id: number; moves: Move[] }>) => {
      if (e.data.id === idRef.current) {
        setMoves(e.data.moves);
        setLoading(false);
      }
    };
    return () => worker.terminate();
  }, []);

  useEffect(() => {
    if (!game.current || game.status !== 'playing') return;
    const id = ++idRef.current;
    setLoading(true);
    workerRef.current?.postMessage({ id, state: game, topK });
  }, [game.current, game.status, topK]);

  return { moves, loading };
}
