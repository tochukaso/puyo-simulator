import { useEffect, useState } from 'react';

// UI 表示設定。複数コンポーネント(Header の切替・Board の描画)が同じ値を
// 共有するためのモジュールローカルなシングルトン + listener。aiKind と同じ流儀。
const STORAGE_KEY_GHOST = 'puyo.ghost.enabled';
const STORAGE_KEY_CEILING = 'puyo.ceiling.visible';

function readBoolPref(key: string, fallback: boolean): boolean {
  try {
    const v = localStorage.getItem(key);
    return v === null ? fallback : v === 'true';
  } catch {
    // テスト環境(jsdom)で localStorage が未実装の場合は fallback。
    return fallback;
  }
}

function writeBoolPref(key: string, v: boolean): void {
  try {
    localStorage.setItem(key, String(v));
  } catch {
    // localStorage 未対応環境では永続化をスキップ。
  }
}

let ghostEnabled = readBoolPref(STORAGE_KEY_GHOST, true);
const ghostListeners = new Set<(v: boolean) => void>();

export function setGhostEnabled(v: boolean): void {
  ghostEnabled = v;
  writeBoolPref(STORAGE_KEY_GHOST, v);
  for (const h of ghostListeners) h(v);
}

export function useGhostEnabled(): boolean {
  const [v, setV] = useState(ghostEnabled);
  useEffect(() => {
    ghostListeners.add(setV);
    return () => {
      ghostListeners.delete(setV);
    };
  }, []);
  return v;
}

// 天井段(row 0)の表示。本家ぷよぷよ準拠で本来は隠れているので
// default は ON にしておくが、隠して 12 段だけ見せるモードも選べる。
let ceilingVisible = readBoolPref(STORAGE_KEY_CEILING, true);
const ceilingListeners = new Set<(v: boolean) => void>();

export function setCeilingVisible(v: boolean): void {
  ceilingVisible = v;
  writeBoolPref(STORAGE_KEY_CEILING, v);
  for (const h of ceilingListeners) h(v);
}

export function useCeilingVisible(): boolean {
  const [v, setV] = useState(ceilingVisible);
  useEffect(() => {
    ceilingListeners.add(setV);
    return () => {
      ceilingListeners.delete(setV);
    };
  }, []);
  return v;
}
