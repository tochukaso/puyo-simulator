import { invoke } from '@tauri-apps/api/core';

interface NativeSuggestion {
  axisCol: number;
  rotation: number;
  score: number;
  expectedChain: number;
}

export async function tauriProbe(): Promise<void> {
  const ping = await invoke<number>('ping');
  console.log('[tauri ping]', ping);

  const empty = '.'.repeat(78);
  const t0 = performance.now();
  const sugg = await invoke<NativeSuggestion>('ama_suggest', {
    input: {
      field: empty,
      current: ['R', 'B'],
      next1: ['Y', 'P'],
      next2: ['R', 'Y'],
    },
  });
  console.log('[tauri ama_suggest]', sugg, `${(performance.now() - t0).toFixed(0)}ms`);
}

if (typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window) {
  void tauriProbe();
}
