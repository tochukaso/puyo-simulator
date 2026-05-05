// Cloudflare Worker entrypoint.
// 静的アセットへのリクエストはそのまま `env.ASSETS.fetch` に流し、
// `/api/scores` 配下だけを D1 (env.DB) で処理する。
//
// 依存: wrangler.jsonc に `main` と `d1_databases[ {binding="DB"} ]` バインドが必要。

interface Env {
  ASSETS: Fetcher;
  DB: D1Database;
}

// クライアントから送られてくるレコード形 (id / createdAt / buildSha は
// サーバ側で発番するので除外)。MatchRecord と一致させてあるが、依存解放のため
// ここでは独立に持つ (Worker は src/* を bundle に含めない構成のほうが安全)。
interface ClientRecordPayload {
  mode?: 'match' | 'score';
  turnLimit: number;
  preset?: string;
  seed: number;
  playerScore: number;
  aiScore: number;
  winner: 'player' | 'ai' | 'draw';
  playerMoves: { axisCol: number; rotation: number }[];
  aiMoves: { axisCol: number; rotation: number }[];
}

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
  // mode: optional; 'match' か 'score' のいずれか。
  if (p.mode !== undefined && p.mode !== 'match' && p.mode !== 'score')
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
  return {
    mode: (p.mode as 'match' | 'score' | undefined) ?? 'match',
    turnLimit: p.turnLimit,
    preset: (p.preset as string) ?? '',
    seed: p.seed,
    playerScore: p.playerScore,
    aiScore: p.aiScore,
    winner: p.winner as 'player' | 'ai' | 'draw',
    playerMoves: p.playerMoves as { axisCol: number; rotation: number }[],
    aiMoves: p.aiMoves as { axisCol: number; rotation: number }[],
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

  const id = generateId();
  const createdAt = new Date().toISOString();
  // build_sha はクライアント側のビルドを記録しておくと、将来「特定ビルドで
  // 計算ロジックが違う」場合に弾きやすい。クライアントが付けてこないことも
  // あるので optional 扱い。
  const buildSha =
    typeof (parsed as { buildSha?: unknown }).buildSha === 'string'
      ? ((parsed as { buildSha?: string }).buildSha ?? null)
      : null;

  await env.DB.prepare(
    `INSERT INTO score_records
      (id, created_at, build_sha, mode, turn_limit, preset, seed,
       player_score, ai_score, winner, player_moves, ai_moves)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
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
    playerMoves: JSON.parse(row.player_moves),
    aiMoves: JSON.parse(row.ai_moves),
  };
}

async function getScore(env: Env, id: string): Promise<Response> {
  const row = await env.DB.prepare(
    `SELECT id, created_at, build_sha, mode, turn_limit, preset, seed,
            player_score, ai_score, winner, player_moves, ai_moves
       FROM score_records WHERE id = ?`,
  )
    .bind(id)
    .first<DbRow>();
  if (!row) return notFound();
  return jsonResponse(rowToRecord(row));
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

    // /api/* に来たがハンドラ無しの場合は静的アセットに渡さず 404 を返す
    // (SPA フォールバック index.html が返ってしまうと debug が混乱するため)。
    if (url.pathname.startsWith('/api/')) {
      return notFound();
    }

    // 静的アセット (Vite ビルド成果物 or PWA index)。
    return env.ASSETS.fetch(request);
  },
};
