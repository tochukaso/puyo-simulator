import { useEffect, useState } from 'react';
import { setAiKind } from '../../hooks/useAiSuggestion';
import { useGhostEnabled, setGhostEnabled } from '../../hooks/useUiPrefs';
import type { AiKind as Kind } from '../../../ai/types';

const STORAGE_KEY = 'puyo.ai.kind';
const VALID: readonly Kind[] = ['heuristic', 'ml-v1', 'ml-ama-v1', 'ama-wasm'] as const;

function readInitialKind(): Kind {
  const v =
    typeof localStorage !== 'undefined' ? localStorage.getItem(STORAGE_KEY) : null;
  return (VALID as readonly string[]).includes(v ?? '') ? (v as Kind) : 'ml-ama-v1';
}

export function Header() {
  const [kind, setKind] = useState<Kind>(readInitialKind);
  const ghost = useGhostEnabled();

  useEffect(() => {
    setAiKind(kind);
  }, [kind]);

  return (
    <header className="p-3 border-b border-slate-800 flex justify-between items-center gap-3">
      <span className="text-lg">Puyo Training</span>
      <div className="flex items-center gap-3">
        <label className="text-sm flex items-center gap-1 select-none">
          <input
            type="checkbox"
            aria-label="ゴースト"
            checked={ghost}
            onChange={(e) => setGhostEnabled(e.target.checked)}
            className="accent-blue-500"
          />
          ゴースト
        </label>
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
            <option value="ml-v1">ML (policy-v1)</option>
            <option value="ml-ama-v1">ML (ama-distilled-v1)</option>
            <option value="ama-wasm">ama (WASM)</option>
          </select>
        </label>
      </div>
    </header>
  );
}
