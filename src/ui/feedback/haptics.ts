import { getControlTuning } from '../hooks/useControlPrefs';

function safeVibrate(pattern: number | number[]): void {
  if (!getControlTuning().hapticEnabled) return;
  const v = (
    navigator as Navigator & { vibrate?: (p: number | number[]) => boolean }
  ).vibrate;
  if (typeof v !== 'function') return;
  try {
    v.call(navigator, pattern);
  } catch {
    // Browsers can throw NotAllowedError before any user gesture; swallow.
  }
}

export function vibrateCommit(): void {
  safeVibrate(15);
}

export function vibrateChain(chainStep: number): void {
  // chainStep=1 is the first pop; treat it as a lighter tick than 2+ chains.
  safeVibrate(chainStep >= 2 ? 40 : 20);
}
