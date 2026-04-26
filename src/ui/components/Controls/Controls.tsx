import { useState } from 'react';
import { useGameStore } from '../../store';
import { useAiSuggestion } from '../../hooks/useAiSuggestion';
import { useT } from '../../../i18n';

const UNDO_OPTIONS = [1, 2, 3, 5, 10] as const;

export function Controls() {
  const reset = useGameStore((s) => s.reset);
  const dispatch = useGameStore((s) => s.dispatch);
  const historyLength = useGameStore((s) => s.history.length);
  const animating = useGameStore((s) => s.animatingSteps.length > 0);
  const undo = useGameStore((s) => s.undo);
  const { moves, loading, aiReady } = useAiSuggestion(1);
  const [undoSteps, setUndoSteps] = useState(1);
  const t = useT();
  const canUndo = historyLength > 0 && !animating;
  const effectiveSteps = Math.min(undoSteps, historyLength);
  const aiBest = moves[0] ?? null;
  // 思考中・未ロード・候補なし・連鎖アニメ中は AI 確定ボタンを押せない。
  const canAiCommit = aiReady && !loading && !animating && aiBest !== null;

  return (
    <div className="flex flex-col gap-2 w-full">
      <div className="grid grid-cols-3 gap-2 w-full sm:max-w-md sm:mx-auto">
        <button
          className="py-3 bg-slate-700 rounded hover:bg-slate-600 active:bg-slate-500 text-base touch-manipulation select-none"
          onClick={() => dispatch({ type: 'moveLeft' })}
          aria-label={t('controls.moveLeft')}
        >
          {t('controls.moveLeft')}
        </button>
        <button
          className="py-3 bg-slate-700 rounded hover:bg-slate-600 active:bg-slate-500 text-base touch-manipulation select-none"
          onClick={() => dispatch({ type: 'softDrop' })}
          aria-label={t('controls.softDrop')}
        >
          {t('controls.softDrop')}
        </button>
        <button
          className="py-3 bg-slate-700 rounded hover:bg-slate-600 active:bg-slate-500 text-base touch-manipulation select-none"
          onClick={() => dispatch({ type: 'moveRight' })}
          aria-label={t('controls.moveRight')}
        >
          {t('controls.moveRight')}
        </button>
      </div>
      <div className="flex flex-wrap gap-2 items-center">
      <button
        className="px-3 py-1 bg-slate-700 rounded hover:bg-slate-600"
        onClick={() => dispatch({ type: 'rotateCCW' })}
      >
        {t('controls.rotateCcw')}
      </button>
      <button
        className="px-3 py-1 bg-blue-600 rounded hover:bg-blue-500"
        onClick={() => {
          const { game, commit } = useGameStore.getState();
          if (!game.current) return;
          commit({ axisCol: game.current.axisCol, rotation: game.current.rotation });
        }}
      >
        {t('controls.commit')}
      </button>
      <button
        className="px-3 py-1 bg-emerald-600 rounded hover:bg-emerald-500 disabled:bg-slate-700 disabled:text-slate-500 disabled:cursor-not-allowed"
        disabled={!canAiCommit}
        onClick={() => {
          if (!aiBest) return;
          useGameStore.getState().commit(aiBest);
        }}
        title={
          canAiCommit
            ? t('controls.aiBestTitle', {
                col: aiBest!.axisCol + 1,
                rot: aiBest!.rotation,
              })
            : t('controls.aiThinking')
        }
      >
        {t('controls.aiBest')}
      </button>
      <div className="flex items-center gap-1 bg-slate-800 rounded px-1">
        <button
          className="px-2 py-1 bg-amber-600 rounded hover:bg-amber-500 disabled:bg-slate-700 disabled:text-slate-500 disabled:cursor-not-allowed"
          disabled={!canUndo}
          onClick={() => undo(effectiveSteps)}
          aria-label={t('controls.undoAria', { n: effectiveSteps })}
        >
          {t('controls.undo')}
        </button>
        <select
          className="bg-slate-900 text-xs rounded px-1 py-0.5"
          value={undoSteps}
          onChange={(e) => setUndoSteps(Number(e.target.value))}
          aria-label={t('controls.undoStepsLabel')}
        >
          {UNDO_OPTIONS.map((n) => (
            <option key={n} value={n}>
              {t('controls.stepsOption', { n })}
            </option>
          ))}
        </select>
        <span className="text-xs text-slate-500 px-1">/ {historyLength}</span>
      </div>
      <button
        className="px-3 py-1 bg-red-600 rounded hover:bg-red-500"
        onClick={() => {
          if (confirm(t('controls.resetConfirm'))) reset();
        }}
      >
        {t('controls.reset')}
      </button>
      </div>
    </div>
  );
}
