import { useGameStore } from '../../store';
import { useT } from '../../../i18n';

export function Stats() {
  const { score, chainCount, totalChains, maxChain, status } = useGameStore((s) => s.game);
  const aiStats = useGameStore((s) => s.aiStats);
  const t = useT();

  // Derived stats. We use top-1 match rate over ALL measured user moves, and
  // average evaluation % over the subset that was within the AI's topK list
  // (moves outside topK have no scored point of comparison; we'd need a wider
  // topK from the WASM to evaluate those properly).
  const matchPct =
    aiStats.measured > 0
      ? Math.round((aiStats.bestMatchCount / aiStats.measured) * 100)
      : null;
  const avgPct =
    aiStats.inListCount > 0
      ? Math.round(aiStats.pctSum / aiStats.inListCount)
      : null;

  return (
    <div className="flex flex-wrap gap-x-4 gap-y-1 text-sm text-slate-300">
      <span>
        {t('stats.score')}: <b className="text-white">{score.toLocaleString()}</b>
      </span>
      <span>
        {t('stats.chain')}: <b className="text-white">{chainCount}</b>
      </span>
      <span>
        {t('stats.max')}: <b className="text-amber-300">{maxChain}</b>
      </span>
      <span>
        {t('stats.total')}: <b className="text-white">{totalChains}</b>
      </span>
      <span title={t('stats.aiMatchTitle')}>
        {t('stats.aiMatch')}:{' '}
        <b className="text-emerald-300">
          {matchPct === null ? '-' : `${matchPct}%`}
        </b>
        <span className="text-slate-500"> ({aiStats.measured})</span>
      </span>
      <span title={t('stats.aiAvgTitle')}>
        {t('stats.aiAvg')}:{' '}
        <b className="text-emerald-300">
          {avgPct === null ? '-' : `${avgPct}%`}
        </b>
        <span className="text-slate-500"> ({aiStats.inListCount})</span>
      </span>
      {status === 'gameover' && <span className="text-red-400">{t('stats.gameOver')}</span>}
    </div>
  );
}
