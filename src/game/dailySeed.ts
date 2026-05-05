// デイリーシード: 日付 (JST) から決定論的に seed を生成する。
//
// 設計上の前提:
//   - クライアント (PWA / Tauri) と Worker の両方から同じ関数を呼べるよう、
//     副作用なし・標準 API のみで完結させる (DOM / Node 固有 API 不可)。
//   - 「今日」は **JST (UTC+9)** で 00:00 切り替え。サーバ (UTC) でも
//     `todayDateJst()` を呼べば同じ日付文字列が返る。
//   - seed は同じ日付なら必ず同じ値を返す純粋関数。クライアントが送ってきた
//     seed を Worker 側で `dailySeedFor(dailyDate)` と一致するか検証することで、
//     「適当な seed + デイリー扱い」での leaderboard 汚染を防ぐ。
//
// なぜ FNV-1a:
//   - 標準ライブラリの hash 関数 (subtle.digest 等) は async で、Worker の
//     validate ホットパスで都度 await したくない。
//   - 用途は「日付 → 32bit int」の決定論的写像でしかなく、暗号強度は不要。
//   - 単純な算術なので V8 / Workers / Node でも同じ値になる (= 環境差なし)。

const FNV_OFFSET_32 = 2166136261;
const FNV_PRIME_32 = 16777619;

/** YYYY-MM-DD 形式の文字列 (JST 基準) を 31bit 正の整数 seed に写像する。
 *  正の値だけ返すのは、`createInitialState(seed)` 系が負値で動くか網羅して
 *  いない箇所があり、安全側に倒すため。 */
export function dailySeedFor(dateStr: string): number {
  // namespace を付けることで、将来 weekly/monthly などを増やしたときに
  // 衝突を避けられる ("daily/2026-05-06" は "weekly/2026-W19" と別ハッシュ)。
  const s = `daily/${dateStr}`;
  let hash = FNV_OFFSET_32;
  for (let i = 0; i < s.length; i++) {
    hash ^= s.charCodeAt(i);
    hash = Math.imul(hash, FNV_PRIME_32);
  }
  // 符号付き 32bit になりうるので、上位ビットを落として正の 31bit に揃える。
  return hash >>> 1;
}

/** 「今日 (JST)」の YYYY-MM-DD を返す。
 *  サーバ (UTC) で呼んでも、ブラウザ (任意 TZ) で呼んでも同じ結果になる。 */
export function todayDateJst(now: Date = new Date()): string {
  // JST は固定 +9 (DST なし)。 `now.getTime() + 9h` を UTC として読み出すと
  // JST の年月日が得られる。 toLocaleString('ja-JP', {timeZone:'Asia/Tokyo'})
  // でも同じだが、Workers の Intl は ICU データ次第で挙動が安定しないので
  // 算術で確定させる。
  const jstMs = now.getTime() + 9 * 60 * 60 * 1000;
  const d = new Date(jstMs);
  const y = d.getUTCFullYear();
  const m = (d.getUTCMonth() + 1).toString().padStart(2, '0');
  const day = d.getUTCDate().toString().padStart(2, '0');
  return `${y}-${m}-${day}`;
}

/** 「昨日 (JST)」の YYYY-MM-DD。リーダーボードで前日結果を見せるのに使う。 */
export function yesterdayDateJst(now: Date = new Date()): string {
  const yesterday = new Date(now.getTime() - 24 * 60 * 60 * 1000);
  return todayDateJst(yesterday);
}

/** 単純な書式チェック。Worker 側のクエリ受信で不正値を弾くのに使う。 */
export function isValidDailyDate(s: unknown): s is string {
  if (typeof s !== 'string') return false;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
  // パース可能 (= 実在する日付) かどうかも一応チェックしておく。
  // 例: "2026-02-30" は弾く。
  const [y, m, d] = s.split('-').map(Number);
  if (!y || !m || !d) return false;
  const dt = new Date(Date.UTC(y, m - 1, d));
  return (
    dt.getUTCFullYear() === y &&
    dt.getUTCMonth() === m - 1 &&
    dt.getUTCDate() === d
  );
}
