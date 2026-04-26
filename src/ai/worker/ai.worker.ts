import { HeuristicAI } from '../heuristic';
import { MlAI } from '../ml/ml-policy-ai';
import { MlSearchAI } from '../ml/ml-search-ai';
import { WasmAmaAI } from '../wasm-ama/wasm-ama-ai';
import type { AmaVariant } from '../wasm-ama/wasm-loader';
import type { AiKind as Kind, PuyoAI } from '../types';
import type { GameState, Move } from '../../game/types';

export type WorkerMessage =
  | { type: 'suggest'; id: number; state: GameState; topK: number }
  | { type: 'set-ai'; kind: Kind; preset?: string; variant?: AmaVariant };

export type WorkerResponse =
  | { type: 'suggest'; id: number; moves: Move[] }
  | { type: 'set-ai'; kind: Kind; ok: boolean; error?: string };

const heuristic = new HeuristicAI();
let active: PuyoAI = heuristic;
const mlInstances: Partial<Record<'ml-v1' | 'ml-ama-v1', MlAI>> = {};
// バリアント別にインスタンスを持つ。各 WasmAmaAI は固定の variant に紐付く
// (heap 上のバッファが variant 固有なため使い回せない)。
const amaWasmInstances: Partial<Record<AmaVariant, WasmAmaAI>> = {};

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

async function getOrInitAmaWasm(
  preset: string = 'build',
  variant: AmaVariant = 'default',
): Promise<WasmAmaAI> {
  let inst = amaWasmInstances[variant];
  if (!inst) {
    console.log(`[ama-wasm worker] creating WasmAmaAI variant=${variant} preset=${preset}`);
    inst = new WasmAmaAI(preset, variant);
    amaWasmInstances[variant] = inst;
  } else if (inst.preset !== preset) {
    console.log(`[ama-wasm worker] switching preset ${inst.preset} -> ${preset} on variant=${variant}`);
    await inst.setPreset(preset);
  }
  console.log(`[ama-wasm worker] init() start variant=${variant}`);
  const t0 = performance.now();
  await inst.init();
  console.log(`[ama-wasm worker] init() done in ${(performance.now() - t0).toFixed(0)}ms`);
  return inst;
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
        active = await getOrInitAmaWasm(msg.preset ?? 'build', msg.variant ?? 'default');
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
  }
}

if (typeof self !== 'undefined' && 'onmessage' in self) {
  (self as unknown as Worker).onmessage = (e: MessageEvent<WorkerMessage>) => {
    void handleMessage(e.data, (r) => (self as unknown as Worker).postMessage(r));
  };
}
