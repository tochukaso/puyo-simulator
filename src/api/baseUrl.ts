import { isTauri } from '../ai/native-ama/tauri-bridge';

// Tauri (Android アプリ) ビルドでは `fetch('/api/...')` の相対 URL が
// `tauri://localhost/api/...` を指してしまい、 APK 内のバンドルアセットを
// 探しに行って 404 になる。 公開 Cloudflare Workers エンドポイントを
// 明示的に叩く必要があるので、 Tauri 環境でだけ絶対 URL に切り替える。
//
// Web ビルドでは従来どおり同一オリジン (= Cloudflare Workers が
// run_worker_first で /api/* を捕まえる構成) なので相対パスで OK。
//
// 公開リポジトリなので URL の hardcode は問題なし (production の Worker は
// 誰が叩いても良いし、 改造防止はサーバ側 simulateAndValidate が見る)。
const PROD_ORIGIN = 'https://puyo.tochukaso.blog';

/** API 呼び出しの origin。 Tauri は production URL、 web は same-origin。 */
export function apiOrigin(): string {
  if (isTauri()) return PROD_ORIGIN;
  // SSR / vitest 環境 (window 不在) の保険。 通常 web では window.location.origin。
  return typeof window !== 'undefined' ? window.location.origin : '';
}

/** 与えられたパスを絶対 URL に解決する。 path は `/api/...` 想定。 */
export function apiUrl(path: string): string {
  const origin = apiOrigin();
  if (!origin) return path;
  return `${origin}${path}`;
}

/** Response.body から `{ reason: ... }` を取り出す。 worker 側 publicBadRequest
 *  のレスポンス形に合わせてあるので、 取得できなければ statusText に fall back。 */
async function readErrorReason(res: Response): Promise<string> {
  try {
    const data = await res.json();
    if (data && typeof data === 'object' && 'reason' in data) {
      return String((data as { reason?: unknown }).reason ?? '');
    }
  } catch {
    // body が JSON でない / 既に消費済み — ignore して statusText を使う。
  }
  return res.statusText || '';
}

/** API 呼び出しの共通ラッパー。 fetch → ok チェック → JSON パースを 1 行に
 *  まとめ、 エラー時はサーバ側 reason を抽出して message に乗せる。 */
export async function fetchJson<T>(
  url: string,
  init: RequestInit | undefined,
  errorPrefix: string,
): Promise<T> {
  const res = await fetch(url, init);
  if (!res.ok) {
    const reason = await readErrorReason(res);
    throw new Error(
      reason ? `${errorPrefix} (${res.status}): ${reason}` : `${errorPrefix} (${res.status})`,
    );
  }
  return (await res.json()) as T;
}
