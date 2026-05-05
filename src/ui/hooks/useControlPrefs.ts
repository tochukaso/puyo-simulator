import { useEffect, useState } from 'react';

// 操作プリセットと細かいチューニングをまとめた singleton。useUiPrefs と同じ
// listener + localStorage 流儀。複数コンポーネント (Controls / useGestures /
// ControlSettingsDialog) が同じ値を共有する。
export type ControlMode = 'classic' | 'tap-to-drop' | 'drag';

export interface ControlTuning {
  flickColPx: 24 | 32 | 48;
  hapticEnabled: boolean;
  buttonScaleLarge: boolean;
  holdRepeatEnabled: boolean;
}

export const DEFAULT_CONTROL_TUNING: ControlTuning = {
  flickColPx: 32,
  hapticEnabled: true,
  buttonScaleLarge: false,
  holdRepeatEnabled: true,
};

const MODE_KEY = 'puyo.control.mode';
const TUNING_PREFIX = 'puyo.control.tuning.';

function readMode(): ControlMode {
  try {
    const raw = localStorage.getItem(MODE_KEY);
    if (raw === 'tap-to-drop' || raw === 'drag') return raw;
    return 'classic';
  } catch {
    return 'classic';
  }
}

function writeMode(v: ControlMode): void {
  try {
    localStorage.setItem(MODE_KEY, v);
  } catch {
    // ignore (jsdom 等で localStorage が無い)
  }
}

function readTuning(): ControlTuning {
  try {
    const flick = localStorage.getItem(TUNING_PREFIX + 'flickColPx');
    const haptic = localStorage.getItem(TUNING_PREFIX + 'hapticEnabled');
    const button = localStorage.getItem(TUNING_PREFIX + 'buttonScaleLarge');
    const repeat = localStorage.getItem(TUNING_PREFIX + 'holdRepeatEnabled');
    const flickN: 24 | 32 | 48 = flick === '24' ? 24 : flick === '48' ? 48 : 32;
    return {
      flickColPx: flickN,
      hapticEnabled:
        haptic === null ? DEFAULT_CONTROL_TUNING.hapticEnabled : haptic === 'true',
      buttonScaleLarge: button === 'true',
      holdRepeatEnabled:
        repeat === null ? DEFAULT_CONTROL_TUNING.holdRepeatEnabled : repeat === 'true',
    };
  } catch {
    return { ...DEFAULT_CONTROL_TUNING };
  }
}

function writeTuning(t: ControlTuning): void {
  try {
    localStorage.setItem(TUNING_PREFIX + 'flickColPx', String(t.flickColPx));
    localStorage.setItem(TUNING_PREFIX + 'hapticEnabled', String(t.hapticEnabled));
    localStorage.setItem(TUNING_PREFIX + 'buttonScaleLarge', String(t.buttonScaleLarge));
    localStorage.setItem(TUNING_PREFIX + 'holdRepeatEnabled', String(t.holdRepeatEnabled));
  } catch {
    // ignore
  }
}

let mode: ControlMode = readMode();
const modeListeners = new Set<(v: ControlMode) => void>();
let tuning: ControlTuning = readTuning();
const tuningListeners = new Set<(v: ControlTuning) => void>();

export function setControlMode(v: ControlMode): void {
  if (mode === v) return;
  mode = v;
  writeMode(v);
  for (const h of modeListeners) h(v);
}

export function getControlMode(): ControlMode {
  return mode;
}

export function useControlMode(): ControlMode {
  const [v, setV] = useState(mode);
  useEffect(() => {
    modeListeners.add(setV);
    if (v !== mode) setV(mode);
    return () => {
      modeListeners.delete(setV);
    };
  }, [v]);
  return v;
}

export function setControlTuning(patch: Partial<ControlTuning>): void {
  const next: ControlTuning = { ...tuning, ...patch };
  if (
    next.flickColPx === tuning.flickColPx &&
    next.hapticEnabled === tuning.hapticEnabled &&
    next.buttonScaleLarge === tuning.buttonScaleLarge &&
    next.holdRepeatEnabled === tuning.holdRepeatEnabled
  ) {
    return;
  }
  tuning = next;
  writeTuning(next);
  for (const h of tuningListeners) h(next);
}

export function getControlTuning(): ControlTuning {
  return tuning;
}

export function useControlTuning(): ControlTuning {
  const [v, setV] = useState(tuning);
  useEffect(() => {
    tuningListeners.add(setV);
    if (v !== tuning) setV(tuning);
    return () => {
      tuningListeners.delete(setV);
    };
  }, [v]);
  return v;
}
