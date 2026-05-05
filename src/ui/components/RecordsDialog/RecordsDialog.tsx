import { useEffect, useState } from 'react';
import {
  listRecords,
  deleteRecord,
  type MatchRecord,
} from '../../../match/records';
import { useGameStore } from '../../store';
import { useT } from '../../../i18n';

// ハンバーガーメニュー → 「保存した対戦」で開くモーダル。
// 一覧 + 各レコードの「再生」「削除」操作。再生ボタンは store.loadRecord を
// 呼んで、MatchPanel の既存 scrubber UI でスナップショットを進めて見られる
// 状態に切り替える。
export function RecordsDialog({ onClose }: { onClose: () => void }) {
  const t = useT();
  const loadRecord = useGameStore((s) => s.loadRecord);
  const loadedRecordId = useGameStore((s) => s.loadedRecordId);

  const [records, setRecords] = useState<MatchRecord[] | null>(null);

  useEffect(() => {
    let cancelled = false;
    void listRecords().then((rs) => {
      if (!cancelled) setRecords(rs);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const onLoad = (r: MatchRecord) => {
    loadRecord(r);
    onClose();
  };

  const onDelete = async (r: MatchRecord) => {
    await deleteRecord(r.id);
    setRecords(await listRecords());
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={t('records.title')}
      className="fixed inset-0 z-50 bg-black/70 flex items-center justify-center p-4"
      onClick={onClose}
    >
      <div
        className="bg-slate-900 border border-slate-700 rounded-lg p-4 w-full max-w-md flex flex-col gap-3"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between">
          <h2 className="text-base font-semibold">
            {t('records.title')}
            {records && (
              <span className="text-slate-500 ml-2 text-sm">
                ({records.length})
              </span>
            )}
          </h2>
          <button
            type="button"
            onClick={onClose}
            aria-label={t('records.close')}
            className="text-slate-400 hover:text-slate-100 px-2"
          >
            ✕
          </button>
        </div>

        {records === null ? (
          <p className="text-slate-400 text-sm">{t('records.loading')}</p>
        ) : records.length === 0 ? (
          <p className="text-slate-400 text-sm">{t('records.empty')}</p>
        ) : (
          <ul className="flex flex-col gap-1 max-h-[60vh] overflow-y-auto">
            {records.map((r) => {
              const date = new Date(r.createdAt);
              const dateStr = `${date.getMonth() + 1}/${date.getDate()} ${date.getHours()}:${String(date.getMinutes()).padStart(2, '0')}`;
              const winLabel =
                r.winner === 'player'
                  ? t('match.you')
                  : r.winner === 'ai'
                    ? t('match.ama')
                    : t('match.draw');
              const winColor =
                r.winner === 'player'
                  ? 'text-emerald-300'
                  : r.winner === 'ai'
                    ? 'text-amber-300'
                    : 'text-slate-300';
              const isLoaded = r.id === loadedRecordId;
              return (
                <li
                  key={r.id}
                  className={`flex items-center justify-between gap-2 rounded px-2 py-1.5 text-xs ${isLoaded ? 'bg-blue-900/40 border border-blue-700' : 'bg-slate-800'}`}
                >
                  <span className="text-slate-400 tabular-nums whitespace-nowrap">
                    {dateStr}
                  </span>
                  <span className="text-slate-500 whitespace-nowrap">
                    {r.turnLimit}
                  </span>
                  <span
                    className={`font-mono tabular-nums whitespace-nowrap ${winColor}`}
                  >
                    {r.playerScore.toLocaleString()} -{' '}
                    {r.aiScore.toLocaleString()}
                  </span>
                  <span className={`whitespace-nowrap ${winColor}`}>
                    {winLabel}
                  </span>
                  <div className="ml-auto flex items-center gap-1">
                    <button
                      type="button"
                      onClick={() => onLoad(r)}
                      className="px-2 py-0.5 bg-emerald-700 hover:bg-emerald-600 rounded text-xs"
                      title={t('records.replayTitle')}
                    >
                      {t('records.replay')}
                    </button>
                    <button
                      type="button"
                      onClick={() => onDelete(r)}
                      aria-label={t('match.deleteRecord')}
                      className="text-slate-500 hover:text-red-400 px-1"
                    >
                      ✕
                    </button>
                  </div>
                </li>
              );
            })}
          </ul>
        )}

        <p className="text-xs text-slate-500">{t('records.note')}</p>
      </div>
    </div>
  );
}
