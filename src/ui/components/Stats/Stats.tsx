import { useGameStore } from '../../store';
import { useT } from '../../../i18n';

export function Stats() {
  const { score, chainCount, totalChains, maxChain, status } = useGameStore((s) => s.game);
  const t = useT();
  return (
    <div className="flex gap-4 text-sm text-slate-300">
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
      {status === 'gameover' && <span className="text-red-400">{t('stats.gameOver')}</span>}
    </div>
  );
}
