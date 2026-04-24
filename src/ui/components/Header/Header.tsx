import { useEffect, useState } from 'react';
import { setAiKind } from '../../hooks/useAiSuggestion';

const STORAGE_KEY = 'puyo.ai.kind';
type Kind = 'heuristic' | 'ml';

function readInitialKind(): Kind {
  const v = typeof localStorage !== 'undefined' ? localStorage.getItem(STORAGE_KEY) : null;
  return v === 'ml' ? 'ml' : 'heuristic';
}

export function Header() {
  const [kind, setKind] = useState<Kind>(readInitialKind);

  useEffect(() => {
    setAiKind(kind);
  }, [kind]);

  return (
    <header className="p-3 border-b border-slate-800 flex justify-between items-center">
      <span className="text-lg">Puyo Training</span>
      <label className="text-sm flex items-center gap-2">
        AI
        <select
          aria-label="AI"
          value={kind}
          onChange={(e) => {
            const next = e.target.value as Kind;
            setKind(next);
            localStorage.setItem(STORAGE_KEY, next);
          }}
          className="bg-slate-800 text-slate-100 border border-slate-700 rounded px-2 py-1"
        >
          <option value="heuristic">Heuristic</option>
          <option value="ml">ML (policy-v1)</option>
        </select>
      </label>
    </header>
  );
}
