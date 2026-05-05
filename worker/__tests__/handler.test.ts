import { describe, it, expect } from 'vitest';
import worker from '../index';

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
}

function makeFakeDb(opts: {
  insertedRows: FakeRow[];
  preloaded?: FakeRow;
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
    const payload = {
      mode: 'score',
      turnLimit: 50,
      preset: '',
      seed: 42,
      playerScore: 1234,
      aiScore: 0,
      winner: 'player',
      playerMoves: [{ axisCol: 0, rotation: 0 }],
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
    expect(inserted[0]!.player_score).toBe(1234);
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
