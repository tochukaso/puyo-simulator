import { useGameStore } from '../../store';
import { useAiSuggestion } from '../../hooks/useAiSuggestion';
import { useT } from '../../../i18n';
import { confirmDialog } from '../../utils/dialog';

export function Controls() {
  const reset = useGameStore((s) => s.reset);
  const dispatch = useGameStore((s) => s.dispatch);
  const historyLength = useGameStore((s) => s.history.length);
  const animating = useGameStore((s) => s.animatingSteps.length > 0);
  const undo = useGameStore((s) => s.undo);
  const mode = useGameStore((s) => s.mode);
  // match モードでは AI 最善手ボタン自体を隠しているので、worker への
  // suggest 投げ自体も止める。
  const { moves, loading, aiReady } = useAiSuggestion(1, mode !== 'match');
  const t = useT();
  const canUndo = historyLength > 0 && !animating;
  const aiBest = moves[0] ?? null;
  // The AI commit button is disabled while thinking, while not yet loaded,
  // when there are no candidates, and during the chain animation.
  const canAiCommit = aiReady && !loading && !animating && aiBest !== null;
  // Match mode is a player-vs-ama score race — letting the user delegate to
  // the AI breaks that. Hide the button entirely (rather than just disabling)
  // so the bottom row stays balanced.
  const showAiBest = mode !== 'match';

  const cellBase =
    'py-3 rounded text-base touch-manipulation select-none disabled:opacity-50 disabled:cursor-not-allowed';

  return (
    <div className="flex flex-col gap-2 w-full">
      <div className="grid grid-cols-3 gap-2 w-full">
        <button
          className={`${cellBase} bg-slate-700 hover:bg-slate-600 active:bg-slate-500`}
          onClick={() => dispatch({ type: 'moveLeft' })}
          aria-label={t('controls.moveLeft')}
        >
          {t('controls.moveLeft')}
        </button>
        <button
          className={`${cellBase} bg-slate-700 hover:bg-slate-600 active:bg-slate-500`}
          onClick={() => dispatch({ type: 'softDrop' })}
          aria-label={t('controls.softDrop')}
        >
          {t('controls.softDrop')}
        </button>
        <button
          className={`${cellBase} bg-slate-700 hover:bg-slate-600 active:bg-slate-500`}
          onClick={() => dispatch({ type: 'moveRight' })}
          aria-label={t('controls.moveRight')}
        >
          {t('controls.moveRight')}
        </button>
      </div>
      <div
        className={`grid gap-2 w-full ${showAiBest ? 'grid-cols-5' : 'grid-cols-4'}`}
      >
        <button
          className={`${cellBase} bg-slate-700 hover:bg-slate-600 active:bg-slate-500`}
          onClick={() => dispatch({ type: 'rotateCW' })}
        >
          {t('controls.rotateCw')}
        </button>
        <button
          className={`${cellBase} bg-blue-600 hover:bg-blue-500 active:bg-blue-400`}
          onClick={() => {
            const { game, commit } = useGameStore.getState();
            if (!game.current) return;
            commit({ axisCol: game.current.axisCol, rotation: game.current.rotation });
          }}
        >
          {t('controls.commit')}
        </button>
        {showAiBest && (
          <button
            className={`${cellBase} bg-emerald-600 hover:bg-emerald-500 active:bg-emerald-400`}
            disabled={!canAiCommit}
            onClick={() => {
              if (!aiBest) return;
              useGameStore.getState().commit(aiBest, { source: 'ai' });
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
        )}
        <button
          className={`${cellBase} bg-amber-600 hover:bg-amber-500 active:bg-amber-400`}
          disabled={!canUndo}
          onClick={() => undo(1)}
          aria-label={t('controls.undoAria', { n: 1 })}
        >
          {t('controls.undo')}
        </button>
        <button
          className={`${cellBase} bg-red-600 hover:bg-red-500 active:bg-red-400`}
          onClick={async () => {
            if (await confirmDialog(t('controls.resetConfirm'))) reset();
          }}
        >
          {t('controls.reset')}
        </button>
      </div>
    </div>
  );
}
