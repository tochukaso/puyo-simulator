import { useGameStore } from '../../store';
import { useBoardCellSize } from '../../hooks/useUiPrefs';
import { PUYO_COLORS, PUYO_LIGHT, PUYO_DARK } from '../Board/colors';
import type { Color } from '../../../game/types';

// 盤面右側に NEXT(直近)を上、NEXT-NEXT(その次)を下に縦並びで表示する。
// 両方とも盤面のセルと同じサイズで描画して、ユーザが「実際の大きさ」で
// 次のツモを把握できるようにする。
export function NextQueue() {
  const queue = useGameStore((s) => s.game.nextQueue);
  const next = queue[0];
  const nextNext = queue[1];
  const cell = useBoardCellSize();
  return (
    <div className="flex flex-col gap-3 items-start">
      <PairDisplay pair={next} dotSize={cell} />
      <PairDisplay pair={nextNext} dotSize={cell} />
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

  // Board.tsx の drawPuyo と同じ見た目。CSS radial-gradient + 暗色 border +
  // 中央に頭文字。光源は左上に置いて canvas 側と揃える。
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
