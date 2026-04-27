import { useEffect, useState } from 'react';
import type { Move } from '../../game/types';

// Preview state for AI candidate moves. A module-local singleton + listener
// pattern that lets CandidateList's hover/selection flow into the Board's
// ghost rendering. Same approach as useUiPrefs. Not persisted (transient UI state).
let previewMove: Move | null = null;
const listeners = new Set<(v: Move | null) => void>();

export function setPreviewMove(m: Move | null): void {
  // Compare by content, not just by reference, so repeated set() calls with
  // the same move don't churn listeners.
  if (sameMove(previewMove, m)) return;
  previewMove = m;
  for (const h of listeners) h(m);
}

export function getPreviewMove(): Move | null {
  return previewMove;
}

export function usePreviewMove(): Move | null {
  const [v, setV] = useState(previewMove);
  useEffect(() => {
    listeners.add(setV);
    return () => {
      listeners.delete(setV);
    };
  }, []);
  return v;
}

function sameMove(a: Move | null, b: Move | null): boolean {
  if (a === b) return true;
  if (!a || !b) return false;
  return a.axisCol === b.axisCol && a.rotation === b.rotation;
}
