import { useState } from 'react';
import { useAiSuggestion } from '../../hooks/useAiSuggestion';
import { useGameStore } from '../../store';

export function CandidateList() {
  const { moves, loading } = useAiSuggestion(5);
  const commit = useGameStore((s) => s.commit);
  const [open, setOpen] = useState(false);

  return (
    <div className="w-full bg-slate-900 border-t border-slate-700">
      <button
        className="w-full p-2 text-sm text-slate-300 flex justify-between items-center"
        onClick={() => setOpen(!open)}
      >
        <span>AI候補 {loading ? '(思考中)' : `(${moves.length})`}</span>
        <span>{open ? '▼' : '▲'}</span>
      </button>
      {open && (
        <ul className="p-2 space-y-1 max-h-60 overflow-y-auto">
          {moves.map((m, i) => (
            <li
              key={`${m.axisCol}-${m.rotation}`}
              className="flex items-center justify-between p-2 bg-slate-800 rounded text-sm"
            >
              <div>
                <span className="text-slate-400 mr-2">{i + 1}.</span>
                <span>列{m.axisCol + 1} / 回転{m.rotation}</span>
                <div className="text-xs text-slate-400">{m.reason}</div>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-xs text-slate-500">
                  {Math.round(m.score ?? 0)}
                </span>
                <button
                  className="px-2 py-1 bg-blue-600 rounded text-xs"
                  onClick={() => commit(m)}
                >
                  実行
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
