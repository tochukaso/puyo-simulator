import type { MatchRecord } from '../match/records';

// `worker/index.ts` が公開する `/api/scores` エンドポイントへのクライアント側
// ラッパー。同オリジンに deploy されている前提で、相対パスで叩く。
//
// 設計メモ:
// - サーバ側で id / createdAt / build_sha は発番するので payload からは除外。
// - 失敗時は throw して上位 (UI レイヤ) に degrade させる。レスポンスの error
//   フィールドはあれば throw メッセージに乗せる。

export interface ServerSaveResponse {
  id: string;
  createdAt: string;
}

export type SaveScorePayload = Omit<
  MatchRecord,
  'id' | 'createdAt' | 'buildSha'
> & {
  /** クライアントのビルド SHA を併送 (将来の互換性チェック用)。 */
  buildSha?: string;
};

async function readErrorReason(res: Response): Promise<string> {
  try {
    const data = await res.json();
    if (data && typeof data === 'object' && 'reason' in data) {
      return String((data as { reason?: unknown }).reason ?? '');
    }
  } catch {
    // ignore
  }
  return res.statusText || '';
}

export async function postScoreToServer(
  payload: SaveScorePayload,
): Promise<ServerSaveResponse> {
  const res = await fetch('/api/scores', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    throw new Error(
      `score upload failed (${res.status}): ${await readErrorReason(res)}`,
    );
  }
  return (await res.json()) as ServerSaveResponse;
}

export async function getScoreFromServer(id: string): Promise<MatchRecord> {
  const res = await fetch(`/api/scores/${encodeURIComponent(id)}`);
  if (!res.ok) {
    throw new Error(
      `score fetch failed (${res.status}): ${await readErrorReason(res)}`,
    );
  }
  return (await res.json()) as MatchRecord;
}

/** 共有 URL に乗せる query 名。`?score=<id>` でサーバから取得する。 */
export const SCORE_PARAM = 'score';

export function buildServerScoreUrl(id: string): string {
  const url = new URL(window.location.href);
  const out = new URL(url.origin + url.pathname);
  out.searchParams.set(SCORE_PARAM, id);
  return out.toString();
}
