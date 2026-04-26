import { useEffect } from 'react';
import { useAiSuggestion } from '../../hooks/useAiSuggestion';
import { useGameStore } from '../../store';
import { setPreviewMove, usePreviewMove } from '../../hooks/useAiPreview';
import { useT } from '../../../i18n';
import type { Move } from '../../../game/types';

export function CandidateList() {
  const { moves, loading, aiKind, aiReady } = useAiSuggestion(5);
  const commit = useGameStore((s) => s.commit);
  const previewMove = usePreviewMove();
  const t = useT();

  // 新しいツモになる(= moves が再計算される)タイミングで preview をクリア。
  // 古い手のゴーストが新しいぷよ色で描かれる紛らわしさを避ける。
  useEffect(() => {
    setPreviewMove(null);
  }, [moves]);

  const status = !aiReady
    ? t('candidates.loading', { aiKind })
    : loading
      ? t('candidates.thinking')
      : `(${moves.length})`;

  // 候補内のトップ手を 100% として相対表示。各 AI でスコアのスケールが違うため、
  // 絶対値より「最善手と比べてどれだけ良いか」のほうが横断的に読みやすい。
  const top = moves.reduce((m, x) => Math.max(m, x.score ?? 0), 0);

  const isSelected = (m: Move): boolean =>
    previewMove !== null &&
    previewMove.axisCol === m.axisCol &&
    previewMove.rotation === m.rotation;

  return (
    <div className="bg-slate-900 border border-slate-700 rounded text-xs">
      <div className="px-2 py-1 text-slate-300 border-b border-slate-700">
        {t('candidates.title')} <span className="text-slate-500">{status}</span>
      </div>
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
              // マウスはホバーで一時的にプレビュー、離れたら戻す。タッチでは
              // hover 概念がないので enter/leave は無視し、onClick で選択を保持する。
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
                className="px-2 py-0.5 bg-blue-600 rounded text-xs"
                // 行の onClick(選択トグル)に伝播させない。実行は別アクション。
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
    </div>
  );
}
