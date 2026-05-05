import { useEffect, useRef } from 'react';
import { useGameStore, turnLimitToNumber } from '../store';
import { suggestForState } from './useAiSuggestion';
import { searchEndgameMove } from '../../match/endgameSearch';

/**
 * Drives the AI's auto-play during a match. ama plays its full `matchTurnLimit`
 * turns at AI speed, independently of the player's pace — otherwise a slow
 * (or paused) human player would also block ama's queue advance, which the
 * user found confusing. The puyo sequence is deterministic from `matchSeed`,
 * so both sides see the same pairs even when ama runs ahead.
 *
 * Move selection:
 *   - When >3 turns remain: defer to the worker's active AI (ama-wasm beam).
 *   - When ≤3 turns remain: brute-force depth-≤3 search to pick the placement
 *     that yields the highest banked score over the remaining turns.
 *     This overrides ama's "build forever" bias when there's no future left
 *     to build for.
 *
 * Runs as a single in-flight scheduler; ama plays one move at a time, and when
 * each move applies the next render tick re-fires the effect for the next move.
 */
export function useMatchDriver(): void {
  const mode = useGameStore((s) => s.mode);
  const matchEnded = useGameStore((s) => s.matchEnded);
  const matchTurnLimit = useGameStore((s) => s.matchTurnLimit);
  const aiGame = useGameStore((s) => s.aiGame);
  const aiHistoryLength = useGameStore((s) => s.aiHistory.length);
  const applyAiMove = useGameStore((s) => s.applyAiMove);

  const inFlight = useRef(false);

  useEffect(() => {
    if (mode !== 'match') return;
    if (matchEnded) return;
    if (!aiGame || !aiGame.current) return;
    // match モードでは matchTurnLimit に 'unlimited' は来ない (startMatch
    // 側で 100 にフォールバック) が、念のため数値化。
    const remainingForAi = Math.max(
      0,
      turnLimitToNumber(matchTurnLimit) - aiHistoryLength,
    );
    if (remainingForAi <= 0) return;
    if (inFlight.current) return;

    inFlight.current = true;
    void (async () => {
      try {
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
    matchTurnLimit,
    aiGame,
    aiHistoryLength,
    applyAiMove,
  ]);
}
