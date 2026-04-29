import { invoke } from '@tauri-apps/api/core';

export async function tauriPing(): Promise<number> {
  return await invoke<number>('ping');
}

if (typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window) {
  void tauriPing().then((n) => {
    console.log('[tauri ping]', n);
  });
}
