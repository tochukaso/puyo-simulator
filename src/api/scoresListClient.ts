// `/api/daily/scores` を叩く薄いクライアント。 SPA の ScoresPage と
// puyo-blog 側のスタンドアロン HTML から共有可能な型を提供する。
import { apiUrl, fetchJson } from './baseUrl';

export interface ScoresListEntry {
  id: string;
  /** ISO8601 (UTC)。 サーバが INSERT 時に詰めた値。 */
  createdAt: string;
  /** YYYY-MM-DD (JST)。 */
  dailyDate: string;
  /** 名乗っていなければ null。 */
  playerName: string | null;
  playerScore: number;
}

export interface ScoresListFilter {
  from: string | null;
  to: string | null;
  name: string | null;
}

export interface ScoresListResponse {
  total: number;
  limit: number;
  offset: number;
  order: 'score' | 'date';
  filter: ScoresListFilter;
  entries: ScoresListEntry[];
}

export interface ScoresListQuery {
  from?: string;
  to?: string;
  name?: string;
  limit?: number;
  offset?: number;
  order?: 'score' | 'date';
}

/** クエリオブジェクト → URLSearchParams。 undefined / 空文字キーはスキップ。 */
export function buildScoresListSearch(q: ScoresListQuery): URLSearchParams {
  const sp = new URLSearchParams();
  if (q.from) sp.set('from', q.from);
  if (q.to) sp.set('to', q.to);
  if (q.name) sp.set('name', q.name);
  if (q.limit !== undefined) sp.set('limit', String(q.limit));
  if (q.offset !== undefined) sp.set('offset', String(q.offset));
  if (q.order) sp.set('order', q.order);
  return sp;
}

export async function getScoresList(
  query: ScoresListQuery = {},
  baseOrigin?: string,
): Promise<ScoresListResponse> {
  // baseOrigin が明示されたら new URL で組み立て (= 外部 puyo-blog の
  // standalone HTML から呼ばれる経路)、 未指定なら apiUrl() で SPA / Tauri の
  // 環境差を吸収する。 apiOrigin() が空文字を返すケースで new URL(path, '')
  // が TypeError を吐くのを避けるため、 標準 SPA 経路は new URL を経由しない。
  const sp = buildScoresListSearch(query);
  const qs = sp.toString();
  const requestUrl = baseOrigin
    ? (() => {
        const u = new URL('/api/daily/scores', baseOrigin);
        for (const [k, v] of sp.entries()) u.searchParams.set(k, v);
        return u.toString();
      })()
    : `${apiUrl('/api/daily/scores')}${qs ? `?${qs}` : ''}`;
  return fetchJson<ScoresListResponse>(requestUrl, undefined, 'scores list fetch failed');
}
