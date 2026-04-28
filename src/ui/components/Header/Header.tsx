import { useEffect } from 'react';
import { setAiKind } from '../../hooks/useAiSuggestion';
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
  const trainer = useTrainerMode();
  const lang = useLang();
  const t = useT();

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
      <span className="text-lg">{t('app.title')}</span>
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
