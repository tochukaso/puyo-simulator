import { useGameStore, type EditPairSlot } from '../../store';
import { useT } from '../../../i18n';
import { PUYO_COLORS, PUYO_LIGHT, PUYO_DARK } from '../Board/colors';
import type { Color, Pair } from '../../../game/types';

// 編集モード時に NextQueue の代わりに右パネルへ出る、現在ペア / NEXT / NEXT2
// の編集カード。各 slot は axis(上)・child(下)の 2 つの大きなタップ円を持ち、
// タップごとに R → P → B → Y → R … で色循環する。
//
// パレットで 4 色のいずれかが選ばれている場合は「タップでその色に塗る」動作を
// 優先し、Garbage / Erase が選ばれている場合だけ循環にフォールバックする
// (ペアにおじゃま・空は持てないため)。
export function EditPairs() {
  const editing = useGameStore((s) => s.editing);
  const game = useGameStore((s) => s.game);
  const palette = useGameStore((s) => s.editPalette);
  const setPairColor = useGameStore((s) => s.setPairColor);
  const t = useT();

  if (!editing) return null;

  // current が無い場合 (ありえないはずだが) のためのプレースホルダ。
  const currentPair: Pair = game.current?.pair ?? { axis: 'R', child: 'R' };
  const next1: Pair = game.nextQueue[0] ?? { axis: 'R', child: 'R' };
  const next2: Pair = game.nextQueue[1] ?? { axis: 'R', child: 'R' };

  const onTap = (slot: EditPairSlot, which: 'axis' | 'child', cur: Color) => {
    if (palette === 'R' || palette === 'P' || palette === 'B' || palette === 'Y') {
      setPairColor(slot, which, palette);
      return;
    }
    // Cycle: R → P → B → Y → R
    const order: Color[] = ['R', 'P', 'B', 'Y'];
    const next = order[(order.indexOf(cur) + 1) % order.length]!;
    setPairColor(slot, which, next);
  };

  return (
    <div className="flex flex-col gap-2" data-no-gesture>
      <PairCard
        label={t('edit.pair.current')}
        pair={currentPair}
        onAxisTap={() => onTap(0, 'axis', currentPair.axis)}
        onChildTap={() => onTap(0, 'child', currentPair.child)}
      />
      <PairCard
        label={t('edit.pair.next1')}
        pair={next1}
        onAxisTap={() => onTap(1, 'axis', next1.axis)}
        onChildTap={() => onTap(1, 'child', next1.child)}
      />
      <PairCard
        label={t('edit.pair.next2')}
        pair={next2}
        onAxisTap={() => onTap(2, 'axis', next2.axis)}
        onChildTap={() => onTap(2, 'child', next2.child)}
      />
    </div>
  );
}

interface PairCardProps {
  label: string;
  pair: Pair;
  onAxisTap: () => void;
  onChildTap: () => void;
}

function PairCard({ label, pair, onAxisTap, onChildTap }: PairCardProps) {
  // ゲームのデフォルト rotation=0 では child が上・axis が下に積まれる。
  // NextQueue のレンダリング順 (child / axis) と一致させ、編集 ↔ 確定後で
  // 縦並びが入れ替わって混乱しないようにする。
  return (
    <div className="bg-slate-900 border border-slate-700 rounded p-2 flex flex-col items-center gap-1">
      <span className="text-[10px] uppercase tracking-wider text-slate-400">
        {label}
      </span>
      <div className="flex flex-col gap-1">
        <PairCircle color={pair.child} onClick={onChildTap} />
        <PairCircle color={pair.axis} onClick={onAxisTap} />
      </div>
    </div>
  );
}

function PairCircle({ color, onClick }: { color: Color; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={`puyo ${color}`}
      className="w-12 h-12 rounded-full font-bold flex items-center justify-center text-white touch-manipulation select-none active:scale-95 transition-transform"
      style={{
        backgroundImage: `radial-gradient(circle at 35% 30%, ${PUYO_LIGHT[color]}, ${PUYO_COLORS[color]} 60%, ${PUYO_DARK[color]})`,
        boxShadow: `inset 0 -2px 4px ${PUYO_DARK[color]}`,
      }}
    >
      {color}
    </button>
  );
}
