import { useEffect, useState } from 'react';
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
import type { AiKind as Kind } from '../../../ai/types';

const STORAGE_KEY = 'puyo.ai.kind';
const VALID: readonly Kind[] = ['heuristic', 'ml-v1', 'ml-ama-v1', 'ml-ama-v2-search', 'ama-wasm'] as const;

function readInitialKind(): Kind {
  const v =
    typeof localStorage !== 'undefined' ? localStorage.getItem(STORAGE_KEY) : null;
  return (VALID as readonly string[]).includes(v ?? '') ? (v as Kind) : 'ml-ama-v1';
}

export function Header() {
  const [kind, setKind] = useState<Kind>(readInitialKind);
  const ghost = useGhostEnabled();
  const ceiling = useCeilingVisible();
  const trainer = useTrainerMode();
  const lang = useLang();
  const t = useT();

  // 訓練モードが gtr のときは GTR 専用ビルドの ama-wasm(gtr プリセット)を強制使用する。
  // 専用ビルドは form::list を { GTR } に絞ってあるので、AI が GTR を作る方向にしか
  // 評価しない。それ以外のときは default ビルド + preset='build'。
  useEffect(() => {
    if (trainer === 'gtr') {
      setAiKind('ama-wasm', 'gtr', 'gtr-only');
    } else {
      setAiKind(kind, 'build', 'default');
    }
  }, [kind, trainer]);

  return (
    <header className="p-3 border-b border-slate-800 flex justify-between items-center gap-3">
      <span className="text-lg">{t('app.title')}</span>
      <div className="flex items-center gap-3">
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
            aria-label="天井"
            checked={ceiling}
            onChange={(e) => setCeilingVisible(e.target.checked)}
            className="accent-blue-500"
          />
          天井
        </label>
        <label className="text-sm flex items-center gap-2">
          訓練
          <select
            aria-label="訓練"
            value={trainer}
            onChange={(e) => setTrainerMode(e.target.value as TrainerMode)}
            className="bg-slate-800 text-slate-100 border border-slate-700 rounded px-2 py-1"
          >
            <option value="off">off</option>
            <option value="gtr">GTR</option>
          </select>
        </label>
        <label className="text-sm flex items-center gap-2">
          {t('header.ai')}
          <select
            aria-label="AI"
            value={kind}
            onChange={(e) => {
              const next = e.target.value as Kind;
              setKind(next);
              localStorage.setItem(STORAGE_KEY, next);
            }}
            disabled={trainer === 'gtr'}
            title={trainer === 'gtr' ? '訓練モード中は ama-wasm(GTR プリセット)を使用' : undefined}
            className="bg-slate-800 text-slate-100 border border-slate-700 rounded px-2 py-1 disabled:opacity-50"
          >
            <option value="heuristic">Heuristic</option>
            <option value="ml-v1">ML (policy-v1)</option>
            <option value="ml-ama-v1">ML (ama-distilled-v1)</option>
            <option value="ml-ama-v2-search">ML (ama-v2 + search)</option>
            <option value="ama-wasm">ama (WASM)</option>
          </select>
        </label>
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
