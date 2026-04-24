import { useEffect, useState, useRef, useCallback } from 'react';
import { useGameStore } from '../store';
import type { Move } from '../../game/types';

export function useAiSuggestion(topK = 5) {
  // AI の推奨手は field / 現在ツモの色 / NEXT / 状態 にのみ依存する。
  // current.axisRow, axisCol, rotation はユーザが動かしても推奨自体には影響しないので、
  // それらを依存に含めない(余計な再計算で Worker を詰まらせない)。
  const field = useGameStore((s) => s.game.field);
  const currentPair = useGameStore((s) => s.game.current?.pair);
  const nextQueue = useGameStore((s) => s.game.nextQueue);
  const status = useGameStore((s) => s.game.status);
  const fullGame = useGameStore((s) => s.game);

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
    if (!currentPair || status !== 'playing') return;
    const id = ++idRef.current;
    workerRef.current?.postMessage({ id, state: fullGame, topK });
    setLoading(true);
    // 再計算するのは field / pair / nextQueue / status / topK が変わった時のみ
    // fullGame は postMessage 用にだけ使い、依存からは外す
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [field, currentPair, nextQueue, status, topK]);

  return { moves, loading };
}
