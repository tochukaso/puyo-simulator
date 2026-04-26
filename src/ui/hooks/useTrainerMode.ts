import { useEffect, useState } from 'react';

// 訓練モード。'gtr' のとき Header の「AI 選択」を上書きして ama-wasm + gtr プリセットを使い、
// Board に GTR テンプレを薄く重ね、Stats 周辺に達成度メーターを出す。
// 複数コンポーネントで共有するシングルトン + listener(useUiPrefs と同じ流儀)。

export type TrainerMode = 'off' | 'gtr';

const STORAGE_KEY = 'puyo.trainer.mode';
const VALID: readonly TrainerMode[] = ['off', 'gtr'] as const;

function readInitial(): TrainerMode {
  try {
    const v = localStorage.getItem(STORAGE_KEY);
    return (VALID as readonly string[]).includes(v ?? '') ? (v as TrainerMode) : 'off';
  } catch {
    return 'off';
  }
}

let mode: TrainerMode = readInitial();
const listeners = new Set<(v: TrainerMode) => void>();

export function setTrainerMode(v: TrainerMode): void {
  if (mode === v) return;
  mode = v;
  try {
    localStorage.setItem(STORAGE_KEY, v);
  } catch {
    // localStorage 未対応環境では永続化をスキップ。
  }
  for (const h of listeners) h(v);
}

export function getTrainerMode(): TrainerMode {
  return mode;
}

export function useTrainerMode(): TrainerMode {
  const [v, setV] = useState(mode);
  useEffect(() => {
    listeners.add(setV);
    return () => {
      listeners.delete(setV);
    };
  }, []);
  return v;
}
