import { useEffect, useState } from 'react';
import { useAiSuggestion } from '../../hooks/useAiSuggestion';
import { useGameStore } from '../../store';
import { setPreviewMove, usePreviewMove } from '../../hooks/useAiPreview';
import { useT } from '../../../i18n';
import type { Move } from '../../../game/types';

const COLLAPSED_KEY = 'puyo.candidates.collapsed';

function readInitialCollapsed(): boolean {
  try {
    return localStorage.getItem(COLLAPSED_KEY) === '1';
  } catch {
    return false;
  }
}

export function CandidateList() {
  const { moves, loading, aiKind, aiReady } = useAiSuggestion(5);
  const commit = useGameStore((s) => s.commit);
  const previewMove = usePreviewMove();
  const t = useT();
  const [collapsed, setCollapsed] = useState<boolean>(readInitialCollapsed);

  // Clear the preview when a new pair arrives (= moves is recomputed). This
  // avoids the confusing case where an old move's ghost is drawn with the new
  // pair's colors.
  useEffect(() => {
    setPreviewMove(null);
  }, [moves]);

  // Also clear preview when collapsed (so the ghost on the Board doesn't
  // linger while the list is hidden).
  useEffect(() => {
    if (collapsed) setPreviewMove(null);
  }, [collapsed]);

  const status = !aiReady
    ? t('candidates.loading', { aiKind })
    : loading
      ? t('candidates.thinking')
      : `(${moves.length})`;

  // Display values relative to the top candidate (taken as 100%). Each AI has
  // a different score scale, so "how good compared to the best move" reads
  // more uniformly than absolute scores.
  const top = moves.reduce((m, x) => Math.max(m, x.score ?? 0), 0);

  const isSelected = (m: Move): boolean =>
    previewMove !== null &&
    previewMove.axisCol === m.axisCol &&
    previewMove.rotation === m.rotation;

  const toggle = () => {
    const next = !collapsed;
    setCollapsed(next);
    try {
      localStorage.setItem(COLLAPSED_KEY, next ? '1' : '0');
    } catch {
      // ignore
    }
  };

  return (
    <div className="bg-slate-900 border border-slate-700 rounded text-xs" data-no-gesture>
      <button
        type="button"
        onClick={toggle}
        aria-expanded={!collapsed}
        aria-label={collapsed ? t('candidates.expand') : t('candidates.collapse')}
        className="w-full px-2 py-1 text-left text-slate-300 border-b border-slate-700 flex items-center gap-1 hover:bg-slate-800"
      >
        <span aria-hidden="true" className="inline-block w-3 text-slate-500">
          {collapsed ? '▶' : '▼'}
        </span>
        <span>{t('candidates.title')}</span>
        <span className="text-slate-500">{status}</span>
      </button>
      {collapsed ? null : (
      <ul className="p-1 space-y-1">
        {moves.map((m) => {
          const pct = top > 0 ? Math.max(0, Math.round(((m.score ?? 0) / top) * 100)) : 0;
          const selected = isSelected(m);
          return (
            <li
              key={`${m.axisCol}-${m.rotation}`}
              className={`flex items-center justify-between gap-1 p-1 rounded cursor-pointer transition-colors ${
                selected ? 'bg-slate-700 ring-2 ring-blue-400' : 'bg-slate-800'
              }`}
              // Mouse: hover previews temporarily and reverts on leave. Touch
              // has no hover concept, so we ignore enter/leave and use onClick
              // to persist selection.
              onPointerEnter={(e) => {
                if (e.pointerType === 'mouse') setPreviewMove(m);
              }}
              onPointerLeave={(e) => {
                if (e.pointerType === 'mouse') setPreviewMove(null);
              }}
              onClick={() => setPreviewMove(selected ? null : m)}
            >
              <span className="text-slate-300 tabular-nums">{pct}%</span>
              <button
                className="px-2 py-0.5 bg-blue-600 rounded text-xs hover:bg-blue-500"
                // Don't bubble to the row's onClick (selection toggle); execute is a separate action.
                onClick={(e) => {
                  e.stopPropagation();
                  setPreviewMove(null);
                  commit(m);
                }}
              >
                {t('candidates.execute')}
              </button>
            </li>
          );
        })}
      </ul>
      )}
    </div>
  );
}
