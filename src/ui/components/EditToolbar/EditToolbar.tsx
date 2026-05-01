import { useGameStore, type EditPalette } from '../../store';
import { useT } from '../../../i18n';
import { confirmDialog } from '../../utils/dialog';
import {
  PUYO_COLORS,
  PUYO_LIGHT,
  PUYO_DARK,
} from '../Board/colors';
import type { Color } from '../../../game/types';

// Mobile-first edit toolbar. Replaces the regular Controls grid while edit
// mode is on. All targets are at least ~44px tall for thumb tapping. The
// active palette button is highlighted with a blue ring so the user always
// knows what color a tap will paint.
export function EditToolbar() {
  const editing = useGameStore((s) => s.editing);
  const palette = useGameStore((s) => s.editPalette);
  const setPalette = useGameStore((s) => s.setEditPalette);
  const exitEditMode = useGameStore((s) => s.exitEditMode);
  const clearEditField = useGameStore((s) => s.clearEditField);
  const t = useT();

  if (!editing) return null;

  const colors: Color[] = ['R', 'P', 'B', 'Y'];

  const baseBtn =
    'h-12 rounded text-base touch-manipulation select-none flex items-center justify-center transition-colors';

  return (
    <div className="flex flex-col gap-2 w-full" data-no-gesture>
      {/* Palette: 4 colors + garbage + erase. Pure tap targets, no labels needed
          for the colors themselves — the button BG = the puyo color. */}
      <div className="grid grid-cols-6 gap-2 w-full">
        {colors.map((c) => (
          <PaletteButton
            key={c}
            kind={c}
            active={palette === c}
            onClick={() => setPalette(c)}
            ariaLabel={t(`edit.color.${c}` as never) as string}
          />
        ))}
        <PaletteButton
          kind="G"
          active={palette === 'G'}
          onClick={() => setPalette('G')}
          ariaLabel={t('edit.garbage')}
        />
        <PaletteButton
          kind="X"
          active={palette === 'X'}
          onClick={() => setPalette('X')}
          ariaLabel={t('edit.erase')}
        />
      </div>
      {/* Confirm / cancel / clear. Apply is the primary CTA, so it stays in the
          rightmost slot of the bottom row where the thumb naturally lands. */}
      <div className="grid grid-cols-3 gap-2 w-full">
        <button
          type="button"
          onClick={async () => {
            if (await confirmDialog(t('edit.clearConfirm'))) clearEditField();
          }}
          className={`${baseBtn} bg-slate-700 hover:bg-slate-600 active:bg-slate-500`}
        >
          {t('edit.clear')}
        </button>
        <button
          type="button"
          onClick={() => exitEditMode(false)}
          className={`${baseBtn} bg-amber-700 hover:bg-amber-600 active:bg-amber-500`}
        >
          {t('edit.cancel')}
        </button>
        <button
          type="button"
          onClick={() => exitEditMode(true)}
          className={`${baseBtn} bg-emerald-600 hover:bg-emerald-500 active:bg-emerald-400 font-bold`}
        >
          {t('edit.apply')}
        </button>
      </div>
    </div>
  );
}

interface PaletteButtonProps {
  kind: EditPalette;
  active: boolean;
  onClick: () => void;
  ariaLabel: string;
}

function PaletteButton({ kind, active, onClick, ariaLabel }: PaletteButtonProps) {
  const bg =
    kind === 'X'
      ? '#1e293b'
      : kind === 'G'
        ? PUYO_COLORS.G
        : PUYO_COLORS[kind as Color];
  const fg =
    kind === 'X'
      ? '#94a3b8'
      : kind === 'G'
        ? PUYO_DARK.G
        : PUYO_DARK[kind as Color];
  const ring = active ? 'ring-4 ring-blue-400' : 'ring-1 ring-slate-700';
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={ariaLabel}
      aria-pressed={active}
      className={`h-12 rounded ${ring} touch-manipulation select-none flex items-center justify-center transition-shadow font-bold`}
      style={{
        backgroundColor: bg,
        backgroundImage:
          kind === 'X' || kind === 'G'
            ? undefined
            : `radial-gradient(circle at 35% 30%, ${PUYO_LIGHT[kind as Color]}, ${PUYO_COLORS[kind as Color]} 60%, ${PUYO_DARK[kind as Color]})`,
        color: fg,
      }}
    >
      {kind === 'X' ? '✕' : kind === 'G' ? '◯' : kind}
    </button>
  );
}
