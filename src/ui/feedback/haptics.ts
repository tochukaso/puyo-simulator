import { getControlTuning } from '../hooks/useControlPrefs';

function safeVibrate(pattern: number): void {
  if (!getControlTuning().hapticEnabled) return;
  const nav = navigator as Navigator & { vibrate?: Navigator['vibrate'] };
  if (typeof nav.vibrate !== 'function') return;
  try {
    nav.vibrate(pattern);
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
