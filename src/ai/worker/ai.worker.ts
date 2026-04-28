import { HeuristicAI } from '../heuristic';
import { MlAI } from '../ml/ml-policy-ai';
import { MlSearchAI } from '../ml/ml-search-ai';
import { WasmAmaAI } from '../wasm-ama/wasm-ama-ai';
import type { AiKind as Kind, PuyoAI } from '../types';
import type { GameState, Move } from '../../game/types';

export type WorkerMessage =
  | { type: 'suggest'; id: number; state: GameState; topK: number }
  // 1-shot suggest: bypasses the player UI's shared subscription. Used by
  // the match driver to fetch the AI's auto-play move for an arbitrary state
  // without disturbing the player-side suggestion stream.
  | { type: 'suggest-once'; id: number; state: GameState; topK: number }
  | { type: 'set-ai'; kind: Kind; preset?: string };

export type WorkerResponse =
  | { type: 'suggest'; id: number; moves: Move[] }
  | { type: 'suggest-once'; id: number; moves: Move[]; error?: string }
  | { type: 'set-ai'; kind: Kind; ok: boolean; error?: string };

const heuristic = new HeuristicAI();
let active: PuyoAI = heuristic;
const mlInstances: Partial<Record<'ml-v1' | 'ml-ama-v1', MlAI>> = {};
// 単一 WASM のみで preset 切り替え方式に統一。
let amaWasmInstance: WasmAmaAI | null = null;

let mlSearchInstance: MlSearchAI | null = null;

async function getOrInitMlSearch(): Promise<MlSearchAI> {
  if (!mlSearchInstance) {
    mlSearchInstance = new MlSearchAI({
      modelUrl: '/models/policy-ama-v2/model.json',
      K: 6,
    });
  }
  await mlSearchInstance.init();
  return mlSearchInstance;
}

async function getOrInitMl(kind: 'ml-v1' | 'ml-ama-v1'): Promise<MlAI> {
  let inst = mlInstances[kind];
  if (!inst) {
    inst = new MlAI(kind === 'ml-v1' ? 'v1' : 'ama-v1');
    mlInstances[kind] = inst;
  }
  await inst.init();
  return inst;
}

async function getOrInitAmaWasm(preset: string = 'build'): Promise<WasmAmaAI> {
  if (!amaWasmInstance) {
    console.log(`[ama-wasm worker] creating WasmAmaAI preset=${preset}`);
    amaWasmInstance = new WasmAmaAI(preset);
  } else if (amaWasmInstance.preset !== preset) {
    console.log(`[ama-wasm worker] switching preset ${amaWasmInstance.preset} -> ${preset}`);
    await amaWasmInstance.setPreset(preset);
  }
  console.log(`[ama-wasm worker] init() start`);
  const t0 = performance.now();
  await amaWasmInstance.init();
  console.log(`[ama-wasm worker] init() done in ${(performance.now() - t0).toFixed(0)}ms`);
  return amaWasmInstance;
}

export async function handleMessage(
  msg: WorkerMessage,
  send: (r: WorkerResponse) => void,
): Promise<void> {
  if (msg.type === 'set-ai') {
    try {
      if (msg.kind === 'heuristic') {
        active = heuristic;
        send({ type: 'set-ai', kind: 'heuristic', ok: true });
        return;
      }
      if (msg.kind === 'ama-wasm') {
        active = await getOrInitAmaWasm(msg.preset ?? 'build');
        console.log('[ama-wasm worker] active set, sending set-ai ok=true');
        send({ type: 'set-ai', kind: 'ama-wasm', ok: true });
        return;
      }
      if (msg.kind === 'ml-ama-v2-search') {
        active = await getOrInitMlSearch();
        send({ type: 'set-ai', kind: 'ml-ama-v2-search', ok: true });
        return;
      }
      const ml = await getOrInitMl(msg.kind);
      active = ml;
      send({ type: 'set-ai', kind: msg.kind, ok: true });
    } catch (err) {
      active = heuristic;
      send({
        type: 'set-ai',
        kind: msg.kind,
        ok: false,
        error: err instanceof Error ? err.message : String(err),
      });
    }
    return;
  }
  if (msg.type === 'suggest') {
    await active.init();
    const moves = await active.suggest(msg.state, msg.topK);
    send({ type: 'suggest', id: msg.id, moves });
    return;
  }
  if (msg.type === 'suggest-once') {
    try {
      await active.init();
      const moves = await active.suggest(msg.state, msg.topK);
      send({ type: 'suggest-once', id: msg.id, moves });
    } catch (err) {
      send({
        type: 'suggest-once',
        id: msg.id,
        moves: [],
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }
}

if (typeof self !== 'undefined' && 'onmessage' in self) {
  (self as unknown as Worker).onmessage = (e: MessageEvent<WorkerMessage>) => {
    void handleMessage(e.data, (r) => (self as unknown as Worker).postMessage(r));
  };
}
