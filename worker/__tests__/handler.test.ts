import { afterAll, beforeAll, describe, it, expect, vi } from 'vitest';
import worker from '../index';
import { createInitialState, spawnNext } from '../../src/game/state';
import { lockActive } from '../../src/game/landing';
import { resolveChain } from '../../src/game/chain';
import type { Move } from '../../src/game/types';

// クライアント側と同じ手順でスコアを再現するヘルパー (validation テストに必要)。
function simulateClientSide(
  seed: number,
  moves: ReadonlyArray<Move>,
  turnLimit: number,
): number {
  const limit = turnLimit <= 0 ? Infinity : turnLimit;
  let state = createInitialState(seed);
  for (let i = 0; i < moves.length; i++) {
    if (!state.current) break;
    const move = moves[i]!;
    const placed = {
      ...state.current,
      axisCol: move.axisCol,
      rotation: move.rotation,
    };
    const locked = lockActive(state.field, placed);
    const { finalField, steps, totalScore } = resolveChain(locked);
    const resolved = {
      ...state,
      field: finalField,
      current: null,
      score: state.score + totalScore,
      chainCount: steps.length,
      totalChains: state.totalChains + steps.length,
      maxChain: Math.max(state.maxChain, steps.length),
      status: 'resolving' as const,
    };
    const atLimit = i + 1 >= limit;
    state = atLimit ? resolved : spawnNext(resolved);
  }
  return state.score;
}

// Worker のフェッチハンドラを vitest だけで直接叩く小さな統合テスト。
// 本物の D1 (`miniflare` 経由) を立てる代わりに、必要最低限の prepare/bind
// チェーンをモックしてユーザー入力 / レスポンス整形を検証する。
//
// D1 の動作確認は本番デプロイ時の smoke test (curl) に任せる。

interface FakeRow {
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

interface LeaderboardFakeRow {
  id: string;
  created_at: string;
  player_name: string | null;
  player_score: number;
}

function makeFakeDb(opts: {
  insertedRows: FakeRow[];
  preloaded?: FakeRow;
  leaderboard?: LeaderboardFakeRow[];
}): D1Database {
  const stmt = (sql: string) => {
    const bound: unknown[] = [];
    return {
      bind(...vals: unknown[]) {
        bound.push(...vals);
        return this;
      },
      async run() {
        // INSERT で受け取ったパラメータから FakeRow を組み立てて in-memory に push。
        // 0001_init / 0002_daily で 12 → 14 列に増えたので、末尾 2 つは nullable。
        if (sql.startsWith('INSERT')) {
          opts.insertedRows.push({
            id: bound[0] as string,
            created_at: bound[1] as string,
            build_sha: bound[2] as string | null,
            mode: bound[3] as string,
            turn_limit: bound[4] as number,
            preset: bound[5] as string | null,
            seed: bound[6] as number,
            player_score: bound[7] as number,
            ai_score: bound[8] as number,
            winner: bound[9] as string,
            player_moves: bound[10] as string,
            ai_moves: bound[11] as string,
            daily_date: (bound[12] as string | null) ?? null,
            player_name: (bound[13] as string | null) ?? null,
          });
        }
        return { success: true } as unknown;
      },
      async first<T>(): Promise<T | null> {
        if (sql.includes('SELECT') && opts.preloaded) {
          return opts.preloaded as unknown as T;
        }
        return null;
      },
      async all<T>(): Promise<{ results: T[]; success: boolean }> {
        // GET /api/daily/leaderboard 用の SELECT。 preset した leaderboard を
        // そのまま返す (テストでは並び替えやフィルタ責務はチェックしない)。
        return {
          results: ((opts.leaderboard ?? []) as unknown) as T[],
          success: true,
        };
      },
    };
  };
  return { prepare: stmt } as unknown as D1Database;
}

const fakeAssets: Fetcher = {
  async fetch(): Promise<Response> {
    return new Response('static', { status: 200 });
  },
} as unknown as Fetcher;

describe('worker /api/scores', () => {
  it('rejects malformed POST bodies with 400', async () => {
    const inserted: FakeRow[] = [];
    const env = { DB: makeFakeDb({ insertedRows: inserted }), ASSETS: fakeAssets };
    const res = await worker.fetch(
      new Request('http://localhost/api/scores', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: '{"seed":"not a number"}',
      }),
      env,
    );
    expect(res.status).toBe(400);
    expect(inserted.length).toBe(0);
  });

  it('accepts a valid POST and returns a server-issued id', async () => {
    const inserted: FakeRow[] = [];
    const env = { DB: makeFakeDb({ insertedRows: inserted }), ASSETS: fakeAssets };
    const seed = 42;
    const playerMoves: Move[] = [{ axisCol: 0, rotation: 0 }];
    // サーバ側 validateMoves が再シミュレートしてスコア検証するので、
    // payload には実際にシミュレートで得られる score をセットする必要がある。
    const trueScore = simulateClientSide(seed, playerMoves, 50);
    const payload = {
      mode: 'score',
      turnLimit: 50,
      preset: '',
      seed,
      playerScore: trueScore,
      aiScore: 0,
      winner: 'player',
      playerMoves,
      aiMoves: [],
    };
    const res = await worker.fetch(
      new Request('http://localhost/api/scores', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(payload),
      }),
      env,
    );
    expect(res.status).toBe(201);
    const body = (await res.json()) as { id: string; createdAt: string };
    expect(body.id).toBeTruthy();
    expect(body.createdAt).toBeTruthy();
    expect(inserted.length).toBe(1);
    expect(inserted[0]!.player_score).toBe(trueScore);
  });

  it('rejects a tampered score (server-side replay catches mismatch)', async () => {
    const inserted: FakeRow[] = [];
    const env = { DB: makeFakeDb({ insertedRows: inserted }), ASSETS: fakeAssets };
    const seed = 42;
    const playerMoves: Move[] = [{ axisCol: 0, rotation: 0 }];
    const trueScore = simulateClientSide(seed, playerMoves, 50);
    const payload = {
      mode: 'score',
      turnLimit: 50,
      preset: '',
      seed,
      // 真のスコアに +999999 を足した「改造データ」。サーバの再シミュレートと
      // 食い違うので 400 で弾かれる。
      playerScore: trueScore + 999999,
      aiScore: 0,
      winner: 'player',
      playerMoves,
      aiMoves: [],
    };
    const res = await worker.fetch(
      new Request('http://localhost/api/scores', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(payload),
      }),
      env,
    );
    expect(res.status).toBe(400);
    expect(inserted.length).toBe(0);
    const body = (await res.json()) as { error: string; reason: string };
    expect(body.reason).toMatch(/validation failed: score mismatch/);
  });

  it('rejects out-of-range moves', async () => {
    const inserted: FakeRow[] = [];
    const env = { DB: makeFakeDb({ insertedRows: inserted }), ASSETS: fakeAssets };
    const payload = {
      mode: 'score',
      turnLimit: 50,
      seed: 42,
      playerScore: 0,
      aiScore: 0,
      winner: 'player',
      playerMoves: [{ axisCol: 99, rotation: 0 }],
      aiMoves: [],
    };
    const res = await worker.fetch(
      new Request('http://localhost/api/scores', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(payload),
      }),
      env,
    );
    expect(res.status).toBe(400);
  });

  it('GET /api/scores/:id returns the row when present', async () => {
    const env = {
      DB: makeFakeDb({
        insertedRows: [],
        preloaded: {
          id: 'abc',
          created_at: '2026-05-05T00:00:00Z',
          build_sha: 'abcdef',
          mode: 'score',
          turn_limit: 50,
          preset: '',
          seed: 42,
          player_score: 100,
          ai_score: 0,
          winner: 'player',
          player_moves: '[{"axisCol":0,"rotation":0}]',
          ai_moves: '[]',
          daily_date: null,
          player_name: null,
        },
      }),
      ASSETS: fakeAssets,
    };
    const res = await worker.fetch(
      new Request('http://localhost/api/scores/abc'),
      env,
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as Record<string, unknown>;
    expect(body.id).toBe('abc');
    expect(body.playerMoves).toEqual([{ axisCol: 0, rotation: 0 }]);
  });

  it('non-API path falls through to ASSETS binding', async () => {
    const env = {
      DB: makeFakeDb({ insertedRows: [] }),
      ASSETS: fakeAssets,
    };
    const res = await worker.fetch(
      new Request('http://localhost/index.html'),
      env,
    );
    expect(res.status).toBe(200);
    expect(await res.text()).toBe('static');
  });

  it('unknown /api path returns 404 (not the SPA index)', async () => {
    const env = {
      DB: makeFakeDb({ insertedRows: [] }),
      ASSETS: fakeAssets,
    };
    const res = await worker.fetch(
      new Request('http://localhost/api/unknown'),
      env,
    );
    expect(res.status).toBe(404);
  });
});

describe('worker daily mode', () => {
  // 「今日 (JST)」を 2026-05-06 に固定する。 worker/index.ts の daily 検証は
  // dailyDate === todayDateJst() を要求するので、 テスト中の Date.now が動くと
  // 試験結果が不安定になる。
  beforeAll(() => {
    // 2026-05-06 12:00 UTC = 2026-05-06 21:00 JST (= todayDateJst が "2026-05-06").
    vi.useFakeTimers();
    vi.setSystemTime(new Date(Date.UTC(2026, 4, 6, 12, 0, 0)));
  });
  afterAll(() => {
    vi.useRealTimers();
  });

  it('rejects daily POST without dailyDate', async () => {
    const inserted: FakeRow[] = [];
    const env = { DB: makeFakeDb({ insertedRows: inserted }), ASSETS: fakeAssets };
    const payload = {
      mode: 'daily',
      turnLimit: 50,
      seed: 12345,
      playerScore: 0,
      aiScore: 0,
      winner: 'player',
      playerMoves: [],
      aiMoves: [],
    };
    const res = await worker.fetch(
      new Request('http://localhost/api/scores', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(payload),
      }),
      env,
    );
    expect(res.status).toBe(400);
    expect(inserted.length).toBe(0);
    const body = (await res.json()) as { reason: string };
    expect(body.reason).toMatch(/dailyDate/);
  });

  it('rejects daily POST when dailyDate is not today (JST)', async () => {
    const inserted: FakeRow[] = [];
    const env = { DB: makeFakeDb({ insertedRows: inserted }), ASSETS: fakeAssets };
    // 1 日前の日付で、 (一致するはずの) 正しい seed を載せても拒否されるか。
    const { dailySeedFor } = await import('../../src/game/dailySeed');
    const yesterday = '2026-05-05';
    const seed = dailySeedFor(yesterday);
    const payload = {
      mode: 'daily',
      turnLimit: 50,
      seed,
      playerScore: 0,
      aiScore: 0,
      winner: 'player',
      playerMoves: [],
      aiMoves: [],
      dailyDate: yesterday,
    };
    const res = await worker.fetch(
      new Request('http://localhost/api/scores', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(payload),
      }),
      env,
    );
    expect(res.status).toBe(400);
    expect(inserted.length).toBe(0);
    const body = (await res.json()) as { reason: string };
    expect(body.reason).toMatch(/dailyDate must match today/);
  });

  it('rejects daily POST when seed does not match the date', async () => {
    const inserted: FakeRow[] = [];
    const env = { DB: makeFakeDb({ insertedRows: inserted }), ASSETS: fakeAssets };
    const payload = {
      mode: 'daily',
      turnLimit: 50,
      seed: 99999, // 適当な seed (日付ハッシュとは合わない)
      playerScore: 0,
      aiScore: 0,
      winner: 'player',
      playerMoves: [],
      aiMoves: [],
      dailyDate: '2026-05-06',
    };
    const res = await worker.fetch(
      new Request('http://localhost/api/scores', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(payload),
      }),
      env,
    );
    expect(res.status).toBe(400);
    expect(inserted.length).toBe(0);
    const body = (await res.json()) as { reason: string };
    expect(body.reason).toMatch(/daily seed mismatch/);
  });

  it('rejects daily POST with non-50 turnLimit', async () => {
    const inserted: FakeRow[] = [];
    const env = { DB: makeFakeDb({ insertedRows: inserted }), ASSETS: fakeAssets };
    // 正しい seed を取らないと先にそっちで弾かれるので、 dailySeedFor を直接使う。
    const { dailySeedFor } = await import('../../src/game/dailySeed');
    const seed = dailySeedFor('2026-05-06');
    const payload = {
      mode: 'daily',
      turnLimit: 30, // not 50
      seed,
      playerScore: 0,
      aiScore: 0,
      winner: 'player',
      playerMoves: [],
      aiMoves: [],
      dailyDate: '2026-05-06',
    };
    const res = await worker.fetch(
      new Request('http://localhost/api/scores', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(payload),
      }),
      env,
    );
    expect(res.status).toBe(400);
    expect(inserted.length).toBe(0);
  });

  it('GET /api/daily/leaderboard returns ranked entries', async () => {
    const env = {
      DB: makeFakeDb({
        insertedRows: [],
        leaderboard: [
          {
            id: 'a1',
            created_at: '2026-05-06T01:00:00Z',
            player_name: 'alice',
            player_score: 5000,
          },
          {
            id: 'b2',
            created_at: '2026-05-06T02:00:00Z',
            player_name: null,
            player_score: 3000,
          },
        ],
      }),
      ASSETS: fakeAssets,
    };
    const res = await worker.fetch(
      new Request(
        'http://localhost/api/daily/leaderboard?date=2026-05-06&limit=5',
      ),
      env,
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      date: string;
      entries: { id: string; rank: number; playerName: string | null; playerScore: number }[];
    };
    expect(body.date).toBe('2026-05-06');
    expect(body.entries).toHaveLength(2);
    expect(body.entries[0]).toMatchObject({ id: 'a1', rank: 1, playerScore: 5000 });
    expect(body.entries[1]).toMatchObject({ id: 'b2', rank: 2, playerScore: 3000 });
  });

  it('GET /api/daily/leaderboard rejects invalid date', async () => {
    const env = {
      DB: makeFakeDb({ insertedRows: [] }),
      ASSETS: fakeAssets,
    };
    const res = await worker.fetch(
      new Request('http://localhost/api/daily/leaderboard?date=not-a-date'),
      env,
    );
    expect(res.status).toBe(400);
  });
});
