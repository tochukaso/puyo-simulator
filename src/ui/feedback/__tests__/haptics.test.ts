import { describe, it, expect, vi, beforeEach } from 'vitest';
import { vibrateCommit, vibrateChain } from '../haptics';
import {
  setControlTuning,
  DEFAULT_CONTROL_TUNING,
} from '../../hooks/useControlPrefs';

describe('haptics', () => {
  beforeEach(() => {
    setControlTuning(DEFAULT_CONTROL_TUNING);
    Object.defineProperty(navigator, 'vibrate', {
      configurable: true,
      writable: true,
      value: vi.fn(() => true),
    });
  });

  it('vibrateCommit calls navigator.vibrate(15) when enabled', () => {
    vibrateCommit();
    expect(navigator.vibrate).toHaveBeenCalledWith(15);
  });

  it('vibrateChain(2+) calls navigator.vibrate(40)', () => {
    vibrateChain(2);
    expect(navigator.vibrate).toHaveBeenCalledWith(40);
    vibrateChain(5);
    expect(navigator.vibrate).toHaveBeenCalledWith(40);
  });

  it('vibrateChain(1) calls navigator.vibrate(20)', () => {
    vibrateChain(1);
    expect(navigator.vibrate).toHaveBeenCalledWith(20);
  });

  it('does nothing when hapticEnabled=false', () => {
    setControlTuning({ hapticEnabled: false });
    vibrateCommit();
    vibrateChain(3);
    expect(navigator.vibrate).not.toHaveBeenCalled();
  });

  it('does nothing when navigator.vibrate is undefined', () => {
    Object.defineProperty(navigator, 'vibrate', {
      configurable: true,
      writable: true,
      value: undefined,
    });
    expect(() => vibrateCommit()).not.toThrow();
    expect(() => vibrateChain(3)).not.toThrow();
  });
});
