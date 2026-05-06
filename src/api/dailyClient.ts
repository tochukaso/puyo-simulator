// Worker の `/api/daily/leaderboard` を叩くクライアント側の薄いラッパー。
// 通常のスコア保存は POST /api/scores 経由 (`scoresClient.ts`) で、 mode='daily'
// と dailyDate を載せて投げるだけなので、こちらは閲覧用エンドポイントだけ。

export interface DailyLeaderboardEntry {
  /** サーバ発番のレコード ID。GET /api/scores/:id でフルレコードを取れる。 */
  id: string;
  /** ISO8601 (UTC)。サーバが INSERT 時に詰めた値。 */
  createdAt: string;
  /** 名乗っていなければ null。UI 側で「匿名」にフォールバック。 */
  playerName: string | null;
  playerScore: number;
  /** ランキング順位 (1-based)。同点は createdAt ASC タイブレーク済み。 */
  rank: number;
}

export interface DailyLeaderboardResponse {
  date: string;
  limit: number;
  entries: DailyLeaderboardEntry[];
}

export async function getDailyLeaderboard(
  date: string,
  limit = 20,
): Promise<DailyLeaderboardResponse> {
  const url = new URL('/api/daily/leaderboard', window.location.origin);
  url.searchParams.set('date', date);
  url.searchParams.set('limit', String(limit));
  const res = await fetch(url.toString());
  if (!res.ok) {
    throw new Error(`leaderboard fetch failed (${res.status})`);
  }
  return (await res.json()) as DailyLeaderboardResponse;
}

const NICKNAME_KEY = 'puyo.dailyNickname';

/** 直近に使ったニックネームを思い出す。最初の起動時は空文字を返す。 */
export function readSavedNickname(): string {
  try {
    return localStorage.getItem(NICKNAME_KEY) ?? '';
  } catch {
    return '';
  }
}

/** ニックネームを覚える。 32 文字を超える場合は trim + 切り詰めで保存する
 *  (サーバ側の制限 32 文字に揃える)。 */
export function persistNickname(name: string): void {
  try {
    const trimmed = name.trim().slice(0, 32);
    if (trimmed.length === 0) {
      localStorage.removeItem(NICKNAME_KEY);
    } else {
      localStorage.setItem(NICKNAME_KEY, trimmed);
    }
  } catch {
    // localStorage 不可環境 (private mode 等) では諦める。次回はデフォルト値。
  }
}

/** 自分のレコード ID をローカルに覚えておく。リーダーボードで「あなた」マークを
 *  付けるため。 daily_date ごとに別キー。 */
function localIdsKey(dailyDate: string): string {
  return `puyo.dailyIds.${dailyDate}`;
}

export function rememberMyDailyId(dailyDate: string, id: string): void {
  try {
    const raw = localStorage.getItem(localIdsKey(dailyDate));
    const list: string[] = raw ? JSON.parse(raw) : [];
    if (!list.includes(id)) list.push(id);
    // 同じ日に何度も投げるユーザもいるので保存上限は緩めに 50 件。
    while (list.length > 50) list.shift();
    localStorage.setItem(localIdsKey(dailyDate), JSON.stringify(list));
  } catch {
    // ignore
  }
}

export function readMyDailyIds(dailyDate: string): readonly string[] {
  try {
    const raw = localStorage.getItem(localIdsKey(dailyDate));
    if (!raw) return [];
    const list = JSON.parse(raw);
    return Array.isArray(list) ? list.filter((s): s is string => typeof s === 'string') : [];
  } catch {
    return [];
  }
}
