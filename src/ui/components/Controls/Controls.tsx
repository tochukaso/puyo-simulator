import { useGameStore } from '../../store';
import { useAiSuggestion } from '../../hooks/useAiSuggestion';
import { isAiAssistMode } from '../../aiAssist';
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
  const viewing = useGameStore((s) => s.viewing);
  // store の canUndo() を直接 selector として購読する。free / match / score
  // のルールが store 側に集約されているので、UI 側で再実装するとロジックが
  // 分岐して将来ドリフトしうる。selector が返すのは boolean なので不要な
  // 再レンダーは起きない (zustand は Object.is で比較)。
  const canUndo = useGameStore((s) => s.canUndo());
  // AI 最善手ボタンを隠すモード/環境では worker への suggest 投げ自体も止める
  // (WASM 全幅探索が重いので非表示時に走らせるのは計算資源の無駄)。 モード判定は
  // isAiAssistMode (free 全環境 / match / score / daily は Tauri のみ) に集約。
  // さらに match で ama 観戦中 (viewing === 'ai') は commit がプレイヤー側に
  // 走るので、 観戦中の AI 操作と誤解させないため AI Best も隠す。
  const showAiBest = isAiAssistMode(mode) && viewing === 'player';
  const { moves, loading, aiReady } = useAiSuggestion(1, showAiBest);
  const t = useT();
  const aiBest = moves[0] ?? null;
  // The AI commit button is disabled while thinking, while not yet loaded,
  // when there are no candidates, and during the chain animation.
  const canAiCommit = aiReady && !loading && !animating && aiBest !== null;

  const controlMode = useControlMode();
  const tuning = useControlTuning();

  // free モードと、 match / score / daily の Tauri (Android) ビルドで AI Best を
  // 出す (showAiBest 上で計算済み)。
  // match モード: Undo は出す (player-only undo)。
  // score モード: AI Best 以外は隠し、代わりに左回転を出す。
  // daily モード: match と同様 Undo を出す (やり直し UX)。 Reset の代わりに
  // Stats 側の Quit ボタンを使うので Reset はここから外す。
  const showUndo = mode === 'free' || mode === 'match' || mode === 'daily';
  // Reset を出さないモード: daily (Quit に置き換わるため)。
  const showReset = mode !== 'daily';
  // CCW を出す条件:
  //   - score モード: 既存仕様 (CCW + CW を並列)
  //   - tap-to-drop / drag: ジェスチャーで回転できないので CCW ボタンを表示
  const showCcw =
    mode === 'score' || controlMode === 'tap-to-drop' || controlMode === 'drag';
  // CW を CCW の隣に追加で出す条件:
  //   - score モード: 既存仕様。
  //   - tap-to-drop: ジェスチャーで回転できないので CW も別途必要。CCW のみ
  //     だと逆回転で代用するハメになって使い物にならない。
  //   drag は範囲外タップで CW/CCW 両方できるので追加 CW は不要。
  const showCwExtra = mode === 'score' || controlMode === 'tap-to-drop';

  const padY = tuning.buttonScaleLarge ? 'py-4' : 'py-3';
  const fontSize = tuning.buttonScaleLarge ? 'text-lg' : 'text-base';
  const cellBase =
    `${padY} rounded ${fontSize} touch-manipulation select-none disabled:opacity-50 disabled:cursor-not-allowed`;

  // 2 段目のグリッド列数を出すボタン数に合わせる。
  // 常に出る: [primary rotate, Drop] = 2
  // option: showAiBest, showCwExtra, showUndo, showReset
  const cols =
    2 +
    (showAiBest ? 1 : 0) +
    (showCwExtra ? 1 : 0) +
    (showUndo ? 1 : 0) +
    (showReset ? 1 : 0);
  // Tailwind が静的に解析できるようクラス名を直接マップ (string concat だと
  // JIT がクラスを発見できない)。
  const colsClass =
    cols === 6
      ? 'grid-cols-6'
      : cols === 5
        ? 'grid-cols-5'
        : cols === 4
          ? 'grid-cols-4'
          : 'grid-cols-3';

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
        {/* onClick は keyboard 起動 (Enter/Space) 用フォールバック。
            pointer 起動の click は onPointerDown が既に発火しているため、
            e.detail === 0 (=keyboard 由来) のときだけ dispatch する。
            こうしないと指タップで 2 度発火する。 */}
        <button
          className={`${cellBase} bg-slate-700 hover:bg-slate-600 active:bg-slate-500`}
          onPointerDown={repeatLeft.onPointerDown}
          onPointerUp={repeatLeft.onPointerUp}
          onPointerCancel={repeatLeft.onPointerCancel}
          onPointerLeave={repeatLeft.onPointerLeave}
          onClick={(e) => {
            if (e.detail === 0) dispatch({ type: 'moveLeft' });
          }}
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
          onClick={(e) => {
            if (e.detail === 0) dispatch({ type: 'softDrop' });
          }}
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
          onClick={(e) => {
            if (e.detail === 0) dispatch({ type: 'moveRight' });
          }}
          aria-label={t('controls.moveRight')}
        >
          {t('controls.moveRight')}
        </button>
      </div>
      <div className={`grid gap-2 w-full ${colsClass}`}>
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
        {showReset && (
          <button
            className={`${cellBase} bg-red-600 hover:bg-red-500 active:bg-red-400`}
            onClick={async () => {
              if (await confirmDialog(t('controls.resetConfirm'))) reset();
            }}
          >
            {t('controls.reset')}
          </button>
        )}
      </div>
    </div>
  );
}
