import { useSyncExternalStore } from 'react';

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
const modeListeners = new Set<() => void>();
let tuning: ControlTuning = readTuning();
const tuningListeners = new Set<() => void>();

export function setControlMode(v: ControlMode): void {
  if (mode === v) return;
  mode = v;
  writeMode(v);
  for (const h of modeListeners) h();
}

export function getControlMode(): ControlMode {
  return mode;
}

// useSyncExternalStore で singleton を購読する。useState + listener で
// 自前管理していた以前の実装は、コンポーネント mount → effect run の
// 時間差中に setControlMode が呼ばれると stale 値を返すレースが残った
// (実機で「タップトゥドロップを選択しているのに Dialog で classic が
// チェックされる」現象として観測された)。
// useSyncExternalStore は subscribe 直後に getSnapshot を強制呼び出して
// 同期保証してくれる。
export function useControlMode(): ControlMode {
  return useSyncExternalStore(
    (cb) => {
      modeListeners.add(cb);
      return () => {
        modeListeners.delete(cb);
      };
    },
    () => mode,
    () => mode,
  );
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
  for (const h of tuningListeners) h();
}

export function getControlTuning(): ControlTuning {
  return tuning;
}

export function useControlTuning(): ControlTuning {
  return useSyncExternalStore(
    (cb) => {
      tuningListeners.add(cb);
      return () => {
        tuningListeners.delete(cb);
      };
    },
    () => tuning,
    () => tuning,
  );
}
