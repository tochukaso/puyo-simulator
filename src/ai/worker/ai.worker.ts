import { HeuristicAI } from '../heuristic';
import { MlAI } from '../ml/ml-ai';
import type { AiKind as Kind, PuyoAI } from '../types';
import type { GameState, Move } from '../../game/types';

export type WorkerMessage =
  | { type: 'suggest'; id: number; state: GameState; topK: number }
  | { type: 'set-ai'; kind: Kind };

export type WorkerResponse =
  | { type: 'suggest'; id: number; moves: Move[] }
  | { type: 'set-ai'; kind: Kind; ok: boolean; error?: string };

const heuristic = new HeuristicAI();
let active: PuyoAI = heuristic;
const mlInstances: Partial<Record<'ml-v1' | 'ml-ama-v1', MlAI>> = {};

async function getOrInitMl(kind: 'ml-v1' | 'ml-ama-v1'): Promise<MlAI> {
  let inst = mlInstances[kind];
  if (!inst) {
    inst = new MlAI(kind === 'ml-v1' ? 'v1' : 'ama-v1');
    mlInstances[kind] = inst;
  }
  await inst.init();
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
