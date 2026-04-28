import { useGameStore } from '../../store';
import { useT } from '../../../i18n';

// Live status panel for match mode: turn counter, dual scores, side toggle,
// and (when applicable) an AI history scrubber. Hidden in 'free' mode.
export function MatchPanel() {
  const mode = useGameStore((s) => s.mode);
  const matchTurnLimit = useGameStore((s) => s.matchTurnLimit);
  const matchTurnsPlayed = useGameStore((s) => s.matchTurnsPlayed);
  const playerScore = useGameStore((s) => s.game.score);
  const aiGame = useGameStore((s) => s.aiGame);
  const aiHistory = useGameStore((s) => s.aiHistory);
  const aiHistoryViewIndex = useGameStore((s) => s.aiHistoryViewIndex);
  const viewing = useGameStore((s) => s.viewing);
  const matchEnded = useGameStore((s) => s.matchEnded);
  const matchResult = useGameStore((s) => s.matchResult);
  const setViewing = useGameStore((s) => s.setViewing);
  const setAiHistoryViewIndex = useGameStore((s) => s.setAiHistoryViewIndex);
  const startMatch = useGameStore((s) => s.startMatch);
  const t = useT();

  if (mode !== 'match') return null;

  const aiScore = aiGame?.score ?? 0;
  const remaining = Math.max(0, matchTurnLimit - matchTurnsPlayed);
  const aiTurns = aiHistory.length;
  // Slider only meaningful when there's at least one AI snapshot.
  const sliderMax = Math.max(0, aiTurns - 1);
  const sliderValue =
    aiHistoryViewIndex !== null
      ? Math.min(aiHistoryViewIndex, sliderMax)
      : sliderMax;

  return (
    <div
      className="w-full bg-slate-900 border border-slate-700 rounded p-2 text-xs flex flex-col gap-2"
      data-no-gesture
    >
      <div className="flex flex-wrap gap-x-3 gap-y-1 items-baseline">
        <span className="text-slate-300">
          {t('match.turn')}:{' '}
          <b className="text-white tabular-nums">
            {matchTurnsPlayed}/{matchTurnLimit}
          </b>
          <span className="text-slate-500"> ({t('match.remaining', { n: remaining })})</span>
        </span>
        <span className="text-slate-300">
          {t('match.you')}:{' '}
          <b className="text-emerald-300 tabular-nums">
            {playerScore.toLocaleString()}
          </b>
        </span>
        <span className="text-slate-300">
          {t('match.ama')}:{' '}
          <b className="text-amber-300 tabular-nums">{aiScore.toLocaleString()}</b>
        </span>
      </div>

      <div className="flex flex-wrap gap-2 items-center">
        <div className="inline-flex rounded overflow-hidden border border-slate-700">
          <button
            type="button"
            onClick={() => setViewing('player')}
            className={`px-2 py-1 text-xs ${
              viewing === 'player'
                ? 'bg-blue-600 text-white'
                : 'bg-slate-800 text-slate-300 hover:bg-slate-700'
            }`}
          >
            {t('match.viewYou')}
          </button>
          <button
            type="button"
            onClick={() => setViewing('ai')}
            className={`px-2 py-1 text-xs ${
              viewing === 'ai'
                ? 'bg-blue-600 text-white'
                : 'bg-slate-800 text-slate-300 hover:bg-slate-700'
            }`}
          >
            {t('match.viewAi')}
          </button>
        </div>
        {viewing === 'ai' && aiTurns > 0 && (
          <div className="flex flex-wrap items-center gap-1 grow min-w-0">
            <input
              aria-label={t('match.scrub')}
              type="range"
              min={0}
              max={sliderMax}
              value={sliderValue}
              onChange={(e) => setAiHistoryViewIndex(Number(e.target.value))}
              className="grow accent-blue-500 min-w-0"
            />
            <span className="text-slate-500 tabular-nums whitespace-nowrap">
              {sliderValue + 1}/{aiTurns}
            </span>
            <button
              type="button"
              onClick={() => setAiHistoryViewIndex(null)}
              className="px-2 py-0.5 bg-slate-800 hover:bg-slate-700 rounded text-xs"
            >
              {t('match.live')}
            </button>
          </div>
        )}
      </div>

      {matchEnded && matchResult && (
        <div className="border-t border-slate-700 pt-2 flex flex-wrap items-center gap-3">
          <span className="text-base">
            {matchResult.winner === 'player'
              ? `🏆 ${t('match.youWin')}`
              : matchResult.winner === 'ai'
              ? `🤖 ${t('match.amaWin')}`
              : t('match.draw')}
          </span>
          <span className="text-slate-400">
            {playerScore.toLocaleString()} vs {aiScore.toLocaleString()}
          </span>
          <button
            type="button"
            onClick={() => startMatch({ turnLimit: matchTurnLimit })}
            className="px-2 py-1 bg-emerald-600 hover:bg-emerald-500 rounded text-xs"
          >
            {t('match.rematch')}
          </button>
        </div>
      )}
    </div>
  );
}
