import type { MatchRecord } from '../match/records';
import { apiUrl, fetchJson } from './baseUrl';

// `worker/index.ts` が公開する `/api/scores` エンドポイントへのクライアント側
// ラッパー。 web 版は同オリジン (= 相対パス) で叩き、 Tauri (Android アプリ)
// 版は apiUrl() が公開 Cloudflare Workers URL に切り替える。
//
// 設計メモ:
// - サーバ側で id / createdAt / build_sha は発番するので payload からは除外。
// - 失敗時は throw して上位 (UI レイヤ) に degrade させる。 fetchJson が
//   サーバ side reason を message に乗せるので、 ここでは prefix だけ与える。

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

export async function postScoreToServer(
  payload: SaveScorePayload,
): Promise<ServerSaveResponse> {
  return fetchJson<ServerSaveResponse>(
    apiUrl('/api/scores'),
    {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(payload),
    },
    'score upload failed',
  );
}

export async function getScoreFromServer(id: string): Promise<MatchRecord> {
  return fetchJson<MatchRecord>(
    apiUrl(`/api/scores/${encodeURIComponent(id)}`),
    undefined,
    'score fetch failed',
  );
}

/** 共有 URL に乗せる query 名。`?score=<id>` でサーバから取得する。 */
export const SCORE_PARAM = 'score';

export function buildServerScoreUrl(id: string): string {
  const url = new URL(window.location.href);
  const out = new URL(url.origin + url.pathname);
  out.searchParams.set(SCORE_PARAM, id);
  return out.toString();
}
