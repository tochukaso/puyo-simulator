import { useGameStore } from '../../store';
import { useT } from '../../../i18n';

export function Stats() {
  const { score, chainCount, totalChains, maxChain, status } = useGameStore((s) => s.game);
  const aiStats = useGameStore((s) => s.aiStats);
  const analyzing = useGameStore((s) => s.analyzing);
  const mode = useGameStore((s) => s.mode);
  const matchEnded = useGameStore((s) => s.matchEnded);
  const freePlayerMoves = useGameStore((s) => s.freePlayerMoves);
  const matchPlayerMoves = useGameStore((s) => s.matchPlayerMoves);
  const analyzeStats = useGameStore((s) => s.analyzeStats);
  const t = useT();

  // Derived stats. Top-1 match rate over ALL measured moves, and average
  // evaluation % over the subset that was within the AI's topK list.
  const matchPct =
    aiStats.measured > 0
      ? Math.round((aiStats.bestMatchCount / aiStats.measured) * 100)
      : null;
  const avgPct =
    aiStats.inListCount > 0
      ? Math.round(aiStats.pctSum / aiStats.inListCount)
      : null;

  // 解析ボタンの可否。
  // - free モードはいつでも(まだ手があれば)
  // - match モードはマッチ終了後だけ(進行中に走らせるとプレイヤー側 AI が
  //   動いて意味的にマッチの公平性を疑われるし、単に蛇足)
  const moveCount =
    mode === 'match' ? matchPlayerMoves.length : freePlayerMoves.length;
  const canAnalyze =
    !analyzing &&
    moveCount > 0 &&
    (mode === 'free' || (mode === 'match' && matchEnded));

  return (
    <div className="flex flex-wrap gap-x-4 gap-y-1 text-sm text-slate-300 items-center">
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
          {analyzing ? '…' : matchPct === null ? '-' : `${matchPct}%`}
        </b>
        <span className="text-slate-500"> ({aiStats.measured})</span>
      </span>
      <span title={t('stats.aiAvgTitle')}>
        {t('stats.aiAvg')}:{' '}
        <b className="text-emerald-300">
          {analyzing ? '…' : avgPct === null ? '-' : `${avgPct}%`}
        </b>
        <span className="text-slate-500"> ({aiStats.inListCount})</span>
      </span>
      <button
        type="button"
        disabled={!canAnalyze}
        onClick={() => {
          void analyzeStats();
        }}
        className="px-2 py-0.5 text-xs rounded bg-slate-700 hover:bg-slate-600 disabled:opacity-50 disabled:cursor-not-allowed"
        title={t('stats.analyzeTitle')}
      >
        {analyzing ? t('stats.analyzing') : t('stats.analyze')}
      </button>
      {status === 'gameover' && <span className="text-red-400">{t('stats.gameOver')}</span>}
    </div>
  );
}
