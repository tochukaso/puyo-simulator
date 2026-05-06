// Cloudflare Worker entrypoint.
// 静的アセットへのリクエストはそのまま `env.ASSETS.fetch` に流し、
// `/api/scores` 配下だけを D1 (env.DB) で処理する。
//
// 依存: wrangler.jsonc に `main` と `d1_databases[ {binding="DB"} ]` バインドが必要。

import { simulateAndValidate } from './validateMoves';
import { dailySeedFor, isValidDailyDate, todayDateJst } from '../src/game/dailySeed';

interface Env {
  ASSETS: Fetcher;
  DB: D1Database;
}

// クライアントから送られてくるレコード形 (id / createdAt / buildSha は
// サーバ側で発番するので除外)。MatchRecord と一致させてあるが、依存解放のため
// ここでは独立に持つ (Worker は src/* を bundle に含めない構成のほうが安全)。
interface ClientRecordPayload {
  mode?: 'match' | 'score' | 'daily';
  turnLimit: number;
  preset?: string;
  seed: number;
  playerScore: number;
  aiScore: number;
  winner: 'player' | 'ai' | 'draw';
  playerMoves: { axisCol: number; rotation: number }[];
  aiMoves: { axisCol: number; rotation: number }[];
  /** 'daily' モードでのみ意味を持つ。YYYY-MM-DD (JST) で、その日のチャレンジ。 */
  dailyDate?: string;
  /** デイリーリーダーボードに表示するニックネーム。20 文字までに丸める。 */
  playerName?: string;
}

/** デイリーモードの固定ターン数。仕様で 50 手固定 (50 ぷよ)。 */
const DAILY_TURN_LIMIT = 50;
/** リーダーボードに表示する上限。多すぎると初期ロードが重く、少なすぎると
 *  ランキングとして物足りない。20 で運用してフィードバックで調整する。 */
const DEFAULT_LEADERBOARD_LIMIT = 20;
/** リーダーボードのカーソル最大値。意図しない大量取得 (DB 負荷) を防ぐ。 */
const MAX_LEADERBOARD_LIMIT = 100;

// ボディサイズ上限。200 手 + meta で軽く収まる前提で、想定外の大きな payload
// (アタッカー or バグ) を弾くため小さめに切る。
const MAX_BODY_BYTES = 64 * 1024;

const JSON_HEADERS = {
  'content-type': 'application/json; charset=utf-8',
  // クロスオリジンからの読み込みは想定していないが、誤って踏まれても害が
  // 出ないよう同オリジンに限定する (Cloudflare Workers はデフォで CORS なし)。
};

function jsonResponse(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), { status, headers: JSON_HEADERS });
}

function notFound(): Response {
  return jsonResponse({ error: 'not_found' }, 404);
}

function badRequest(reason: string): Response {
  return jsonResponse({ error: 'bad_request', reason }, 400);
}

// クライアント発番でなくサーバ発番にするのは、クライアント時計のスキューや
// 衝突攻撃 (同じ id で上書き) を避けるため。タイムスタンプ + ランダム接尾辞。
function generateId(): string {
  const t = Date.now().toString(36);
  const r = crypto.getRandomValues(new Uint8Array(6));
  let suffix = '';
  for (const b of r) suffix += b.toString(16).padStart(2, '0');
  return `${t}-${suffix}`;
}

function isValidMove(m: unknown): m is { axisCol: number; rotation: number } {
  if (typeof m !== 'object' || m === null) return false;
  const mo = m as { axisCol?: unknown; rotation?: unknown };
  return (
    typeof mo.axisCol === 'number' &&
    Number.isInteger(mo.axisCol) &&
    mo.axisCol >= 0 &&
    mo.axisCol <= 5 &&
    typeof mo.rotation === 'number' &&
    Number.isInteger(mo.rotation) &&
    mo.rotation >= 0 &&
    mo.rotation <= 3
  );
}

function validatePayload(body: unknown): ClientRecordPayload | string {
  if (typeof body !== 'object' || body === null) return 'body is not an object';
  const p = body as Record<string, unknown>;
  // mode: optional; 'match' / 'score' / 'daily' のいずれか。
  if (
    p.mode !== undefined &&
    p.mode !== 'match' &&
    p.mode !== 'score' &&
    p.mode !== 'daily'
  )
    return 'invalid mode';
  // turnLimit: 0 (unlimited) または正の整数。
  if (
    typeof p.turnLimit !== 'number' ||
    !Number.isInteger(p.turnLimit) ||
    p.turnLimit < 0 ||
    p.turnLimit > 10000
  )
    return 'invalid turnLimit';
  if (typeof p.seed !== 'number' || !Number.isInteger(p.seed))
    return 'invalid seed';
  if (typeof p.playerScore !== 'number' || p.playerScore < 0)
    return 'invalid playerScore';
  if (typeof p.aiScore !== 'number' || p.aiScore < 0)
    return 'invalid aiScore';
  if (p.winner !== 'player' && p.winner !== 'ai' && p.winner !== 'draw')
    return 'invalid winner';
  if (!Array.isArray(p.playerMoves) || !p.playerMoves.every(isValidMove))
    return 'invalid playerMoves';
  if (!Array.isArray(p.aiMoves) || !p.aiMoves.every(isValidMove))
    return 'invalid aiMoves';
  if (p.playerMoves.length > 1000 || p.aiMoves.length > 1000)
    return 'too many moves';
  if (p.preset !== undefined && typeof p.preset !== 'string')
    return 'invalid preset';
  // dailyDate / playerName: optional。書式 / 長さだけチェックして以降は
  // バックエンド側でもう一段絞り込む (mode === 'daily' なら必須等)。
  if (p.dailyDate !== undefined && !isValidDailyDate(p.dailyDate))
    return 'invalid dailyDate';
  if (p.playerName !== undefined) {
    if (typeof p.playerName !== 'string') return 'invalid playerName';
    if (p.playerName.length > 32) return 'playerName too long';
  }
  return {
    mode: (p.mode as 'match' | 'score' | 'daily' | undefined) ?? 'match',
    turnLimit: p.turnLimit,
    preset: (p.preset as string) ?? '',
    seed: p.seed,
    playerScore: p.playerScore,
    aiScore: p.aiScore,
    winner: p.winner as 'player' | 'ai' | 'draw',
    playerMoves: p.playerMoves as { axisCol: number; rotation: number }[],
    aiMoves: p.aiMoves as { axisCol: number; rotation: number }[],
    dailyDate: p.dailyDate as string | undefined,
    playerName: p.playerName as string | undefined,
  };
}

async function readBodyJson(request: Request): Promise<unknown | string> {
  const contentLengthHeader = request.headers.get('content-length');
  if (contentLengthHeader) {
    const len = Number(contentLengthHeader);
    if (Number.isFinite(len) && len > MAX_BODY_BYTES) return 'body too large';
  }
  const text = await request.text();
  if (text.length > MAX_BODY_BYTES) return 'body too large';
  try {
    return JSON.parse(text);
  } catch {
    return 'invalid json';
  }
}

async function saveScore(request: Request, env: Env): Promise<Response> {
  const parsed = await readBodyJson(request);
  if (typeof parsed === 'string') return badRequest(parsed);
  const validated = validatePayload(parsed);
  if (typeof validated === 'string') return badRequest(validated);

  // デイリーモード固有の追加検証。
  // (1) dailyDate は必須 (どの日のチャレンジか書かれていないと leaderboard に
  //     並べられない)。 (2) dailyDate がサーバ側から見た「今日 (JST)」と一致
  // するか。 過去や未来の日付で送ってこられると leaderboard が汚れるので拒否
  // する (PR #53 CodeRabbit 指摘)。 (3) seed が dailySeedFor(dailyDate) と
  // 一致するか。 一致しなければ「自分で seed を選んで楽な譜面を回した」可能性
  // があるので弾く。 (4) turnLimit は仕様で 50 固定。 50 以外は不正。
  if (validated.mode === 'daily') {
    if (!validated.dailyDate) {
      return badRequest('daily mode requires dailyDate');
    }
    const today = todayDateJst();
    if (validated.dailyDate !== today) {
      // クライアントの時計ズレで境界跨ぎした際の救済として、 当日 ± 1 日まで
      // は許容する余地もあるが、 まずは厳密一致でリーダーボード整合性を優先。
      // 必要であれば後日 grace を入れる。
      return badRequest(
        `dailyDate must match today's JST date (server today=${today}, got=${validated.dailyDate})`,
      );
    }
    const expected = dailySeedFor(validated.dailyDate);
    if (validated.seed !== expected) {
      return badRequest(
        `daily seed mismatch: expected ${expected} for ${validated.dailyDate}, got ${validated.seed}`,
      );
    }
    if (validated.turnLimit !== DAILY_TURN_LIMIT) {
      return badRequest(`daily turnLimit must be ${DAILY_TURN_LIMIT}`);
    }
  }

  // 改造防止: 受け取った seed + playerMoves をサーバ側で再シミュレートして、
  // 連鎖判定 / 配置可能性 / 最終スコアが一致するか検証する。一致しなければ
  // 400 で弾いて DB に書かない。これで「クライアントから直接 fetch して
  // でっちあげのスコアを送る」攻撃を防げる。
  // 型: rotation は validatePayload で 0..3 にレンジチェック済みなので
  // 安全に Move (= rotation: Rotation) として cast する。
  const sim = simulateAndValidate({
    seed: validated.seed,
    moves: validated.playerMoves as readonly { axisCol: number; rotation: 0 | 1 | 2 | 3 }[],
    claimedScore: validated.playerScore,
    turnLimit: validated.turnLimit,
  });
  if (!sim.ok) {
    return badRequest(`validation failed: ${sim.reason}`);
  }

  const id = generateId();
  const createdAt = new Date().toISOString();
  // build_sha はクライアント側のビルドを記録しておくと、将来「特定ビルドで
  // 計算ロジックが違う」場合に弾きやすい。クライアントが付けてこないことも
  // あるので optional 扱い。
  const buildSha =
    typeof (parsed as { buildSha?: unknown }).buildSha === 'string'
      ? ((parsed as { buildSha?: string }).buildSha ?? null)
      : null;

  // playerName は前後空白除去 + 0 文字 (= 名無し) 許容。leaderboard で表示する
  // ときは null/空 → "Anonymous" にフォールバック。
  const playerName =
    typeof validated.playerName === 'string'
      ? validated.playerName.trim().slice(0, 32) || null
      : null;
  const dailyDate = validated.mode === 'daily' ? (validated.dailyDate ?? null) : null;

  await env.DB.prepare(
    `INSERT INTO score_records
      (id, created_at, build_sha, mode, turn_limit, preset, seed,
       player_score, ai_score, winner, player_moves, ai_moves,
       daily_date, player_name)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  )
    .bind(
      id,
      createdAt,
      buildSha,
      validated.mode,
      validated.turnLimit,
      validated.preset ?? '',
      validated.seed,
      validated.playerScore,
      validated.aiScore,
      validated.winner,
      JSON.stringify(validated.playerMoves),
      JSON.stringify(validated.aiMoves),
      dailyDate,
      playerName,
    )
    .run();

  return jsonResponse({ id, createdAt }, 201);
}

interface DbRow {
  id: string;
  created_at: string;
  build_sha: string | null;
  mode: string;
  turn_limit: number;
  preset: string | null;
  seed: number;
  player_score: number;
  ai_score: number;
  winner: string;
  player_moves: string;
  ai_moves: string;
  daily_date: string | null;
  player_name: string | null;
}

function safeParseMoves(raw: string, id: string, field: string): unknown {
  // 通常 INSERT 時に validatePayload 済みの JSON 文字列が入るが、手動編集や
  // スキーマ変更等で壊れた値が混入した場合に 500 を返してしまわないよう、
  // パース失敗は空配列にフォールバックして警告ログだけ残す。
  try {
    return JSON.parse(raw);
  } catch {
    console.warn(`malformed ${field} for record ${id}`);
    return [];
  }
}

function rowToRecord(row: DbRow): unknown {
  return {
    id: row.id,
    createdAt: row.created_at,
    buildSha: row.build_sha ?? '',
    mode: row.mode,
    turnLimit: row.turn_limit,
    preset: row.preset ?? '',
    seed: row.seed,
    playerScore: row.player_score,
    aiScore: row.ai_score,
    winner: row.winner,
    playerMoves: safeParseMoves(row.player_moves, row.id, 'player_moves'),
    aiMoves: safeParseMoves(row.ai_moves, row.id, 'ai_moves'),
    dailyDate: row.daily_date ?? null,
    playerName: row.player_name ?? null,
  };
}

async function getScore(env: Env, id: string): Promise<Response> {
  const row = await env.DB.prepare(
    `SELECT id, created_at, build_sha, mode, turn_limit, preset, seed,
            player_score, ai_score, winner, player_moves, ai_moves,
            daily_date, player_name
       FROM score_records WHERE id = ?`,
  )
    .bind(id)
    .first<DbRow>();
  if (!row) return notFound();
  return jsonResponse(rowToRecord(row));
}

interface LeaderboardRow {
  id: string;
  created_at: string;
  player_name: string | null;
  player_score: number;
}

interface LeaderboardEntry {
  id: string;
  createdAt: string;
  playerName: string | null;
  playerScore: number;
  rank: number;
}

// デイリーリーダーボード: ある日付の上位スコアだけを軽量に返す。
// (リプレイの手列まで返すと payload が大きくなりすぎるので、エントリは
//  id だけ持って、ユーザーが行をクリックしたら GET /api/scores/:id で
//  必要なときだけ完全なレコードを取りに行く構成にする。)
async function getDailyLeaderboard(
  env: Env,
  url: URL,
): Promise<Response> {
  const date = url.searchParams.get('date');
  if (!date || !isValidDailyDate(date)) {
    return badRequest('invalid or missing date (expected YYYY-MM-DD)');
  }
  // limit はデフォルト 20、上限 100。整数化失敗 / 範囲外はデフォルトに丸める。
  const rawLimit = url.searchParams.get('limit');
  let limit = DEFAULT_LEADERBOARD_LIMIT;
  if (rawLimit !== null) {
    const n = Number(rawLimit);
    if (Number.isInteger(n) && n >= 1 && n <= MAX_LEADERBOARD_LIMIT) {
      limit = n;
    }
  }
  // ORDER BY player_score DESC, created_at ASC でタイブレーク (= 同点なら早い人が上)。
  // idx_score_records_daily が (daily_date, player_score DESC) なので前段は使われ、
  // 後段の created_at は filesort になるが、limit が小さいので十分。
  const result = await env.DB.prepare(
    `SELECT id, created_at, player_name, player_score
       FROM score_records
      WHERE daily_date = ?
      ORDER BY player_score DESC, created_at ASC
      LIMIT ?`,
  )
    .bind(date, limit)
    .all<LeaderboardRow>();
  const rows = result.results ?? [];
  const entries: LeaderboardEntry[] = rows.map((r, i) => ({
    id: r.id,
    createdAt: r.created_at,
    playerName: r.player_name,
    playerScore: r.player_score,
    rank: i + 1,
  }));
  return jsonResponse({ date, limit, entries });
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);

    // POST /api/scores → save
    if (
      request.method === 'POST' &&
      url.pathname === '/api/scores'
    ) {
      return saveScore(request, env);
    }

    // GET /api/scores/:id → fetch
    const match = url.pathname.match(/^\/api\/scores\/([\w-]+)$/);
    if (request.method === 'GET' && match) {
      return getScore(env, match[1]!);
    }

    // GET /api/daily/leaderboard?date=YYYY-MM-DD → top scores for that day.
    // (POST はしない。デイリーレコードの新規保存は通常の POST /api/scores
    //  に mode='daily' + dailyDate を載せて投げる経路に統一している。)
    if (
      request.method === 'GET' &&
      url.pathname === '/api/daily/leaderboard'
    ) {
      return getDailyLeaderboard(env, url);
    }

    // /api/* に来たがハンドラ無しの場合は静的アセットに渡さず 404 を返す
    // (SPA フォールバック index.html が返ってしまうと debug が混乱するため)。
    if (url.pathname.startsWith('/api/')) {
      return notFound();
    }

    // 静的アセット (Vite ビルド成果物 or PWA index)。
    return env.ASSETS.fetch(request);
  },
};
