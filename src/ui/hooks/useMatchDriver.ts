import { useEffect, useRef } from 'react';
import { useGameStore } from '../store';
import { suggestForState } from './useAiSuggestion';
import { searchEndgameMove } from '../../match/endgameSearch';

/**
 * Drives the AI's auto-play during a match. After each player commit (= a new
 * pair has been spawned, hence `aiHistory.length < matchTurnsPlayed`), this
 * hook computes the AI's next move on its parallel state and applies it.
 *
 * Move selection:
 *   - When >3 turns remain: defer to the worker's active AI (ama-wasm beam).
 *   - When ≤3 turns remain: brute-force depth-≤3 search to pick the placement
 *     that yields the highest banked score over the remaining turns.
 *     This overrides ama's "build forever" bias when there's no future left
 *     to build for.
 *
 * Runs as a single in-flight scheduler; if the player commits faster than the
 * AI can respond, requests serialize (no overlap).
 */
export function useMatchDriver(): void {
  const mode = useGameStore((s) => s.mode);
  const matchEnded = useGameStore((s) => s.matchEnded);
  const matchTurnsPlayed = useGameStore((s) => s.matchTurnsPlayed);
  const matchTurnLimit = useGameStore((s) => s.matchTurnLimit);
  const aiGame = useGameStore((s) => s.aiGame);
  const aiHistoryLength = useGameStore((s) => s.aiHistory.length);
  const applyAiMove = useGameStore((s) => s.applyAiMove);

  const inFlight = useRef(false);

  useEffect(() => {
    if (mode !== 'match') return;
    if (matchEnded) return;
    if (!aiGame || !aiGame.current) return;
    // AI is one move "behind" the player's turn count when the player just
    // committed. We catch up by playing exactly one move per pending player turn.
    const owed = matchTurnsPlayed - aiHistoryLength;
    if (owed <= 0) return;
    if (inFlight.current) return;

    inFlight.current = true;
    void (async () => {
      try {
        const remainingForAi = Math.max(0, matchTurnLimit - aiHistoryLength);
        const lookahead = Math.min(remainingForAi, 3);
        let chosen;
        if (remainingForAi <= 3) {
          // Endgame: switch to local brute-force chain search.
          chosen = searchEndgameMove(aiGame, lookahead).move;
          // Fallback if no legal moves found (shouldn't really happen unless gameover).
          if (!chosen) {
            const fallback = await suggestForState(aiGame, 1);
            chosen = fallback[0] ?? null;
          }
        } else {
          // Mid-match: defer to the worker's beam search.
          const moves = await suggestForState(aiGame, 1);
          chosen = moves[0] ?? null;
        }
        if (chosen) applyAiMove(chosen);
      } finally {
        inFlight.current = false;
      }
    })();
  }, [
    mode,
    matchEnded,
    matchTurnsPlayed,
    matchTurnLimit,
    aiGame,
    aiHistoryLength,
    applyAiMove,
  ]);
}
