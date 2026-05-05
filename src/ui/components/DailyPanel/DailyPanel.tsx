import { useEffect, useState } from 'react';
import { useGameStore } from '../../store';
import { useT } from '../../../i18n';
import {
  todayDateJst,
  yesterdayDateJst,
  isValidDailyDate,
} from '../../../game/dailySeed';
import {
  type DailyLeaderboardEntry,
  getDailyLeaderboard,
  persistNickname,
  readMyDailyIds,
  readSavedNickname,
  rememberMyDailyId,
} from '../../../api/dailyClient';
import { postScoreToServer, getScoreFromServer } from '../../../api/scoresClient';

// デイリーモード専用のサブパネル。 MatchPanel の下に並べて表示する。
//
// 役割:
//   1. 終了後にニックネーム + サーバ送信 UI を提供
//   2. 今日 / 昨日のリーダーボードを表示
//   3. リーダーボード行クリックで他人のリプレイを呼び出す
//   4. X (Twitter) 共有ボタン
//
// ニックネームの永続化は localStorage (`puyo.dailyNickname`)。空欄保存にすると
// 翌日は匿名扱い。前回入力した名前があればデフォルトでそれが入る。

type ViewDate = 'today' | 'yesterday';

type SubmitState =
  | { kind: 'idle' }
  | { kind: 'submitting' }
  | { kind: 'submitted'; id: string; rank: number | null }
  | { kind: 'failed' };

export function DailyPanel() {
  const mode = useGameStore((s) => s.mode);
  const matchEnded = useGameStore((s) => s.matchEnded);
  const matchResult = useGameStore((s) => s.matchResult);
  const matchSeed = useGameStore((s) => s.matchSeed);
  const currentDailyDate = useGameStore((s) => s.currentDailyDate);
  const matchPlayerMoves = useGameStore((s) => s.matchPlayerMoves);
  const loadedRecordId = useGameStore((s) => s.loadedRecordId);
  const loadRecord = useGameStore((s) => s.loadRecord);
  const t = useT();

  const [nickname, setNickname] = useState<string>(() => readSavedNickname());
  const [submitState, setSubmitState] = useState<SubmitState>({ kind: 'idle' });
  const [viewDate, setViewDate] = useState<ViewDate>('today');
  const [leaderboard, setLeaderboard] = useState<DailyLeaderboardEntry[] | null>(
    null,
  );
  const [leaderboardErr, setLeaderboardErr] = useState<string | null>(null);
  const [myIds, setMyIds] = useState<readonly string[]>([]);

  // viewDate に対応する日付文字列。"today" は currentDailyDate を優先 (テストで
  // 固定日付を使えるように)、無ければ todayDateJst()。 "yesterday" は前日。
  const today = currentDailyDate ?? todayDateJst();
  const targetDate = viewDate === 'today' ? today : yesterdayDateJst(new Date());
  const isReplaying = loadedRecordId !== null;

  // リーダーボードを取得 (date 切替 / 送信成功時に再取得)。
  useEffect(() => {
    if (!isValidDailyDate(targetDate)) return;
    let cancelled = false;
    setLeaderboard(null);
    setLeaderboardErr(null);
    getDailyLeaderboard(targetDate, 20)
      .then((res) => {
        if (cancelled) return;
        setLeaderboard(res.entries);
      })
      .catch(() => {
        if (cancelled) return;
        setLeaderboardErr(t('daily.leaderboardError'));
      });
    setMyIds(readMyDailyIds(targetDate));
    return () => {
      cancelled = true;
    };
  }, [targetDate, submitState, t]);

  if (mode !== 'daily') return null;

  // 自分の最終スコア (まだ未終了なら null)。
  const finalScore = matchEnded && matchResult ? matchResult.playerScore : null;
  // ふだんは today の leaderboard を見せるが、リプレイ表示中 (= 他人のレコードを
  // ロードして見ている) は実プレイの送信ボタンは出さない。
  const canSubmit =
    !isReplaying &&
    matchEnded &&
    matchSeed !== null &&
    currentDailyDate !== null &&
    matchPlayerMoves.length > 0 &&
    finalScore !== null;

  // 送信ハンドラ。 idempotent ではなく、押されるたびに別レコードが立つので、
  // 送信済みフラグで二度押しを抑止する。エラー時は再試行可能 (state を failed
  // に戻す)。
  async function onSubmit() {
    if (!canSubmit || matchSeed === null || currentDailyDate === null) return;
    if (finalScore === null) return;
    const trimmed = nickname.trim().slice(0, 32);
    persistNickname(trimmed);
    setSubmitState({ kind: 'submitting' });
    try {
      const { id } = await postScoreToServer({
        mode: 'daily',
        turnLimit: 50,
        preset: '',
        seed: matchSeed,
        playerScore: finalScore,
        aiScore: 0,
        winner: 'player',
        playerMoves: matchPlayerMoves,
        aiMoves: [],
        dailyDate: currentDailyDate,
        // exactOptionalPropertyTypes が有効なので undefined を
        // 直接プロパティに入れずに、空文字なら欠落にする。
        ...(trimmed ? { playerName: trimmed } : {}),
      });
      rememberMyDailyId(currentDailyDate, id);
      // 送信直後に leaderboard を再取得 (useEffect の依存に submitState を
      // 含めている)。 自分の rank は新しい leaderboard 反映時に確認する。
      setSubmitState({ kind: 'submitted', id, rank: null });
    } catch {
      setSubmitState({ kind: 'failed' });
    }
  }

  // X (Twitter) 共有。 intent URL に text + URL を載せて投稿画面を開く。
  // URL は現在表示しているレコード (送信済み) の serverScoreUrl にフォール
  // バックさせる。 未送信時は素の origin を貼る。
  function shareToX() {
    if (finalScore === null || !currentDailyDate) return;
    const tmpl = t('daily.shareXText');
    const text = tmpl
      .replace('{date}', currentDailyDate)
      .replace('{score}', finalScore.toLocaleString());
    let url = window.location.origin + window.location.pathname;
    if (submitState.kind === 'submitted') {
      // /api/scores/:id を共有しても見れないので、front の ?score=<id> 経路。
      const u = new URL(url);
      u.searchParams.set('score', submitState.id);
      url = u.toString();
    }
    const intent = `https://twitter.com/intent/tweet?text=${encodeURIComponent(
      text,
    )}&url=${encodeURIComponent(url)}`;
    window.open(intent, '_blank', 'noopener,noreferrer');
  }

  // リーダーボード行をクリック → サーバから完全レコードを取得して loadRecord。
  async function onPickEntry(id: string) {
    try {
      const rec = await getScoreFromServer(id);
      loadRecord(rec);
    } catch {
      // エラー時は黙る (致命的ではない; ユーザは別の行を試せる)。
    }
  }

  return (
    <div
      className="w-full bg-slate-900 border border-slate-700 rounded p-2 text-xs flex flex-col gap-2"
      data-no-gesture
    >
      <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <span className="text-slate-200 font-bold">{t('daily.title')}</span>
        <span className="text-slate-500">
          {today} ({t('daily.fixedTurns', { n: 50 })})
        </span>
      </div>

      {/* 送信 UI: 終了 & 自分のプレイなら出す。 */}
      {canSubmit && submitState.kind !== 'submitted' && (
        <div className="flex flex-wrap items-center gap-2">
          <label className="flex items-center gap-1">
            <span className="text-slate-400 whitespace-nowrap">
              {t('daily.nicknameLabel')}
            </span>
            <input
              type="text"
              value={nickname}
              onChange={(e) => setNickname(e.target.value)}
              placeholder={t('daily.nicknamePlaceholder')}
              maxLength={32}
              className="bg-slate-800 border border-slate-700 rounded px-2 py-0.5 text-xs text-slate-100 w-40"
            />
          </label>
          <button
            type="button"
            disabled={submitState.kind === 'submitting'}
            onClick={onSubmit}
            className="px-2 py-0.5 bg-blue-600 hover:bg-blue-500 disabled:opacity-50 disabled:cursor-not-allowed rounded text-xs"
          >
            {submitState.kind === 'submitting'
              ? t('daily.submitting')
              : submitState.kind === 'failed'
                ? t('daily.submitFailed')
                : t('daily.submit')}
          </button>
        </div>
      )}
      {submitState.kind === 'submitted' && (
        <div className="text-emerald-300">{t('daily.submitted')}</div>
      )}

      {/* X 共有: 終了後ならいつでも (送信前でも) 押せるようにする。 送信済み
          なら共有 URL に ?score=<id> を載せて他人もリプレイを見れる。 */}
      {matchEnded && finalScore !== null && (
        <div>
          <button
            type="button"
            onClick={shareToX}
            className="px-2 py-0.5 bg-slate-700 hover:bg-slate-600 rounded text-xs"
          >
            {t('daily.shareX')}
          </button>
        </div>
      )}

      {/* 今日 / 昨日タブ。 */}
      <div className="flex gap-1 mt-1">
        <button
          type="button"
          onClick={() => setViewDate('today')}
          className={`px-2 py-0.5 rounded text-xs ${
            viewDate === 'today'
              ? 'bg-blue-600 text-white'
              : 'bg-slate-800 text-slate-300 hover:bg-slate-700'
          }`}
        >
          {t('daily.viewToday')}
        </button>
        <button
          type="button"
          onClick={() => setViewDate('yesterday')}
          className={`px-2 py-0.5 rounded text-xs ${
            viewDate === 'yesterday'
              ? 'bg-blue-600 text-white'
              : 'bg-slate-800 text-slate-300 hover:bg-slate-700'
          }`}
        >
          {t('daily.viewYesterday')}
        </button>
        <span className="ml-auto text-slate-500 self-center">{targetDate}</span>
      </div>

      {/* リーダーボード本体。 */}
      <div className="flex flex-col gap-0.5 max-h-60 overflow-y-auto">
        {leaderboard === null ? (
          leaderboardErr ? (
            <div className="text-rose-300">{leaderboardErr}</div>
          ) : (
            <div className="text-slate-500">
              {t('daily.leaderboardLoading')}
            </div>
          )
        ) : leaderboard.length === 0 ? (
          <div className="text-slate-500">{t('daily.leaderboardEmpty')}</div>
        ) : (
          leaderboard.map((e) => {
            const isMine = myIds.includes(e.id);
            const name = e.playerName?.trim() || t('daily.anonymous');
            return (
              <button
                key={e.id}
                type="button"
                onClick={() => onPickEntry(e.id)}
                title={t('daily.replayThis')}
                className={`flex items-center gap-2 px-2 py-1 rounded text-left hover:bg-slate-800 ${
                  isMine ? 'bg-slate-800 ring-1 ring-emerald-500' : 'bg-slate-900'
                }`}
              >
                <span className="text-slate-500 tabular-nums w-6 text-right">
                  #{e.rank}
                </span>
                <span
                  className={`tabular-nums font-mono ${
                    isMine ? 'text-emerald-300' : 'text-slate-100'
                  }`}
                >
                  {e.playerScore.toLocaleString()}
                </span>
                <span className="text-slate-300 truncate flex-1">{name}</span>
                {isMine && (
                  <span className="text-emerald-400 whitespace-nowrap">
                    {t('daily.youAreHere')}
                  </span>
                )}
              </button>
            );
          })
        )}
      </div>
    </div>
  );
}
