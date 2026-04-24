import { useGameStore } from '../../store';

export function Stats() {
  const { score, chainCount, totalChains, status } = useGameStore((s) => s.game);
  return (
    <div className="flex gap-4 text-sm text-slate-300">
      <span>Score: <b className="text-white">{score.toLocaleString()}</b></span>
      <span>Chain: <b className="text-white">{chainCount}</b></span>
      <span>Total: <b className="text-white">{totalChains}</b></span>
      {status === 'gameover' && <span className="text-red-400">GAME OVER</span>}
    </div>
  );
}
