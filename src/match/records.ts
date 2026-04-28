import type { Move } from '../game/types';

// マッチレコードの永続化。スキーマは将来のサーバー保存
// (`docs/TODO.md` 参照) と同形にしてあり、そのまま POST できる想定。
//
// 保存先: IndexedDB (DB=puyo-match, store=records, keyPath=id)。
// localStorage より大容量で、将来「盤面スナップショット込みのリプレイ」を
// 増量するときも逼迫しない。SSR / IndexedDB 非対応環境では各関数が
// no-op (空配列) になるよう書いてある。
export interface MatchRecord {
  /** クライアント発番。タイムスタンプ + ランダム接尾辞で一意化。 */
  id: string;
  /** 保存時刻 (ISO8601, UTC)。`createdAt` 降順での一覧表示に使う。 */
  createdAt: string;
  /** 同じ build SHA で動いていた事の証跡。`__BUILD_SHA__` をそのまま入れる。 */
  buildSha: string;
  /** マッチの規定手数。 */
  turnLimit: 100 | 200;
  /** マッチ中に有効だった ama-wasm preset (例: 'build' / 'gtr' / 'kaidan')。 */
  preset: string;
  /** ぷよ列の再現用に保存する RNG seed。 */
  seed: number;
  playerScore: number;
  aiScore: number;
  winner: 'player' | 'ai' | 'draw';
  /** プレイヤー側が各ターンに置いた手。手順順。 */
  playerMoves: Move[];
  /** ama 側が各ターンに置いた手。手順順。 */
  aiMoves: Move[];
}

const DB_NAME = 'puyo-match';
const DB_VERSION = 1;
const STORE = 'records';

function hasIndexedDb(): boolean {
  return typeof indexedDB !== 'undefined';
}

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE)) {
        const store = db.createObjectStore(STORE, { keyPath: 'id' });
        store.createIndex('createdAt', 'createdAt');
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

function tx(
  db: IDBDatabase,
  mode: IDBTransactionMode,
): IDBObjectStore {
  return db.transaction(STORE, mode).objectStore(STORE);
}

function reqToPromise<T>(req: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

export async function listRecords(): Promise<MatchRecord[]> {
  if (!hasIndexedDb()) return [];
  const db = await openDb();
  try {
    const all = (await reqToPromise(tx(db, 'readonly').getAll())) as MatchRecord[];
    // createdAt 降順 (新しいものが先頭)。
    return all.sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
  } finally {
    db.close();
  }
}

export async function saveRecord(
  rec: Omit<MatchRecord, 'id' | 'createdAt' | 'buildSha'> & {
    buildSha?: string;
  },
): Promise<MatchRecord> {
  const id =
    Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 8);
  const buildSha =
    rec.buildSha ??
    (typeof __BUILD_SHA__ !== 'undefined' ? __BUILD_SHA__ : 'dev');
  const full: MatchRecord = {
    id,
    createdAt: new Date().toISOString(),
    buildSha,
    ...rec,
  };
  if (!hasIndexedDb()) return full;
  const db = await openDb();
  try {
    await reqToPromise(tx(db, 'readwrite').put(full));
  } finally {
    db.close();
  }
  return full;
}

export async function deleteRecord(id: string): Promise<void> {
  if (!hasIndexedDb()) return;
  const db = await openDb();
  try {
    await reqToPromise(tx(db, 'readwrite').delete(id));
  } finally {
    db.close();
  }
}

export async function clearAllRecords(): Promise<void> {
  if (!hasIndexedDb()) return;
  const db = await openDb();
  try {
    await reqToPromise(tx(db, 'readwrite').clear());
  } finally {
    db.close();
  }
}
