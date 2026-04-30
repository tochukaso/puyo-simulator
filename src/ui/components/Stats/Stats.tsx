import { useGameStore } from '../../store';
import { useT } from '../../../i18n';
import { confirmDialog } from '../../utils/dialog';

// プレイ中常時表示する基礎スタッツバー。AI Match% / AI Eval% は普段邪魔に
// なるのでここからは外し、ハンバーガーメニュー → 解析モーダル経由で見る形に。
export function Stats() {
  const liveGame = useGameStore((s) => s.game);
  const aiGame = useGameStore((s) => s.aiGame);
  const aiHistory = useGameStore((s) => s.aiHistory);
  const aiHistoryViewIndex = useGameStore((s) => s.aiHistoryViewIndex);
  const playerHistory = useGameStore((s) => s.playerHistory);
  const playerHistoryViewIndex = useGameStore((s) => s.playerHistoryViewIndex);
  const viewing = useGameStore((s) => s.viewing);
  // Board / NextQueue と同じ side-aware 選択。ama 観戦中はそちらの値、player
  // スクラブ中はそのスナップショット、それ以外は live。これで数値と盤面が
  // 食い違わない (ama 観戦中に player の score が出る、を防ぐ)。
  const snapshot =
    viewing === 'ai'
      ? aiHistoryViewIndex !== null
        ? (aiHistory[aiHistoryViewIndex] ?? aiGame ?? liveGame)
        : (aiGame ?? liveGame)
      : playerHistoryViewIndex !== null
        ? (playerHistory[playerHistoryViewIndex] ?? liveGame)
        : liveGame;
  const { score, chainCount, totalChains, maxChain, status } = snapshot;
  const mode = useGameStore((s) => s.mode);
  const matchEnded = useGameStore((s) => s.matchEnded);
  const resignMatch = useGameStore((s) => s.resignMatch);
  const t = useT();

  // 投了ボタンは match 進行中のみ。top-out 後も matchEnded になるまでは
  // ama の完走を待たずに即終了できるよう一貫して出す。
  const showResign = mode === 'match' && !matchEnded;

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
      {showResign && (
        <button
          type="button"
          onClick={async () => {
            if (await confirmDialog(t('match.resignConfirm'))) resignMatch();
          }}
          className="ml-auto px-2 py-1 bg-red-600 hover:bg-red-500 active:bg-red-400 rounded text-xs"
        >
          {t('match.resign')}
        </button>
      )}
      {status === 'gameover' && <span className="text-red-400">{t('stats.gameOver')}</span>}
    </div>
  );
}
