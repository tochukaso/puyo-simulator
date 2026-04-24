import { useGameStore } from '../../store';

export function Controls() {
  const reset = useGameStore((s) => s.reset);
  const dispatch = useGameStore((s) => s.dispatch);
  return (
    <div className="flex gap-2">
      <button
        className="px-3 py-1 bg-slate-700 rounded hover:bg-slate-600"
        onClick={() => dispatch({ type: 'rotateCCW' })}
      >
        ↻ CCW
      </button>
      <button
        className="px-3 py-1 bg-blue-600 rounded hover:bg-blue-500"
        onClick={() => dispatch({ type: 'hardDrop' })}
      >
        ↓ 確定
      </button>
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
