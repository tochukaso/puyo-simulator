// Daily モードの進行状態を localStorage に永続化する。
//
// 目的: ユーザがデイリーをプレイして終了 → ページをリロード or タブを閉じる
// → 戻ってきたときに「サーバ送信前の終了済みスコア」が消えないようにする。
// 以前は matchSeed / currentDailyDate / matchPlayerMoves が in-memory のみで、
// reload のたびに startDaily() が走って fresh state に上書きされ、ユーザが
// リーダーボードに登録する機会を失っていた。
//
// 保存するのは「再シミュレートに必要な最小限」だけ:
//   - dailyDate: どの日のチャレンジか (今日と一致するときのみ復元)
//   - matchSeed: dailySeedFor(dailyDate) と等しい想定だが、整合検証用に持つ
//   - matchPlayerMoves: 手列。 これと seed があれば simulateRecordSide で
//     game / playerHistory / matchEnded / matchResult をすべて復元できる。
//
// 永続化タイミング:
//   - 各 commit 後 (= 進行中も保存)
//   - finalizeMatchIfDone で matchEnded=true になったとき
// クリアタイミング:
//   - サーバ送信成功後 (リーダーボードに残ったので localStorage に置く理由なし)
//   - startDaily で別日が来たとき (古い日のデータは引きずらない)

const KEY = 'puyo.daily.progress';

export interface DailyProgressSnapshot {
  /** YYYY-MM-DD (JST)。 復元時に今日と一致するかチェックする。 */
  dailyDate: string;
  /** dailySeedFor(dailyDate) の値。 */
  matchSeed: number;
  /** 投了した手順。 0..50 の長さ。 */
  matchPlayerMoves: ReadonlyArray<{ axisCol: number; rotation: number }>;
}

export function saveDailyProgress(snap: DailyProgressSnapshot): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(snap));
  } catch {
    // localStorage 不可 (private mode 等) では諦める。 reload 後は startDaily
    // にフォールバックする現行挙動と同じになるだけ。
  }
}

export function loadDailyProgress(): DailyProgressSnapshot | null {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return null;
    const parsed: unknown = JSON.parse(raw);
    if (!isValidSnap(parsed)) return null;
    return parsed;
  } catch {
    return null;
  }
}

export function clearDailyProgress(): void {
  try {
    localStorage.removeItem(KEY);
  } catch {
    // ignore
  }
}

function isValidSnap(x: unknown): x is DailyProgressSnapshot {
  if (typeof x !== 'object' || x === null) return false;
  const o = x as Record<string, unknown>;
  if (typeof o.dailyDate !== 'string') return false;
  if (typeof o.matchSeed !== 'number') return false;
  if (!Array.isArray(o.matchPlayerMoves)) return false;
  for (const m of o.matchPlayerMoves) {
    if (typeof m !== 'object' || m === null) return false;
    const mm = m as Record<string, unknown>;
    if (typeof mm.axisCol !== 'number' || typeof mm.rotation !== 'number') {
      return false;
    }
  }
  return true;
}
