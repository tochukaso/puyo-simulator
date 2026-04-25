import { useEffect, useState } from 'react';

// UI 表示設定。複数コンポーネント(Header の切替・Board の描画)が同じ値を
// 共有するためのモジュールローカルなシングルトン + listener。aiKind と同じ流儀。
const STORAGE_KEY_GHOST = 'puyo.ghost.enabled';

function readInitialGhost(): boolean {
  if (typeof localStorage === 'undefined') return true;
  const v = localStorage.getItem(STORAGE_KEY_GHOST);
  return v === null ? true : v === 'true';
}

let ghostEnabled = readInitialGhost();
const ghostListeners = new Set<(v: boolean) => void>();

export function setGhostEnabled(v: boolean): void {
  ghostEnabled = v;
  if (typeof localStorage !== 'undefined') {
    localStorage.setItem(STORAGE_KEY_GHOST, String(v));
  }
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
