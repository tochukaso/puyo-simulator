import { useGameStore } from '../../store';
import { PUYO_COLORS, PUYO_LIGHT, PUYO_DARK } from '../Board/colors';
import type { Color } from '../../../game/types';

// Following the original Puyo Puyo, show NEXT (the upcoming pair) on top
// and NEXT-NEXT (the one after) below it, stacked vertically to the right
// of the board. NEXT-NEXT is rendered slightly smaller, as in the original,
// to convey visual priority.
export function NextQueue() {
  const queue = useGameStore((s) => s.game.nextQueue);
  const next = queue[0];
  const nextNext = queue[1];
  return (
    <div className="flex flex-col gap-3 items-center">
      <PairDisplay pair={next} dotSize={28} />
      <PairDisplay pair={nextNext} dotSize={20} />
    </div>
  );
}

function PairDisplay({
  pair,
  dotSize,
}: {
  pair: { axis: Color; child: Color } | undefined;
  dotSize: number;
}) {
  return (
    <div className="flex flex-col gap-0.5 bg-slate-800 p-1 rounded">
      <Dot color={pair?.child} size={dotSize} />
      <Dot color={pair?.axis} size={dotSize} />
    </div>
  );
}

function Dot({ color, size }: { color: Color | undefined; size: number }) {
  const style: React.CSSProperties = { width: size, height: size };
  if (!color) return <div className="rounded-full bg-slate-700" style={style} />;

  // Same look as drawPuyo in Board.tsx: CSS radial-gradient + dark border +
  // initial letter in the center. Light source is at the upper-left to
  // match the canvas rendering.
  const fontSize = Math.round(size * 0.5);
  const borderWidth = Math.max(1, Math.round(size * 0.08));
  return (
    <div
      className="rounded-full flex items-center justify-center font-bold text-white select-none"
      style={{
        ...style,
        background: `radial-gradient(circle at 30% 25%, ${PUYO_LIGHT[color]} 0%, ${PUYO_COLORS[color]} 55%, ${PUYO_DARK[color]} 100%)`,
        border: `${borderWidth}px solid ${PUYO_DARK[color]}`,
        fontSize,
        lineHeight: 1,
        textShadow: '0 0 2px rgba(0,0,0,0.85), 0 1px 1px rgba(0,0,0,0.6)',
      }}
    >
      {color}
    </div>
  );
}
