import { useState } from 'react';
import {
  useGhostEnabled,
  setGhostEnabled,
  useCeilingVisible,
  setCeilingVisible,
} from '../../hooks/useUiPrefs';
import {
  useTrainerMode,
  setTrainerMode,
  type TrainerMode,
} from '../../hooks/useTrainerMode';
import { useGameStore } from '../../store';
import { AnalysisDialog } from '../AnalysisDialog/AnalysisDialog';
import { ShareDialog } from '../ShareDialog/ShareDialog';
import { RecordsDialog } from '../RecordsDialog/RecordsDialog';
import {
  LANGUAGES,
  LANGUAGE_LABELS,
  setLang,
  useLang,
  useT,
  type Lang,
} from '../../../i18n';

// Header に置く設定一式 (ghost / ceiling / trainer / 言語) と、解析モーダル
// の起動ボタンをまとめたドロップダウン。Header が肥大化していたので主要操作
// (mode 切替・編集・共有) だけ Header に残し、設定系をここに集約した。
//
// dropdown の閉じ方: 背景クリック / Esc / 自分の中の操作で意図的に閉じる時。
// React Portal は使わず position: absolute で出すだけ。Header の右端に紐付き。
export function HamburgerMenu() {
  const ghost = useGhostEnabled();
  const ceiling = useCeilingVisible();
  const trainer = useTrainerMode();
  const lang = useLang();
  const t = useT();

  const mode = useGameStore((s) => s.mode);
  const matchEnded = useGameStore((s) => s.matchEnded);
  const matchPlayerMoves = useGameStore((s) => s.matchPlayerMoves);
  const freePlayerMoves = useGameStore((s) => s.freePlayerMoves);

  const [open, setOpen] = useState(false);
  const [analysisOpen, setAnalysisOpen] = useState(false);
  const [shareOpen, setShareOpen] = useState(false);
  const [recordsOpen, setRecordsOpen] = useState(false);

  // 解析が許可されるのは "プレイした手があって、かつ match/score/daily なら終了済み"
  // の時。進行中で押されると意味的にもおかしいので無効化。
  const isMatchLike =
    mode === 'match' || mode === 'score' || mode === 'daily';
  const moveCount = isMatchLike
    ? matchPlayerMoves.length
    : freePlayerMoves.length;
  const canAnalyze =
    moveCount > 0 && (mode === 'free' || (isMatchLike && matchEnded));

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(!open)}
        aria-label={t('menu.toggle')}
        aria-expanded={open}
        className="px-3 py-1 rounded border bg-slate-800 border-slate-700 text-slate-200 hover:bg-slate-700"
      >
        {/* 横 3 本線 */}
        <svg
          width="18"
          height="18"
          viewBox="0 0 18 18"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          aria-hidden="true"
        >
          <line x1="3" y1="5" x2="15" y2="5" />
          <line x1="3" y1="9" x2="15" y2="9" />
          <line x1="3" y1="13" x2="15" y2="13" />
        </svg>
      </button>

      {open && (
        <>
          {/* 背景クリックで閉じるためのフルスクリーンキャッチャー */}
          <div
            aria-hidden="true"
            className="fixed inset-0 z-30"
            onClick={() => setOpen(false)}
          />
          <div
            role="menu"
            className="absolute right-3 top-14 z-40 bg-slate-900 border border-slate-700 rounded-lg shadow-lg p-3 w-60 flex flex-col gap-3"
          >
            <label className="text-sm flex items-center gap-2 select-none">
              <input
                type="checkbox"
                checked={ghost}
                onChange={(e) => setGhostEnabled(e.target.checked)}
                className="accent-blue-500"
              />
              {t('header.ghost')}
            </label>
            <label className="text-sm flex items-center gap-2 select-none">
              <input
                type="checkbox"
                checked={ceiling}
                onChange={(e) => setCeilingVisible(e.target.checked)}
                className="accent-blue-500"
              />
              {t('header.ceiling')}
            </label>

            <label className="text-sm flex flex-col gap-1">
              <span className="text-slate-400 text-xs">
                {t('header.trainer')}
              </span>
              <select
                value={trainer}
                onChange={(e) =>
                  setTrainerMode(e.target.value as TrainerMode)
                }
                className="bg-slate-800 text-slate-100 border border-slate-700 rounded px-2 py-1 text-sm"
              >
                <option value="off">{t('header.trainerOff')}</option>
                <option value="gtr">{t('header.trainerGtr')}</option>
                <option value="kaidan">{t('header.trainerKaidan')}</option>
              </select>
            </label>

            <label className="text-sm flex flex-col gap-1">
              <span className="text-slate-400 text-xs">
                {t('header.language')}
              </span>
              <select
                value={lang}
                onChange={(e) => setLang(e.target.value as Lang)}
                className="bg-slate-800 text-slate-100 border border-slate-700 rounded px-2 py-1 text-sm"
              >
                {LANGUAGES.map((code) => (
                  <option key={code} value={code}>
                    {LANGUAGE_LABELS[code]}
                  </option>
                ))}
              </select>
            </label>

            <button
              type="button"
              onClick={() => {
                setOpen(false);
                setShareOpen(true);
              }}
              className="px-3 py-1.5 rounded text-sm border bg-slate-800 border-slate-700 text-slate-200 hover:bg-slate-700"
            >
              {t('share.button')}
            </button>

            <button
              type="button"
              onClick={() => {
                setOpen(false);
                setRecordsOpen(true);
              }}
              className="px-3 py-1.5 rounded text-sm border bg-slate-800 border-slate-700 text-slate-200 hover:bg-slate-700"
            >
              {t('records.button')}
            </button>

            <button
              type="button"
              disabled={!canAnalyze}
              onClick={() => {
                setOpen(false);
                setAnalysisOpen(true);
              }}
              className="px-3 py-1.5 rounded text-sm bg-blue-600 hover:bg-blue-500 disabled:opacity-50 disabled:cursor-not-allowed"
              title={t('stats.analyzeTitle')}
            >
              {t('stats.analyze')}
            </button>
          </div>
        </>
      )}

      {analysisOpen && (
        <AnalysisDialog onClose={() => setAnalysisOpen(false)} />
      )}
      {shareOpen && <ShareDialog onClose={() => setShareOpen(false)} />}
      {recordsOpen && <RecordsDialog onClose={() => setRecordsOpen(false)} />}
    </>
  );
}
