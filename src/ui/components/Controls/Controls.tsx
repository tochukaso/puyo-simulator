import { useGameStore } from '../../store';
import { useAiSuggestion } from '../../hooks/useAiSuggestion';
import { useT } from '../../../i18n';
import { confirmDialog } from '../../utils/dialog';
import { useControlMode, useControlTuning } from '../../hooks/useControlPrefs';
import { usePressRepeat } from '../../hooks/usePressRepeat';

export function Controls() {
  const reset = useGameStore((s) => s.reset);
  const dispatch = useGameStore((s) => s.dispatch);
  const animating = useGameStore((s) => s.animatingSteps.length > 0);
  const undo = useGameStore((s) => s.undo);
  const mode = useGameStore((s) => s.mode);
  // store の canUndo() を直接 selector として購読する。free / match / score
  // のルールが store 側に集約されているので、UI 側で再実装するとロジックが
  // 分岐して将来ドリフトしうる。selector が返すのは boolean なので不要な
  // 再レンダーは起きない (zustand は Object.is で比較)。
  const canUndo = useGameStore((s) => s.canUndo());
  // match / score モードでは AI 最善手ボタン自体を隠しているので、worker への
  // suggest 投げ自体も止める。
  const { moves, loading, aiReady } = useAiSuggestion(1, mode === 'free');
  const t = useT();
  const aiBest = moves[0] ?? null;
  // The AI commit button is disabled while thinking, while not yet loaded,
  // when there are no candidates, and during the chain animation.
  const canAiCommit = aiReady && !loading && !animating && aiBest !== null;

  const controlMode = useControlMode();
  const tuning = useControlTuning();

  // free モードのみ AI Best と Undo を出す。
  // match モード: AI Best 隠し / Undo は出す (player-only undo)。
  // score モード: AI Best も Undo も隠し、代わりに左回転を出す。
  const showAiBest = mode === 'free';
  const showUndo = mode === 'free' || mode === 'match';
  // CCW を出す条件:
  //   - score モード: 既存仕様 (CCW + CW を並列)
  //   - tap-to-drop / drag: ジェスチャーで回転できないので CCW ボタンを表示
  const showCcw =
    mode === 'score' || controlMode === 'tap-to-drop' || controlMode === 'drag';
  // score モードのときだけ CCW + CW を両方出す。tap-to-drop / drag は
  // CCW を CW の代わりに置き換える (CW は既存ボタンのまま使い分け)。
  const showCwExtra = mode === 'score';

  const padY = tuning.buttonScaleLarge ? 'py-4' : 'py-3';
  const fontSize = tuning.buttonScaleLarge ? 'text-lg' : 'text-base';
  const cellBase =
    `${padY} rounded ${fontSize} touch-manipulation select-none disabled:opacity-50 disabled:cursor-not-allowed`;

  // 2 段目のグリッド列数を出すボタン数に合わせる。
  // free:  [CW or CCW, Drop, AI Best, Undo, Reset]              = 5
  // match: [CW or CCW, Drop, Undo, Reset]                       = 4
  // score: [CCW, Drop, CW, Reset]                               = 4
  const cols = showAiBest ? 5 : 4;

  const repeatLeft = usePressRepeat(
    () => dispatch({ type: 'moveLeft' }),
    { enabled: tuning.holdRepeatEnabled, initialDelayMs: 200, intervalMs: 80 },
  );
  const repeatRight = usePressRepeat(
    () => dispatch({ type: 'moveRight' }),
    { enabled: tuning.holdRepeatEnabled, initialDelayMs: 200, intervalMs: 80 },
  );
  const repeatDrop = usePressRepeat(
    () => dispatch({ type: 'softDrop' }),
    { enabled: tuning.holdRepeatEnabled, initialDelayMs: 200, intervalMs: 60 },
  );

  return (
    <div className="flex flex-col gap-2 w-full">
      <div className="grid grid-cols-3 gap-2 w-full">
        <button
          className={`${cellBase} bg-slate-700 hover:bg-slate-600 active:bg-slate-500`}
          onPointerDown={repeatLeft.onPointerDown}
          onPointerUp={repeatLeft.onPointerUp}
          onPointerCancel={repeatLeft.onPointerCancel}
          onPointerLeave={repeatLeft.onPointerLeave}
          aria-label={t('controls.moveLeft')}
        >
          {t('controls.moveLeft')}
        </button>
        <button
          className={`${cellBase} bg-slate-700 hover:bg-slate-600 active:bg-slate-500`}
          onPointerDown={repeatDrop.onPointerDown}
          onPointerUp={repeatDrop.onPointerUp}
          onPointerCancel={repeatDrop.onPointerCancel}
          onPointerLeave={repeatDrop.onPointerLeave}
          aria-label={t('controls.softDrop')}
        >
          {t('controls.softDrop')}
        </button>
        <button
          className={`${cellBase} bg-slate-700 hover:bg-slate-600 active:bg-slate-500`}
          onPointerDown={repeatRight.onPointerDown}
          onPointerUp={repeatRight.onPointerUp}
          onPointerCancel={repeatRight.onPointerCancel}
          onPointerLeave={repeatRight.onPointerLeave}
          aria-label={t('controls.moveRight')}
        >
          {t('controls.moveRight')}
        </button>
      </div>
      <div
        className={`grid gap-2 w-full ${cols === 5 ? 'grid-cols-5' : 'grid-cols-4'}`}
      >
        {showCcw ? (
          <button
            className={`${cellBase} bg-slate-700 hover:bg-slate-600 active:bg-slate-500`}
            onClick={() => dispatch({ type: 'rotateCCW' })}
          >
            {t('controls.rotateCcw')}
          </button>
        ) : (
          <button
            className={`${cellBase} bg-slate-700 hover:bg-slate-600 active:bg-slate-500`}
            onClick={() => dispatch({ type: 'rotateCW' })}
          >
            {t('controls.rotateCw')}
          </button>
        )}
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
        {showCwExtra && (
          <button
            className={`${cellBase} bg-slate-700 hover:bg-slate-600 active:bg-slate-500`}
            onClick={() => dispatch({ type: 'rotateCW' })}
          >
            {t('controls.rotateCw')}
          </button>
        )}
        {showUndo && (
          <button
            className={`${cellBase} bg-amber-600 hover:bg-amber-500 active:bg-amber-400`}
            disabled={!canUndo}
            onClick={() => undo(1)}
            aria-label={t('controls.undoAria', { n: 1 })}
          >
            {t('controls.undo')}
          </button>
        )}
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
