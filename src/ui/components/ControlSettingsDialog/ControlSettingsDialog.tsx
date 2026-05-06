import { useEffect } from 'react';
import { useT } from '../../../i18n';
import {
  useControlMode,
  setControlMode,
  useControlTuning,
  setControlTuning,
  type ControlMode,
} from '../../hooks/useControlPrefs';

interface Props {
  onClose: () => void;
}

const FLICK_OPTIONS: ReadonlyArray<24 | 32 | 48> = [24, 32, 48];

// 操作プリセット (Classic / TapToDrop / Drag) と詳細チューニングをまとめた
// モーダル設定 UI。HamburgerMenu の「⚙ 操作設定」ボタンから開く。
export function ControlSettingsDialog({ onClose }: Props) {
  const t = useT();
  const mode = useControlMode();
  const tuning = useControlTuning();

  // Escape キーで閉じる。modal の標準動作で a11y 的にも期待される。
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [onClose]);

  const presets: Array<{ value: ControlMode; label: string; desc: string }> = [
    {
      value: 'classic',
      label: t('controls.settings.modeClassic'),
      desc: t('controls.settings.modeClassicDesc'),
    },
    {
      value: 'tap-to-drop',
      label: t('controls.settings.modeTapToDrop'),
      desc: t('controls.settings.modeTapToDropDesc'),
    },
    {
      value: 'drag',
      label: t('controls.settings.modeDrag'),
      desc: t('controls.settings.modeDragDesc'),
    },
  ];

  return (
    <div
      role="dialog"
      aria-modal="true"
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60"
      onClick={onClose}
    >
      <div
        className="bg-slate-900 border border-slate-700 rounded-lg shadow-xl w-full max-w-md p-4 flex flex-col gap-4 max-h-[90vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 className="text-lg font-semibold">{t('controls.settings.title')}</h2>

        <fieldset className="flex flex-col gap-2">
          <legend className="text-sm text-slate-400 mb-1">
            {t('controls.settings.modeSection')}
          </legend>
          {presets.map((p) => (
            <label
              key={p.value}
              className={`flex flex-col gap-1 rounded border p-2 cursor-pointer ${
                mode === p.value
                  ? 'border-blue-500 bg-slate-800'
                  : 'border-slate-700 hover:bg-slate-800/50'
              }`}
            >
              <span className="flex items-center gap-2">
                <input
                  type="radio"
                  name="control-mode"
                  value={p.value}
                  checked={mode === p.value}
                  onChange={() => setControlMode(p.value)}
                  className="accent-blue-500"
                />
                <span className="text-sm font-medium">{p.label}</span>
              </span>
              <span className="text-xs text-slate-400 ml-6">{p.desc}</span>
            </label>
          ))}
        </fieldset>

        <fieldset className="flex flex-col gap-2 border-t border-slate-700 pt-3">
          <legend className="text-sm text-slate-400 mb-1">
            {t('controls.settings.tuningSection')}
          </legend>

          <label className="text-sm flex items-center justify-between gap-2">
            <span>{t('controls.settings.flickPx')}</span>
            <select
              value={tuning.flickColPx}
              onChange={(e) =>
                setControlTuning({
                  flickColPx: Number(e.target.value) as 24 | 32 | 48,
                })
              }
              className="bg-slate-800 text-slate-100 border border-slate-700 rounded px-2 py-1 text-sm"
            >
              {FLICK_OPTIONS.map((px) => (
                <option key={px} value={px}>
                  {px}px
                </option>
              ))}
            </select>
          </label>

          <label className="text-sm flex items-center gap-2 select-none">
            <input
              type="checkbox"
              checked={tuning.hapticEnabled}
              onChange={(e) =>
                setControlTuning({ hapticEnabled: e.target.checked })
              }
              className="accent-blue-500"
            />
            {t('controls.settings.haptic')}
          </label>

          <label className="text-sm flex items-center gap-2 select-none">
            <input
              type="checkbox"
              checked={tuning.buttonScaleLarge}
              onChange={(e) =>
                setControlTuning({ buttonScaleLarge: e.target.checked })
              }
              className="accent-blue-500"
            />
            {t('controls.settings.buttonLarge')}
          </label>

          <label className="text-sm flex items-center gap-2 select-none">
            <input
              type="checkbox"
              checked={tuning.holdRepeatEnabled}
              onChange={(e) =>
                setControlTuning({ holdRepeatEnabled: e.target.checked })
              }
              className="accent-blue-500"
            />
            {t('controls.settings.holdRepeat')}
          </label>
        </fieldset>

        <button
          type="button"
          onClick={onClose}
          className="px-3 py-2 rounded bg-slate-700 hover:bg-slate-600 text-sm self-end"
        >
          {t('controls.settings.close')}
        </button>
      </div>
    </div>
  );
}
