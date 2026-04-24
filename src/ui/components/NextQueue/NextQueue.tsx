import { useGameStore } from '../../store';
import { PUYO_COLORS } from '../Board/colors';

export function NextQueue() {
  const queue = useGameStore((s) => s.game.nextQueue);
  const next = queue[0];
  const nextNext = queue[1];
  return (
    <div className="flex gap-3 items-start text-xs">
      <PairDisplay label="NEXT" pair={next} />
      <PairDisplay label="NEXT2" pair={nextNext} />
    </div>
  );
}

function PairDisplay({ label, pair }: { label: string; pair: { axis: string; child: string } | undefined }) {
  return (
    <div className="flex flex-col items-center">
      <div className="text-slate-400 mb-1">{label}</div>
      <div className="flex flex-col gap-0.5 bg-slate-800 p-1 rounded">
        <Dot color={pair?.child ?? undefined} />
        <Dot color={pair?.axis ?? undefined} />
      </div>
    </div>
  );
}

function Dot({ color }: { color: string | undefined }) {
  if (!color) return <div className="w-6 h-6 rounded-full bg-slate-700" />;
  const hex = PUYO_COLORS[color as keyof typeof PUYO_COLORS];
  return <div className="w-6 h-6 rounded-full" style={{ backgroundColor: hex }} />;
}
