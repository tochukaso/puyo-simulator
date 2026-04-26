import { useEffect, useState } from 'react';
import type { Move } from '../../game/types';

// AI 候補手のプレビュー状態。CandidateList で hover / 選択された手を Board の
// ゴースト描画と共有するためのモジュールローカルなシングルトン + listener。
// useUiPrefs と同じ流儀。永続化はしない(その場限りの UI 状態)。
let previewMove: Move | null = null;
const listeners = new Set<(v: Move | null) => void>();

export function setPreviewMove(m: Move | null): void {
  // 参照だけでなく中身でも比較。同じ手の繰り返し set で listener を煽らない。
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
