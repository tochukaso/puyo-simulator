import { useEffect, useState } from 'react';

// Trainer mode. Selects which form preset is loaded into ama-wasm.
//   off    : preset='build'   — default play, all forms active
//   gtr    : preset='gtr'     — only GTR matched, AI is guided to build GTR
//   kaidan : preset='kaidan'  — only KAIDAN (staircase) matched
// Shared across components via a singleton + listener (same approach as useUiPrefs).

export type TrainerMode = 'off' | 'gtr' | 'kaidan';

const STORAGE_KEY = 'puyo.trainer.mode';
const VALID: readonly TrainerMode[] = ['off', 'gtr', 'kaidan'] as const;

function readInitial(): TrainerMode {
  try {
    const v = localStorage.getItem(STORAGE_KEY);
    return (VALID as readonly string[]).includes(v ?? '') ? (v as TrainerMode) : 'gtr';
  } catch {
    return 'gtr';
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
    // Skip persistence when localStorage is unsupported.
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
