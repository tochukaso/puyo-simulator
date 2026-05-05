import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { ControlSettingsDialog } from '../ControlSettingsDialog';
import {
  setControlMode,
  getControlMode,
  setControlTuning,
  getControlTuning,
  DEFAULT_CONTROL_TUNING,
} from '../../../hooks/useControlPrefs';

describe('ControlSettingsDialog', () => {
  beforeEach(() => {
    setControlMode('classic');
    setControlTuning(DEFAULT_CONTROL_TUNING);
  });

  it('renders the three preset radios with classic checked initially', () => {
    render(<ControlSettingsDialog onClose={() => {}} />);
    const radios = screen.getAllByRole('radio') as HTMLInputElement[];
    const byValue = (v: string) => radios.find((r) => r.value === v)!;
    expect(byValue('classic').checked).toBe(true);
    expect(byValue('tap-to-drop').checked).toBe(false);
    expect(byValue('drag').checked).toBe(false);
  });

  it('selecting tap-to-drop updates the singleton', () => {
    render(<ControlSettingsDialog onClose={() => {}} />);
    const radios = screen.getAllByRole('radio') as HTMLInputElement[];
    const tap = radios.find((r) => r.value === 'tap-to-drop')!;
    fireEvent.click(tap);
    expect(getControlMode()).toBe('tap-to-drop');
  });

  it('toggling buttonLarge updates tuning', () => {
    render(<ControlSettingsDialog onClose={() => {}} />);
    expect(getControlTuning().buttonScaleLarge).toBe(false);
    // i18n キーは多言語化しているので、各言語ぶん柔軟にマッチさせる。
    fireEvent.click(
      screen.getByLabelText(/larger|大きく|加大|크게/i),
    );
    expect(getControlTuning().buttonScaleLarge).toBe(true);
  });

  it('changing flickColPx select updates tuning', () => {
    render(<ControlSettingsDialog onClose={() => {}} />);
    const sel = screen.getByLabelText(
      /flick distance|フリック反応量|滑动灵敏度|플릭 감도/i,
    ) as HTMLSelectElement;
    fireEvent.change(sel, { target: { value: '48' } });
    expect(getControlTuning().flickColPx).toBe(48);
  });
});
