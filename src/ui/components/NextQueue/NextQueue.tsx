import { useGameStore } from '../../store';
import { PUYO_COLORS } from '../Board/colors';

// 本家ぷよぷよと同じく、盤面の右側に NEXT(直近)を上、NEXT-NEXT(その次)を
// 下に縦並びで表示する。NEXT-NEXT は本家どおりひとまわり小さく表示して
// 視線の優先順位を示す。
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
  pair: { axis: string; child: string } | undefined;
  dotSize: number;
}) {
  return (
    <div className="flex flex-col gap-0.5 bg-slate-800 p-1 rounded">
      <Dot color={pair?.child} size={dotSize} />
      <Dot color={pair?.axis} size={dotSize} />
    </div>
  );
}

function Dot({ color, size }: { color: string | undefined; size: number }) {
  const style = { width: size, height: size };
  if (!color) return <div className="rounded-full bg-slate-700" style={style} />;
  const hex = PUYO_COLORS[color as keyof typeof PUYO_COLORS];
  return <div className="rounded-full" style={{ ...style, backgroundColor: hex }} />;
}
