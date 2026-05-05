import { useEffect, useState } from 'react';
import { useGameStore } from '../../store';
import { useT } from '../../../i18n';
import { saveRecord } from '../../../match/records';

// Live status panel for match mode: turn counter, dual scores, side toggle,
// and (when applicable) an AI history scrubber. Hidden in 'free' mode.
export function MatchPanel() {
  const mode = useGameStore((s) => s.mode);
  const matchTurnLimit = useGameStore((s) => s.matchTurnLimit);
  const matchTurnsPlayed = useGameStore((s) => s.matchTurnsPlayed);
  const playerStatus = useGameStore((s) => s.game.status);
  const playerScore = useGameStore((s) => s.game.score);
  const aiGame = useGameStore((s) => s.aiGame);
  const aiHistory = useGameStore((s) => s.aiHistory);
  const aiHistoryViewIndex = useGameStore((s) => s.aiHistoryViewIndex);
  const playerHistory = useGameStore((s) => s.playerHistory);
  const playerHistoryViewIndex = useGameStore((s) => s.playerHistoryViewIndex);
  const viewing = useGameStore((s) => s.viewing);
  const matchEnded = useGameStore((s) => s.matchEnded);
  const matchResult = useGameStore((s) => s.matchResult);
  const matchSeed = useGameStore((s) => s.matchSeed);
  const matchPreset = useGameStore((s) => s.matchPreset);
  const matchPlayerMoves = useGameStore((s) => s.matchPlayerMoves);
  const matchAiMoves = useGameStore((s) => s.matchAiMoves);
  const setViewing = useGameStore((s) => s.setViewing);
  const setAiHistoryViewIndex = useGameStore((s) => s.setAiHistoryViewIndex);
  const setPlayerHistoryViewIndex = useGameStore(
    (s) => s.setPlayerHistoryViewIndex,
  );
  const playHistoryChain = useGameStore((s) => s.playHistoryChain);
  const historyAnim = useGameStore((s) => s.historyAnim);
  const startMatch = useGameStore((s) => s.startMatch);
  const setGameMode = useGameStore((s) => s.setGameMode);
  const reset = useGameStore((s) => s.reset);
  const loadedRecordId = useGameStore((s) => s.loadedRecordId);
  const t = useT();

  // 保存済みレコードの一覧はケバブメニューの RecordsDialog に移管したので、
  // ここでは「このマッチをまだ保存していない」フラグだけを保持する。
  const [savedThisMatch, setSavedThisMatch] = useState(false);

  // 同じマッチの保存ボタンを 1 回だけ有効にしたいので、マッチが切り替わるたびに
  // フラグを戻す。matchSeed の変化はライブの新規マッチでも loadRecord でも
  // 起こるので、loadRecord 後はそのままだと再保存されてしまうが、
  // loadedRecordId が non-null になっている間は保存ボタン自体を出さない方針。
  useEffect(() => {
    setSavedThisMatch(false);
  }, [matchSeed]);

  if (mode !== 'match') return null;

  const aiScore = aiGame?.score ?? 0;
  const remaining = Math.max(0, matchTurnLimit - matchTurnsPlayed);
  const aiTurns = aiHistory.length;
  const playerTurns = playerHistory.length;
  // Slider only meaningful when there's at least one snapshot on that side.
  const aiSliderMax = Math.max(0, aiTurns - 1);
  const aiSliderValue =
    aiHistoryViewIndex !== null
      ? Math.min(aiHistoryViewIndex, aiSliderMax)
      : aiSliderMax;
  const playerSliderMax = Math.max(0, playerTurns - 1);
  const playerSliderValue =
    playerHistoryViewIndex !== null
      ? Math.min(playerHistoryViewIndex, playerSliderMax)
      : playerSliderMax;

  // The snapshot at slider position p is post-move-(p+1) (= the active pair on
  // top is the one for move p+2). To match what the user perceives — "this is
  // the move whose pair is about to drop" — the replay button targets the NEXT
  // history entry: chain on move (p+2) is recorded in history[p+1].chainCount.
  // After the replay finishes we auto-advance the slider by 1 so the post-chain
  // state stays on screen instead of snapping back to the pre-state.
  const aiNext = aiHistory[aiSliderValue + 1];
  const playerNext = playerHistory[playerSliderValue + 1];
  const aiHasChain = !!aiNext && aiNext.chainCount > 0;
  const playerHasChain = !!playerNext && playerNext.chainCount > 0;
  const animating = historyAnim !== null;

  return (
    <div
      className="w-full bg-slate-900 border border-slate-700 rounded p-2 text-xs flex flex-col gap-2"
      data-no-gesture
    >
      <div className="flex flex-wrap gap-x-3 gap-y-1 items-baseline">
        <span className="text-slate-300">
          {t('match.turn')}:{' '}
          <b className="text-white tabular-nums">
            {matchTurnsPlayed}/{matchTurnLimit}
          </b>
          <span className="text-slate-500"> ({t('match.remaining', { n: remaining })})</span>
        </span>
        <span className="text-slate-300">
          {t('match.you')}:{' '}
          <b className="text-emerald-300 tabular-nums">
            {playerScore.toLocaleString()}
          </b>
          <span className="text-slate-500 tabular-nums">
            {' '}
            ({matchTurnsPlayed}/{matchTurnLimit})
          </span>
        </span>
        <span className="text-slate-300">
          {t('match.ama')}:{' '}
          <b className="text-amber-300 tabular-nums">{aiScore.toLocaleString()}</b>
          <span className="text-slate-500 tabular-nums">
            {' '}
            ({aiTurns}/{matchTurnLimit})
          </span>
        </span>
      </div>

      {/* マッチ進行中は ama 盤面の覗き見を許さない (「ama の打ち方を真似る」が
          できてしまう)。プレイヤーが top-out (status === 'gameover') した後は
          もう打てないので公平性は問題にならず、振り返り UI を解禁する。終了後
          も同様に view 切替・スクラバーを出す。 */}
      {(matchEnded || playerStatus === 'gameover') && (
        <div className="flex flex-col gap-2">
          {/* Row 1: side toggle on the left, contextual chain replay button
              pushed to the right end of the same row (per-side, only when
              that side's next move resolves into a chain). */}
          <div className="flex items-center gap-2 flex-wrap">
            <div className="inline-flex rounded overflow-hidden border border-slate-700">
              <button
                type="button"
                onClick={() => setViewing('player')}
                className={`px-2 py-1 text-xs ${
                  viewing === 'player'
                    ? 'bg-blue-600 text-white'
                    : 'bg-slate-800 text-slate-300 hover:bg-slate-700'
                }`}
              >
                {t('match.viewYou')}
              </button>
              <button
                type="button"
                onClick={() => setViewing('ai')}
                className={`px-2 py-1 text-xs ${
                  viewing === 'ai'
                    ? 'bg-blue-600 text-white'
                    : 'bg-slate-800 text-slate-300 hover:bg-slate-700'
                }`}
              >
                {t('match.viewAi')}
              </button>
            </div>
            {viewing === 'ai' && aiTurns > 0 && aiHasChain && (
              <button
                type="button"
                disabled={animating}
                onClick={async () => {
                  const target = aiSliderValue + 1;
                  const completed = await playHistoryChain('ai', target);
                  if (completed) setAiHistoryViewIndex(target);
                }}
                className="ml-auto px-2 py-1 bg-emerald-700 hover:bg-emerald-600 disabled:opacity-50 disabled:cursor-not-allowed rounded text-xs"
                title={t('match.playChainTitle')}
              >
                {t('match.playChain')}
              </button>
            )}
            {viewing === 'player' && playerTurns > 0 && playerHasChain && (
              <button
                type="button"
                disabled={animating}
                onClick={async () => {
                  const target = playerSliderValue + 1;
                  const completed = await playHistoryChain('player', target);
                  if (completed) setPlayerHistoryViewIndex(target);
                }}
                className="ml-auto px-2 py-1 bg-emerald-700 hover:bg-emerald-600 disabled:opacity-50 disabled:cursor-not-allowed rounded text-xs"
                title={t('match.playChainTitle')}
              >
                {t('match.playChain')}
              </button>
            )}
          </div>
          {/* Row 2: scrub slider + position counter + step buttons. */}
          {viewing === 'ai' && aiTurns > 0 && (
            <div className="flex items-center gap-1 grow min-w-0">
              <input
                aria-label={t('match.scrub')}
                type="range"
                min={0}
                max={aiSliderMax}
                value={aiSliderValue}
                onChange={(e) => setAiHistoryViewIndex(Number(e.target.value))}
                className="grow accent-blue-500 min-w-0"
              />
              <span className="text-slate-500 tabular-nums whitespace-nowrap">
                {aiSliderValue + 1}/{aiTurns}
              </span>
              <button
                type="button"
                disabled={animating || aiSliderValue <= 0}
                onClick={() =>
                  setAiHistoryViewIndex(Math.max(0, aiSliderValue - 1))
                }
                className="px-2 py-0.5 bg-slate-800 hover:bg-slate-700 disabled:opacity-50 disabled:cursor-not-allowed rounded text-xs"
                title={t('match.stepBackTitle')}
                aria-label={t('match.stepBackTitle')}
              >
                ◀
              </button>
              <button
                type="button"
                disabled={animating || aiSliderValue >= aiSliderMax}
                onClick={() =>
                  setAiHistoryViewIndex(Math.min(aiSliderMax, aiSliderValue + 1))
                }
                className="px-2 py-0.5 bg-slate-800 hover:bg-slate-700 disabled:opacity-50 disabled:cursor-not-allowed rounded text-xs"
                title={t('match.stepForwardTitle')}
                aria-label={t('match.stepForwardTitle')}
              >
                ▶
              </button>
            </div>
          )}
          {viewing === 'player' && playerTurns > 0 && (
            <div className="flex items-center gap-1 grow min-w-0">
              <input
                aria-label={t('match.playerScrub')}
                type="range"
                min={0}
                max={playerSliderMax}
                value={playerSliderValue}
                onChange={(e) =>
                  setPlayerHistoryViewIndex(Number(e.target.value))
                }
                className="grow accent-blue-500 min-w-0"
              />
              <span className="text-slate-500 tabular-nums whitespace-nowrap">
                {playerSliderValue + 1}/{playerTurns}
              </span>
              <button
                type="button"
                disabled={animating || playerSliderValue <= 0}
                onClick={() =>
                  setPlayerHistoryViewIndex(Math.max(0, playerSliderValue - 1))
                }
                className="px-2 py-0.5 bg-slate-800 hover:bg-slate-700 disabled:opacity-50 disabled:cursor-not-allowed rounded text-xs"
                title={t('match.stepBackTitle')}
                aria-label={t('match.stepBackTitle')}
              >
                ◀
              </button>
              <button
                type="button"
                disabled={animating || playerSliderValue >= playerSliderMax}
                onClick={() =>
                  setPlayerHistoryViewIndex(
                    Math.min(playerSliderMax, playerSliderValue + 1),
                  )
                }
                className="px-2 py-0.5 bg-slate-800 hover:bg-slate-700 disabled:opacity-50 disabled:cursor-not-allowed rounded text-xs"
                title={t('match.stepForwardTitle')}
                aria-label={t('match.stepForwardTitle')}
              >
                ▶
              </button>
            </div>
          )}
        </div>
      )}
      {matchEnded && matchResult && (
        <div className="border-t border-slate-700 pt-2 flex flex-wrap items-center gap-3">
          <span className="text-base">
            {matchResult.winner === 'player'
              ? `🏆 ${t('match.youWin')}`
              : matchResult.winner === 'ai'
                ? `🤖 ${t('match.amaWin')}`
                : t('match.draw')}
          </span>
          <span className="text-slate-400">
            {playerScore.toLocaleString()} vs {aiScore.toLocaleString()}
          </span>
          {loadedRecordId !== null ? (
            // 既に保存済みのレコードを開いて見ているので「保存」は出さず、
            // 代わりに状況がわかるバッジ + リプレイ表示を抜けるショートカット
            // を出す。フリーモードに移ると loadRecord 由来の状態が wipe される。
            <>
              <span className="text-blue-300 text-xs whitespace-nowrap">
                {t('match.viewingRecord')}
              </span>
              <button
                type="button"
                onClick={() => {
                  // setGameMode('free') は match 系の状態 (aiHistory 等) は
                  // クリアするが game は loadRecord で書いた末尾スナップショット
                  // のまま (turnLimit 到達時は current=null = 操作不能盤面)。
                  // reset() で操作可能な初期盤面に戻す。
                  setGameMode('free');
                  reset();
                }}
                className="px-2 py-1 bg-slate-700 hover:bg-slate-600 rounded text-xs"
              >
                {t('match.exitReplay')}
              </button>
            </>
          ) : (
            <button
              type="button"
              disabled={savedThisMatch || matchSeed === null}
              onClick={async () => {
                if (matchSeed === null) return;
                await saveRecord({
                  turnLimit: matchTurnLimit,
                  preset: matchPreset,
                  seed: matchSeed,
                  playerScore,
                  aiScore,
                  winner: matchResult.winner,
                  playerMoves: matchPlayerMoves,
                  aiMoves: matchAiMoves,
                });
                setSavedThisMatch(true);
              }}
              className="px-2 py-1 bg-blue-600 hover:bg-blue-500 disabled:opacity-50 disabled:cursor-not-allowed rounded text-xs"
            >
              {savedThisMatch ? t('match.saved') : t('match.save')}
            </button>
          )}
          <button
            type="button"
            onClick={() => startMatch({ turnLimit: matchTurnLimit })}
            className="px-2 py-1 bg-emerald-600 hover:bg-emerald-500 rounded text-xs"
          >
            {t('match.rematch')}
          </button>
        </div>
      )}
    </div>
  );
}
