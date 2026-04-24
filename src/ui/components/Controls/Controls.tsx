import { useState } from 'react';
import { useGameStore } from '../../store';

const UNDO_OPTIONS = [1, 2, 3, 5, 10] as const;

export function Controls() {
  const reset = useGameStore((s) => s.reset);
  const dispatch = useGameStore((s) => s.dispatch);
  const historyLength = useGameStore((s) => s.history.length);
  const animating = useGameStore((s) => s.animatingSteps.length > 0);
  const undo = useGameStore((s) => s.undo);
  const [undoSteps, setUndoSteps] = useState(1);
  const canUndo = historyLength > 0 && !animating;
  const effectiveSteps = Math.min(undoSteps, historyLength);

  return (
    <div className="flex flex-wrap gap-2 items-center">
      <button
        className="px-3 py-1 bg-slate-700 rounded hover:bg-slate-600"
        onClick={() => dispatch({ type: 'rotateCCW' })}
      >
        ↻ CCW
      </button>
      <button
        className="px-3 py-1 bg-blue-600 rounded hover:bg-blue-500"
        onClick={() => {
          const { game, commit } = useGameStore.getState();
          if (!game.current) return;
          commit({ axisCol: game.current.axisCol, rotation: game.current.rotation });
        }}
      >
        ↓ 確定
      </button>
      <div className="flex items-center gap-1 bg-slate-800 rounded px-1">
        <button
          className="px-2 py-1 bg-amber-600 rounded hover:bg-amber-500 disabled:bg-slate-700 disabled:text-slate-500 disabled:cursor-not-allowed"
          disabled={!canUndo}
          onClick={() => undo(effectiveSteps)}
          aria-label={`${effectiveSteps} 手戻る`}
        >
          ↶ 戻る
        </button>
        <select
          className="bg-slate-900 text-xs rounded px-1 py-0.5"
          value={undoSteps}
          onChange={(e) => setUndoSteps(Number(e.target.value))}
          aria-label="戻る手数"
        >
          {UNDO_OPTIONS.map((n) => (
            <option key={n} value={n}>
              {n} 手
            </option>
          ))}
        </select>
        <span className="text-xs text-slate-500 px-1">/ {historyLength}</span>
      </div>
      <button
        className="px-3 py-1 bg-red-600 rounded hover:bg-red-500"
        onClick={() => {
          if (confirm('リセットしますか?')) reset();
        }}
      >
        Reset
      </button>
    </div>
  );
}
