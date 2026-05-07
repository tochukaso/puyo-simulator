import { useEffect, useMemo, useState } from 'react';
import { useT } from '../../../i18n';
import { isValidDailyDate } from '../../../game/dailySeed';
import {
  type ScoresListEntry,
  type ScoresListResponse,
  buildScoresListSearch,
  getScoresList,
} from '../../../api/scoresListClient';

// SPA 内のフルスクリーン「過去のリザルト一覧」ビュー。 App.tsx が
// `?view=scores` のクエリを検出したときに、 ゲーム UI の代わりに描画する。
//
// URL クエリ ↔ filter state を双方向同期して、 ブックマーク / シェア時に
// 同じ絞り込みが復元できるようにしている (`?view=scores&from=2026-04-01&name=alice`)。
//
// 各行の「リプレイ」ボタンはゲーム UI へ `?score=<id>` で戻し、 既存の
// loadRecord 経路でリプレイ表示に入る (App.tsx 起動時の score param 処理を
// そのまま利用)。

const PAGE_SIZE = 50;

interface FilterState {
  from: string;
  to: string;
  name: string;
  order: 'score' | 'date';
}

function readInitialFilter(): FilterState {
  const params = new URLSearchParams(window.location.search);
  const order = params.get('order') === 'date' ? 'date' : 'score';
  // URL から復元した値も applyFilter と同じ sanitization を通す。 そうしないと
  // 不正な bookmark (例: ?from=bad-date) で初回 fetch が API 400 になり
  // 「読み込み失敗」 表示で原因が見えない。 マウント時点で空文字に丸める
  // ことで、 ユーザは少なくとも全件表示の状態に着地する。
  const rawFrom = params.get('from') ?? '';
  const rawTo = params.get('to') ?? '';
  return {
    from: isValidDailyDate(rawFrom) ? rawFrom : '',
    to: isValidDailyDate(rawTo) ? rawTo : '',
    name: (params.get('name') ?? '').trim().slice(0, 32),
    order,
  };
}

function readInitialOffset(): number {
  const raw = new URLSearchParams(window.location.search).get('offset');
  if (raw === null) return 0;
  const n = Number(raw);
  return Number.isInteger(n) && n >= 0 ? n : 0;
}

// URL を「現在の filter + offset + view=scores」 に合わせて pushState する。
// SPA の他のクエリ (?score= 等) は触らないようガード。
function syncUrl(filter: FilterState, offset: number): void {
  const current = new URL(window.location.href);
  current.searchParams.set('view', 'scores');
  // 値があるキーのみセット、 空のキーは削除して URL を綺麗に保つ。
  const setOrDelete = (k: string, v: string) => {
    if (v) current.searchParams.set(k, v);
    else current.searchParams.delete(k);
  };
  setOrDelete('from', filter.from);
  setOrDelete('to', filter.to);
  setOrDelete('name', filter.name);
  setOrDelete('order', filter.order === 'score' ? '' : filter.order);
  setOrDelete('offset', offset > 0 ? String(offset) : '');
  window.history.replaceState(null, '', current.toString());
}

export function ScoresPage() {
  const t = useT();
  // 適用済み filter (= 実際に fetch を発火する元になる値)。 入力中のフォーム
  // 値とは分離して、 ユーザが「適用」ボタンを押したときだけ反映される。
  const [appliedFilter, setAppliedFilter] = useState<FilterState>(
    readInitialFilter,
  );
  const [offset, setOffset] = useState<number>(readInitialOffset);
  // 入力中フォーム (まだ適用していない)。
  const [draftFilter, setDraftFilter] = useState<FilterState>(appliedFilter);

  const [data, setData] = useState<ScoresListResponse | null>(null);
  const [failed, setFailed] = useState(false);
  const [loading, setLoading] = useState(false);

  // appliedFilter / offset 変更時に fetch + URL 同期。
  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setFailed(false);
    syncUrl(appliedFilter, offset);
    // exactOptionalPropertyTypes: true の都合で undefined 渡しが弾かれるため、
    // 値がある時だけキーを spread する。
    getScoresList({
      ...(appliedFilter.from ? { from: appliedFilter.from } : {}),
      ...(appliedFilter.to ? { to: appliedFilter.to } : {}),
      ...(appliedFilter.name ? { name: appliedFilter.name } : {}),
      order: appliedFilter.order,
      limit: PAGE_SIZE,
      offset,
    })
      .then((res) => {
        if (cancelled) return;
        setData(res);
      })
      .catch(() => {
        if (cancelled) return;
        setFailed(true);
      })
      .finally(() => {
        if (cancelled) return;
        setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [appliedFilter, offset]);

  function applyFilter(): void {
    // 簡易バリデーション: 日付フォーマット不正は無視 (空扱いに丸める)。
    const safe: FilterState = {
      from: isValidDailyDate(draftFilter.from) ? draftFilter.from : '',
      to: isValidDailyDate(draftFilter.to) ? draftFilter.to : '',
      name: draftFilter.name.trim().slice(0, 32),
      order: draftFilter.order,
    };
    setAppliedFilter(safe);
    // appliedFilter だけ sanitize して draftFilter (= input 表示) を放置すると、
    // ユーザ入力が " alice " (前後空白あり) や 不正日付の場合に「入力値と
    // 実際の問い合わせ値が乖離する」 silent な ズレが起きる。 視覚的に
    // 「補正された」 ことが分かるよう draft も同期。
    setDraftFilter(safe);
    setOffset(0);
  }
  function resetFilter(): void {
    const empty: FilterState = { from: '', to: '', name: '', order: 'score' };
    setDraftFilter(empty);
    setAppliedFilter(empty);
    setOffset(0);
  }

  // ゲーム UI に戻る。 `?view=scores` 系の query を全部消す。
  function backToGame(): void {
    const url = new URL(window.location.href);
    for (const k of [
      'view',
      'from',
      'to',
      'name',
      'order',
      'offset',
    ]) {
      url.searchParams.delete(k);
    }
    window.location.assign(url.toString());
  }

  // 行クリック → ?score=<id> でゲーム UI に戻して loadRecord 経路でリプレイ。
  function onReplay(entry: ScoresListEntry): void {
    const url = new URL(window.location.href);
    for (const k of ['view', 'from', 'to', 'name', 'order', 'offset']) {
      url.searchParams.delete(k);
    }
    url.searchParams.set('score', entry.id);
    window.location.assign(url.toString());
  }

  const total = data?.total ?? 0;
  const pageFrom = total === 0 ? 0 : offset + 1;
  const pageTo = data ? offset + data.entries.length : 0;
  const canPrev = offset > 0;
  const canNext = data ? offset + data.entries.length < total : false;

  // 共有 URL を作って Twitter 等に貼りやすくする (ブックマーク URL でもある)。
  const shareUrl = useMemo(() => {
    const sp = buildScoresListSearch({
      ...(appliedFilter.from ? { from: appliedFilter.from } : {}),
      ...(appliedFilter.to ? { to: appliedFilter.to } : {}),
      ...(appliedFilter.name ? { name: appliedFilter.name } : {}),
      order: appliedFilter.order,
    });
    sp.set('view', 'scores');
    return `${window.location.origin}${window.location.pathname}?${sp.toString()}`;
  }, [appliedFilter]);
  void shareUrl; // 将来「URL コピー」ボタンを追加する余地

  return (
    <div className="min-h-screen bg-slate-950 text-white p-4 flex flex-col gap-4 max-w-3xl mx-auto">
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <h1 className="text-xl font-bold">{t('scores.title')}</h1>
        <button
          type="button"
          onClick={backToGame}
          className="px-3 py-1 text-sm bg-slate-700 hover:bg-slate-600 rounded"
        >
          {t('scores.backToGame')}
        </button>
      </div>

      {/* フィルタフォーム。 」適用」を押さないと反映しない (タイプ毎に fetch
          発火するのを避ける)。 */}
      <div className="flex flex-wrap items-end gap-3 bg-slate-900 border border-slate-700 rounded p-3">
        <label className="flex flex-col text-xs gap-1">
          <span className="text-slate-400">{t('scores.filter.from')}</span>
          <input
            type="date"
            value={draftFilter.from}
            onChange={(e) =>
              setDraftFilter((f) => ({ ...f, from: e.target.value }))
            }
            className="bg-slate-800 border border-slate-600 rounded px-2 py-1 text-sm text-slate-100"
          />
        </label>
        <label className="flex flex-col text-xs gap-1">
          <span className="text-slate-400">{t('scores.filter.to')}</span>
          <input
            type="date"
            value={draftFilter.to}
            onChange={(e) =>
              setDraftFilter((f) => ({ ...f, to: e.target.value }))
            }
            className="bg-slate-800 border border-slate-600 rounded px-2 py-1 text-sm text-slate-100"
          />
        </label>
        <label className="flex flex-col text-xs gap-1 flex-1 min-w-[140px]">
          <span className="text-slate-400">{t('scores.filter.name')}</span>
          <input
            type="text"
            value={draftFilter.name}
            onChange={(e) =>
              setDraftFilter((f) => ({ ...f, name: e.target.value }))
            }
            placeholder={t('scores.filter.namePlaceholder')}
            maxLength={32}
            className="bg-slate-800 border border-slate-600 rounded px-2 py-1 text-sm text-slate-100"
          />
        </label>
        <label className="flex flex-col text-xs gap-1">
          <span className="text-slate-400">{t('scores.filter.order')}</span>
          <select
            value={draftFilter.order}
            onChange={(e) =>
              setDraftFilter((f) => ({
                ...f,
                order: e.target.value === 'date' ? 'date' : 'score',
              }))
            }
            className="bg-slate-800 border border-slate-600 rounded px-2 py-1 text-sm text-slate-100"
          >
            <option value="score">{t('scores.filter.orderScore')}</option>
            <option value="date">{t('scores.filter.orderDate')}</option>
          </select>
        </label>
        <div className="flex gap-2 ml-auto">
          <button
            type="button"
            onClick={applyFilter}
            className="px-3 py-1.5 bg-blue-600 hover:bg-blue-500 rounded text-sm font-bold"
          >
            {t('scores.filter.apply')}
          </button>
          <button
            type="button"
            onClick={resetFilter}
            className="px-3 py-1.5 bg-slate-700 hover:bg-slate-600 rounded text-sm"
          >
            {t('scores.filter.reset')}
          </button>
        </div>
      </div>

      {/* テーブル本体。 縦スクロール可、 ヘッダ sticky。 */}
      <div className="bg-slate-900 border border-slate-700 rounded">
        {loading ? (
          <div className="p-4 text-slate-500 text-sm">{t('scores.loading')}</div>
        ) : failed ? (
          <div className="p-4 text-rose-300 text-sm">{t('scores.error')}</div>
        ) : !data || data.entries.length === 0 ? (
          <div className="p-4 text-slate-500 text-sm">{t('scores.empty')}</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="text-xs text-slate-400 bg-slate-800">
                <tr>
                  <th className="px-3 py-2 text-left">
                    {t('scores.col.date')}
                  </th>
                  <th className="px-3 py-2 text-left">
                    {t('scores.col.name')}
                  </th>
                  <th className="px-3 py-2 text-right">
                    {t('scores.col.score')}
                  </th>
                  <th className="px-3 py-2 text-right">
                    {t('scores.col.action')}
                  </th>
                </tr>
              </thead>
              <tbody>
                {data.entries.map((e) => (
                  <tr
                    key={e.id}
                    className="border-t border-slate-800 hover:bg-slate-800/50"
                  >
                    <td className="px-3 py-2 tabular-nums whitespace-nowrap text-slate-300">
                      {e.dailyDate}
                    </td>
                    <td className="px-3 py-2 text-slate-100 truncate max-w-[200px]">
                      {e.playerName?.trim() || '—'}
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums font-mono text-emerald-300">
                      {e.playerScore.toLocaleString()}
                    </td>
                    <td className="px-3 py-2 text-right">
                      <button
                        type="button"
                        onClick={() => onReplay(e)}
                        className="px-2 py-1 bg-blue-600 hover:bg-blue-500 rounded text-xs"
                      >
                        {t('scores.replay')}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* ページング。 件数表示 + 前後ボタン。 */}
      <div className="flex items-center justify-between text-sm text-slate-400">
        <span>
          {t('scores.pagination.summary', {
            from: pageFrom,
            to: pageTo,
            total,
          })}
        </span>
        <div className="flex gap-2">
          <button
            type="button"
            disabled={!canPrev}
            onClick={() => setOffset(Math.max(0, offset - PAGE_SIZE))}
            className="px-3 py-1 bg-slate-700 hover:bg-slate-600 disabled:opacity-50 disabled:cursor-not-allowed rounded text-xs"
          >
            {t('scores.pagination.prev')}
          </button>
          <button
            type="button"
            disabled={!canNext}
            onClick={() => setOffset(offset + PAGE_SIZE)}
            className="px-3 py-1 bg-slate-700 hover:bg-slate-600 disabled:opacity-50 disabled:cursor-not-allowed rounded text-xs"
          >
            {t('scores.pagination.next')}
          </button>
        </div>
      </div>
    </div>
  );
}
