import { describe, it, expect, beforeEach } from 'vitest';
import {
  setControlMode,
  getControlMode,
  setControlTuning,
  getControlTuning,
  DEFAULT_CONTROL_TUNING,
} from '../useControlPrefs';

describe('useControlPrefs singleton', () => {
  beforeEach(() => {
    setControlMode('classic');
    setControlTuning(DEFAULT_CONTROL_TUNING);
  });

  it('mode round-trips classic → tap-to-drop → drag → classic', () => {
    expect(getControlMode()).toBe('classic');
    setControlMode('tap-to-drop');
    expect(getControlMode()).toBe('tap-to-drop');
    setControlMode('drag');
    expect(getControlMode()).toBe('drag');
    setControlMode('classic');
    expect(getControlMode()).toBe('classic');
  });

  it('mode persists to localStorage', () => {
    setControlMode('tap-to-drop');
    expect(localStorage.getItem('puyo.control.mode')).toBe('tap-to-drop');
  });

  it('mode falls back to classic for unknown localStorage values', () => {
    localStorage.setItem('puyo.control.mode', 'bogus');
    setControlMode('classic');
    expect(getControlMode()).toBe('classic');
  });

  it('tuning patch merges only the provided keys', () => {
    setControlTuning({ flickColPx: 48 });
    expect(getControlTuning().flickColPx).toBe(48);
    expect(getControlTuning().hapticEnabled).toBe(DEFAULT_CONTROL_TUNING.hapticEnabled);
    setControlTuning({ buttonScaleLarge: true });
    expect(getControlTuning().flickColPx).toBe(48);
    expect(getControlTuning().buttonScaleLarge).toBe(true);
  });

  it('tuning persists to localStorage', () => {
    setControlTuning({ flickColPx: 24, hapticEnabled: false });
    expect(localStorage.getItem('puyo.control.tuning.flickColPx')).toBe('24');
    expect(localStorage.getItem('puyo.control.tuning.hapticEnabled')).toBe('false');
  });
});
