import { useGameStore } from '../../store';
import { useBoardCellSize } from '../../hooks/useUiPrefs';
import { PUYO_COLORS, PUYO_LIGHT, PUYO_DARK } from '../Board/colors';
import type { Color } from '../../../game/types';

// 盤面右側に NEXT(直近)を上、NEXT-NEXT(その次)を下に縦並びで表示する。
// 両方とも盤面のセルと同じサイズで描画して、ユーザが「実際の大きさ」で
// 次のツモを把握できるようにする。
//
// ama 観戦中 (viewing === 'ai') は ama 側の next queue を表示する。リプレイ中は
// スナップショットの queue を読む (history index は未スクラブなら最終手にフォール
// バック)。これで NEXT/NEXT-NEXT が当時の手番のツモと一致する。
//
// match モードでは規定手数 (matchTurnLimit) を超えるツモは表示しない。queue[i]
// は (turnsPlayedAtView + 2 + i) 手目のペア — その手番が規定内のときだけ表示。
export function NextQueue() {
  const playerGame = useGameStore((s) => s.game);
  const playerQueue = playerGame.nextQueue;
  const aiGame = useGameStore((s) => s.aiGame);
  const viewing = useGameStore((s) => s.viewing);
  const aiHistory = useGameStore((s) => s.aiHistory);
  const aiHistoryViewIndex = useGameStore((s) => s.aiHistoryViewIndex);
  const playerHistory = useGameStore((s) => s.playerHistory);
  const playerHistoryViewIndex = useGameStore((s) => s.playerHistoryViewIndex);
  const mode = useGameStore((s) => s.mode);
  const matchEnded = useGameStore((s) => s.matchEnded);
  const matchTurnLimit = useGameStore((s) => s.matchTurnLimit);
  const matchTurnsPlayed = useGameStore((s) => s.matchTurnsPlayed);
  const inReplay =
    mode === 'match' && (matchEnded || playerGame.status === 'gameover');
  const aiViewIdx = aiHistoryViewIndex ?? Math.max(0, aiHistory.length - 1);
  const playerViewIdx =
    playerHistoryViewIndex ?? Math.max(0, playerHistory.length - 1);
  // Resolve snapshots once so queue + turn-count branches stay consistent on
  // the edge case where the side has no recorded turns yet (e.g. immediate
  // top-out before any move) — there both fall through together.
  const aiSnapshot = aiHistory[aiViewIdx];
  const playerSnapshot = playerHistory[playerViewIdx];
  const queue = !inReplay
    ? playerQueue
    : viewing === 'ai'
      ? (aiSnapshot?.nextQueue ?? aiGame?.nextQueue ?? playerQueue)
      : (playerSnapshot?.nextQueue ?? playerQueue);
  // 表示中スナップショットの時点で「何手消化済みか」。history[k] は post-move-(k+1)
  // = (k+1) 手消化済みなので k+1。スナップショット欠落時は 0 手消化扱い (= history.length)。
  // non-replay 中は live の matchTurnsPlayed。
  const turnsPlayedAtView = !inReplay
    ? matchTurnsPlayed
    : viewing === 'ai'
      ? (aiSnapshot ? aiViewIdx + 1 : aiHistory.length)
      : (playerSnapshot ? playerViewIdx + 1 : playerHistory.length);
  const beyondLimit = (i: number) =>
    mode === 'match' && turnsPlayedAtView + 2 + i > matchTurnLimit;
  const next = beyondLimit(0) ? undefined : queue[0];
  const nextNext = beyondLimit(1) ? undefined : queue[1];
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
