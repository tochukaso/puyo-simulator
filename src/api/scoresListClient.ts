// `/api/daily/scores` を叩く薄いクライアント。 SPA の ScoresPage と
// puyo-blog 側のスタンドアロン HTML から共有可能な型を提供する。

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
  const origin = baseOrigin ?? window.location.origin;
  const url = new URL('/api/daily/scores', origin);
  const sp = buildScoresListSearch(query);
  for (const [k, v] of sp.entries()) url.searchParams.set(k, v);
  const res = await fetch(url.toString());
  if (!res.ok) {
    throw new Error(`scores list fetch failed (${res.status})`);
  }
  return (await res.json()) as ScoresListResponse;
}
