import { useEffect } from 'react';
import { useGameStore } from '../../store';
import { useT } from '../../../i18n';

// 解析結果ポップアップ。普段の Stats バーから AI Match/Eval を撤去した代わりに、
// ハンバーガーメニューの「解析」エントリ経由でこのモーダルを開く。
//
// 開いた時点で aiStats が空 (= 未解析または直近で commit/undo/reset 等により
// invalidate された) なら自動で analyzeStats() を起動する。既に結果がある場合
// は表示するだけ — ユーザーは「再解析」を押せば再走させられる。
export function AnalysisDialog({ onClose }: { onClose: () => void }) {
  const aiStats = useGameStore((s) => s.aiStats);
  const analyzing = useGameStore((s) => s.analyzing);
  const mode = useGameStore((s) => s.mode);
  const matchEnded = useGameStore((s) => s.matchEnded);
  const matchPlayerMoves = useGameStore((s) => s.matchPlayerMoves);
  const freePlayerMoves = useGameStore((s) => s.freePlayerMoves);
  const analyzeStats = useGameStore((s) => s.analyzeStats);
  const t = useT();

  const moveCount =
    mode === 'match' ? matchPlayerMoves.length : freePlayerMoves.length;
  const canAnalyze =
    !analyzing &&
    moveCount > 0 &&
    (mode === 'free' || (mode === 'match' && matchEnded));

  // 開いた時点で結果が無く、解析可能な状態なら自動起動。
  useEffect(() => {
    if (canAnalyze && aiStats.measured === 0) {
      void analyzeStats();
    }
    // 開いた瞬間だけ判定したい (依存配列に入れない: ユーザの再解析ボタンと
    // 競合する)。
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const matchPct =
    aiStats.measured > 0
      ? Math.round((aiStats.bestMatchCount / aiStats.measured) * 100)
      : null;
  const avgPct =
    aiStats.inListCount > 0
      ? Math.round(aiStats.pctSum / aiStats.inListCount)
      : null;

  // 表示状態を 4 通りに整理。順番が紛らわしくならないよう if/else if で書く。
  let body;
  if (analyzing) {
    body = (
      <p className="text-slate-300 text-sm">{t('analysis.analyzing')}</p>
    );
  } else if (moveCount === 0) {
    body = (
      <p className="text-slate-400 text-sm">{t('analysis.noMoves')}</p>
    );
  } else if (mode === 'match' && !matchEnded) {
    body = (
      <p className="text-slate-400 text-sm">{t('analysis.matchInProgress')}</p>
    );
  } else if (aiStats.measured === 0) {
    // canAnalyze だったはずだが念のため (auto-trigger が間に合っていない瞬間)。
    body = (
      <p className="text-slate-400 text-sm">{t('analysis.notAnalyzedYet')}</p>
    );
  } else {
    body = (
      <div className="flex flex-col gap-3 text-sm">
        <div className="flex justify-between items-baseline">
          <span className="text-slate-400">{t('stats.aiMatch')}</span>
          <span>
            <b className="text-emerald-300 text-lg tabular-nums">
              {matchPct === null ? '-' : `${matchPct}%`}
            </b>
            <span className="text-slate-500 text-xs ml-2">
              ({aiStats.bestMatchCount}/{aiStats.measured})
            </span>
          </span>
        </div>
        <div className="flex justify-between items-baseline">
          <span className="text-slate-400">{t('stats.aiAvg')}</span>
          <span>
            <b className="text-emerald-300 text-lg tabular-nums">
              {avgPct === null ? '-' : `${avgPct}%`}
            </b>
            <span className="text-slate-500 text-xs ml-2">
              ({aiStats.inListCount}/{aiStats.measured})
            </span>
          </span>
        </div>
        <p className="text-xs text-slate-500 leading-relaxed">
          {t('analysis.note')}
        </p>
      </div>
    );
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={t('analysis.title')}
      className="fixed inset-0 z-50 bg-black/70 flex items-center justify-center p-4"
      onClick={onClose}
    >
      <div
        className="bg-slate-900 border border-slate-700 rounded-lg p-4 w-full max-w-sm flex flex-col gap-3"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between">
          <h2 className="text-base font-semibold">{t('analysis.title')}</h2>
          <button
            type="button"
            onClick={onClose}
            aria-label={t('analysis.close')}
            className="text-slate-400 hover:text-slate-100 px-2"
          >
            ✕
          </button>
        </div>
        {body}
        <div className="flex gap-2 justify-end">
          <button
            type="button"
            disabled={!canAnalyze}
            onClick={() => {
              void analyzeStats();
            }}
            className="px-3 py-1 bg-blue-600 hover:bg-blue-500 disabled:opacity-50 disabled:cursor-not-allowed rounded text-xs"
          >
            {analyzing
              ? t('analysis.analyzing')
              : aiStats.measured > 0
                ? t('analysis.reanalyze')
                : t('analysis.start')}
          </button>
        </div>
      </div>
    </div>
  );
}
