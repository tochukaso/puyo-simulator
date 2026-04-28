import { useEffect } from 'react';
import { setAiKind } from '../../hooks/useAiSuggestion';
import {
  useGhostEnabled,
  setGhostEnabled,
  useCeilingVisible,
  setCeilingVisible,
  useTapToDropEnabled,
  setTapToDropEnabled,
} from '../../hooks/useUiPrefs';
import {
  useTrainerMode,
  setTrainerMode,
  type TrainerMode,
} from '../../hooks/useTrainerMode';
import { useGameStore, type GameMode, type MatchTurnLimit } from '../../store';
import {
  LANGUAGES,
  LANGUAGE_LABELS,
  setLang,
  useLang,
  useT,
  type Lang,
} from '../../../i18n';

export function Header() {
  const ghost = useGhostEnabled();
  const ceiling = useCeilingVisible();
  const tapToDrop = useTapToDropEnabled();
  const trainer = useTrainerMode();
  const lang = useLang();
  const t = useT();
  const mode = useGameStore((s) => s.mode);
  const matchTurnLimit = useGameStore((s) => s.matchTurnLimit);
  const setGameMode = useGameStore((s) => s.setGameMode);
  const setMatchTurnLimit = useGameStore((s) => s.setMatchTurnLimit);
  const startMatch = useGameStore((s) => s.startMatch);
  const editing = useGameStore((s) => s.editing);
  const enterEditMode = useGameStore((s) => s.enterEditMode);
  const exitEditMode = useGameStore((s) => s.exitEditMode);

  // ama-wasm に統一。trainer mode に応じて preset (form 集合 + weight) を切替。
  useEffect(() => {
    if (trainer === 'gtr') {
      setAiKind('ama-wasm', 'gtr');
    } else if (trainer === 'kaidan') {
      setAiKind('ama-wasm', 'kaidan');
    } else {
      setAiKind('ama-wasm', 'build');
    }
  }, [trainer]);

  return (
    <header className="p-3 border-b border-slate-800 flex flex-wrap justify-between items-center gap-3">
      <span className="text-lg flex items-baseline gap-2">
        {t('app.title')}
        <span
          className="text-xs text-slate-500 font-mono"
          title={`Built ${__BUILD_TIME__}`}
        >
          v{__BUILD_SHA__}
        </span>
      </span>
      <div className="flex flex-wrap items-center gap-3">
        <div className="flex flex-col gap-1">
          <label className="text-sm flex items-center gap-1 select-none">
            <input
              type="checkbox"
              aria-label={t('header.ghost')}
              checked={ghost}
              onChange={(e) => setGhostEnabled(e.target.checked)}
              className="accent-blue-500"
            />
            {t('header.ghost')}
          </label>
          <label className="text-sm flex items-center gap-1 select-none">
            <input
              type="checkbox"
              aria-label={t('header.ceiling')}
              checked={ceiling}
              onChange={(e) => setCeilingVisible(e.target.checked)}
              className="accent-blue-500"
            />
            {t('header.ceiling')}
          </label>
          <label className="text-sm flex items-center gap-1 select-none">
            <input
              type="checkbox"
              aria-label={t('header.tapToDrop')}
              checked={tapToDrop}
              onChange={(e) => setTapToDropEnabled(e.target.checked)}
              className="accent-blue-500"
            />
            {t('header.tapToDrop')}
          </label>
        </div>
        <select
          aria-label={t('header.trainer')}
          value={trainer}
          onChange={(e) => setTrainerMode(e.target.value as TrainerMode)}
          className="bg-slate-800 text-slate-100 border border-slate-700 rounded px-2 py-1 text-sm"
        >
          <option value="off">{t('header.trainerOff')}</option>
          <option value="gtr">{t('header.trainerGtr')}</option>
          <option value="kaidan">{t('header.trainerKaidan')}</option>
        </select>
        <select
          aria-label={t('header.gameMode')}
          value={mode}
          onChange={(e) => {
            const next = e.target.value as GameMode;
            if (next === 'match' && mode !== 'match') {
              startMatch({ turnLimit: matchTurnLimit });
            } else {
              setGameMode(next);
            }
          }}
          className="bg-slate-800 text-slate-100 border border-slate-700 rounded px-2 py-1 text-sm"
        >
          <option value="free">{t('header.modeFree')}</option>
          <option value="match">{t('header.modeMatch')}</option>
        </select>
        {mode === 'match' && (
          <select
            aria-label={t('header.turnLimit')}
            value={matchTurnLimit}
            onChange={(e) => {
              const limit = (Number(e.target.value) as MatchTurnLimit);
              setMatchTurnLimit(limit);
              startMatch({ turnLimit: limit });
            }}
            className="bg-slate-800 text-slate-100 border border-slate-700 rounded px-2 py-1 text-sm"
          >
            <option value="100">100</option>
            <option value="200">200</option>
          </select>
        )}
        {/* 編集モードトグル。マッチ中に編集に入ろうとしたら 1 回だけ確認を出す
            (マッチを抜けて編集に入る方針。盤面が変わるので再開不可)。 */}
        <button
          type="button"
          onClick={() => {
            if (editing) {
              exitEditMode(true);
              return;
            }
            if (mode === 'match') {
              if (!confirm(t('edit.matchExitConfirm'))) return;
              setGameMode('free');
            }
            enterEditMode();
          }}
          aria-pressed={editing}
          className={`px-3 py-1 rounded text-sm border ${
            editing
              ? 'bg-blue-600 border-blue-400 text-white'
              : 'bg-slate-800 border-slate-700 text-slate-200 hover:bg-slate-700'
          }`}
        >
          {editing ? t('edit.editing') : t('edit.edit')}
        </button>
        <label className="text-sm flex items-center gap-2">
          <span className="sr-only">{t('header.language')}</span>
          <select
            aria-label={t('header.language')}
            value={lang}
            onChange={(e) => setLang(e.target.value as Lang)}
            className="bg-slate-800 text-slate-100 border border-slate-700 rounded px-2 py-1"
          >
            {LANGUAGES.map((code) => (
              <option key={code} value={code}>
                {LANGUAGE_LABELS[code]}
              </option>
            ))}
          </select>
        </label>
      </div>
    </header>
  );
}
