import { useEffect, useState } from 'react';

// Trainer mode. When 'gtr', the Header's "AI selection" is overridden to use
// ama-wasm with the gtr preset, the Board lightly overlays the GTR template,
// and a progress meter is displayed near the Stats.
// Shared across components via a singleton + listener (same approach as useUiPrefs).

export type TrainerMode = 'off' | 'gtr';

const STORAGE_KEY = 'puyo.trainer.mode';
const VALID: readonly TrainerMode[] = ['off', 'gtr'] as const;

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
