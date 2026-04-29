import { invoke as tauriInvoke } from '@tauri-apps/api/core';

export interface NativeSuggestion {
  axisCol: number;
  rotation: number;
  score: number;
  expectedChain: number;
}

export interface NativeSuggestInput {
  field: string;
  current: [string, string];
  next1: [string, string];
  next2: [string, string];
}

export function isTauri(): boolean {
  if (typeof window === 'undefined') return false;
  return '__TAURI_INTERNALS__' in window;
}

export async function invokeAmaSuggest(
  input: NativeSuggestInput,
): Promise<NativeSuggestion> {
  return await tauriInvoke<NativeSuggestion>('ama_suggest', { input });
}
