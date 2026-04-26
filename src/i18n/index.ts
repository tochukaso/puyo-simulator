import { useEffect, useState } from 'react';
import { translations, LANGUAGES, type Lang, type Dict } from './translations';

export { LANGUAGES, LANGUAGE_LABELS } from './translations';
export type { Lang } from './translations';

const STORAGE_KEY = 'puyo.ui.lang';

function isLang(v: unknown): v is Lang {
  return typeof v === 'string' && (LANGUAGES as readonly string[]).includes(v);
}

function detectInitial(): Lang {
  try {
    const v = localStorage.getItem(STORAGE_KEY);
    if (isLang(v)) return v;
  } catch {
    // Fall through to the default in environments without localStorage.
  }
  return 'en';
}

let currentLang: Lang = detectInitial();
const listeners = new Set<(v: Lang) => void>();

export function getLang(): Lang {
  return currentLang;
}

export function setLang(v: Lang): void {
  if (currentLang === v) return;
  currentLang = v;
  try {
    localStorage.setItem(STORAGE_KEY, v);
  } catch {
    // Skip persistence.
  }
  for (const h of listeners) h(v);
}

export function useLang(): Lang {
  const [v, setV] = useState(currentLang);
  useEffect(() => {
    listeners.add(setV);
    return () => {
      listeners.delete(setV);
    };
  }, []);
  return v;
}

export type TKey = keyof Dict;

function format(tpl: string, params?: Record<string, string | number>): string {
  if (!params) return tpl;
  return tpl.replace(/\{(\w+)\}/g, (_, k) => {
    const v = params[k];
    return v === undefined ? '' : String(v);
  });
}

export function translate(
  lang: Lang,
  key: TKey,
  params?: Record<string, string | number>,
): string {
  const tpl = translations[lang][key] ?? translations.en[key] ?? key;
  return format(tpl, params);
}

export function useT(): (key: TKey, params?: Record<string, string | number>) => string {
  const lang = useLang();
  return (key, params) => translate(lang, key, params);
}
