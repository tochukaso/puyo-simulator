import { useEffect, useState } from 'react';
import { useGameStore } from '../../store';
import { useT } from '../../../i18n';
import {
  listRecords,
  saveRecord,
  deleteRecord,
  type MatchRecord,
} from '../../../match/records';

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
  const viewing = useGameStore((s) => s.viewing);
  const matchEnded = useGameStore((s) => s.matchEnded);
  const matchResult = useGameStore((s) => s.matchResult);
  const matchSeed = useGameStore((s) => s.matchSeed);
  const matchPreset = useGameStore((s) => s.matchPreset);
  const matchPlayerMoves = useGameStore((s) => s.matchPlayerMoves);
  const matchAiMoves = useGameStore((s) => s.matchAiMoves);
  const setViewing = useGameStore((s) => s.setViewing);
  const setAiHistoryViewIndex = useGameStore((s) => s.setAiHistoryViewIndex);
  const startMatch = useGameStore((s) => s.startMatch);
  const resignMatch = useGameStore((s) => s.resignMatch);
  const t = useT();

  // 保存済みレコードの一覧 (IndexedDB から非同期に読む)。
  const [records, setRecords] = useState<MatchRecord[]>([]);
  const [savedThisMatch, setSavedThisMatch] = useState(false);

  // 結果画面を出すたびに最新の一覧を取り直す。
  useEffect(() => {
    if (mode !== 'match') return;
    void listRecords().then(setRecords);
  }, [mode, matchEnded]);

  // 同じマッチの保存ボタンを 1 回だけ有効にしたいので、マッチが切り替わるたびにフラグを戻す。
  useEffect(() => {
    setSavedThisMatch(false);
  }, [matchSeed]);

  if (mode !== 'match') return null;

  const aiScore = aiGame?.score ?? 0;
  const remaining = Math.max(0, matchTurnLimit - matchTurnsPlayed);
  const aiTurns = aiHistory.length;
  // Slider only meaningful when there's at least one AI snapshot.
  const sliderMax = Math.max(0, aiTurns - 1);
  const sliderValue =
    aiHistoryViewIndex !== null
      ? Math.min(aiHistoryViewIndex, sliderMax)
      : sliderMax;

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
        </span>
        <span className="text-slate-300">
          {t('match.ama')}:{' '}
          <b className="text-amber-300 tabular-nums">{aiScore.toLocaleString()}</b>
        </span>
      </div>

      {/* マッチ進行中は ama 盤面の覗き見を許さない (「ama の打ち方を真似る」が
          できてしまう)。プレイヤーが top-out (status === 'gameover') した後は
          もう打てないので公平性は問題にならず、振り返り UI を解禁する。終了後
          も同様に view 切替・スクラバーを出す。
          投了ボタンは matchEnded になるまで一貫して表示 (top-out 後も「ama の
          完走を待たず即終了」できるように)。 */}
      {(matchEnded || playerStatus === 'gameover') && (
        <div className="flex flex-wrap gap-2 items-center">
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
          {viewing === 'ai' && aiTurns > 0 && (
            <div className="flex flex-wrap items-center gap-1 grow min-w-0">
              <input
                aria-label={t('match.scrub')}
                type="range"
                min={0}
                max={sliderMax}
                value={sliderValue}
                onChange={(e) => setAiHistoryViewIndex(Number(e.target.value))}
                className="grow accent-blue-500 min-w-0"
              />
              <span className="text-slate-500 tabular-nums whitespace-nowrap">
                {sliderValue + 1}/{aiTurns}
              </span>
              <button
                type="button"
                onClick={() => setAiHistoryViewIndex(null)}
                className="px-2 py-0.5 bg-slate-800 hover:bg-slate-700 rounded text-xs"
              >
                {t('match.live')}
              </button>
            </div>
          )}
        </div>
      )}
      {!matchEnded && (
        <div className="flex flex-wrap gap-2 items-center">
          <button
            type="button"
            onClick={() => {
              if (confirm(t('match.resignConfirm'))) resignMatch();
            }}
            className="px-2 py-1 bg-red-600 hover:bg-red-500 active:bg-red-400 rounded text-xs"
          >
            {t('match.resign')}
          </button>
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
              setRecords(await listRecords());
            }}
            className="px-2 py-1 bg-blue-600 hover:bg-blue-500 disabled:opacity-50 disabled:cursor-not-allowed rounded text-xs"
          >
            {savedThisMatch ? t('match.saved') : t('match.save')}
          </button>
          <button
            type="button"
            onClick={() => startMatch({ turnLimit: matchTurnLimit })}
            className="px-2 py-1 bg-emerald-600 hover:bg-emerald-500 rounded text-xs"
          >
            {t('match.rematch')}
          </button>
        </div>
      )}

      {records.length > 0 && (
        <details className="border-t border-slate-700 pt-2">
          <summary className="text-slate-300 cursor-pointer select-none">
            {t('match.records')}{' '}
            <span className="text-slate-500">({records.length})</span>
          </summary>
          <ul className="mt-2 flex flex-col gap-1 max-h-48 overflow-y-auto">
            {records.map((r) => {
              const date = new Date(r.createdAt);
              const dateStr = `${date.getMonth() + 1}/${date.getDate()} ${date.getHours()}:${String(date.getMinutes()).padStart(2, '0')}`;
              const winLabel =
                r.winner === 'player'
                  ? t('match.you')
                  : r.winner === 'ai'
                    ? t('match.ama')
                    : t('match.draw');
              const winColor =
                r.winner === 'player'
                  ? 'text-emerald-300'
                  : r.winner === 'ai'
                    ? 'text-amber-300'
                    : 'text-slate-300';
              return (
                <li
                  key={r.id}
                  className="flex items-center justify-between gap-2 bg-slate-800 rounded px-2 py-1"
                >
                  <span className="text-slate-400 tabular-nums whitespace-nowrap">
                    {dateStr}
                  </span>
                  <span className="text-slate-500 whitespace-nowrap">
                    {r.turnLimit}
                  </span>
                  <span className={`font-mono tabular-nums whitespace-nowrap ${winColor}`}>
                    {r.playerScore.toLocaleString()} - {r.aiScore.toLocaleString()}
                  </span>
                  <span className={`whitespace-nowrap ${winColor}`}>{winLabel}</span>
                  <button
                    type="button"
                    onClick={async () => {
                      await deleteRecord(r.id);
                      setRecords(await listRecords());
                    }}
                    aria-label={t('match.deleteRecord')}
                    className="text-slate-500 hover:text-red-400 px-1"
                  >
                    ✕
                  </button>
                </li>
              );
            })}
          </ul>
        </details>
      )}
    </div>
  );
}
