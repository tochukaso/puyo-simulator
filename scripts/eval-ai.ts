import { spawnSync } from 'node:child_process';
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { createInitialState, commitMove } from '../src/game/state';
import { HeuristicAI } from '../src/ai/heuristic';
import { createNodeMlAI } from './ml-ai-node';
import type { PuyoAI } from '../src/ai/types';
import { moveToActionIndex } from '../src/game/action';

type AiKind = 'heuristic' | 'ml-v1' | 'ml-ama-v1' | 'ama' | 'ama-wasm';

const AMA_REPO = process.env.AMA_REPO ?? '/Users/yasumitsuomori/git/ama';
const AMA_BIN = join(AMA_REPO, 'bin/dump_selfplay/dump_selfplay.exe');

async function makeAi(kind: AiKind): Promise<PuyoAI | null> {
  if (kind === 'heuristic') return new HeuristicAI();
  if (kind === 'ml-v1') return await createNodeMlAI('public/models/policy-v1/model.json');
  if (kind === 'ml-ama-v1') return await createNodeMlAI('public/models/policy-ama-v1/model.json');
  if (kind === 'ama') return null; // sentinel — handled separately (subprocess)
  if (kind === 'ama-wasm') {
    const { WasmAmaAI } = await import('../src/ai/wasm-ama/wasm-ama-ai');
    const ai = new WasmAmaAI();
    await ai.init();
    return ai;
  }
  throw new Error(`unknown kind: ${kind}`);
}

async function playOne(
  ai: PuyoAI,
  seed: number,
): Promise<{ score: number; maxChain: number }> {
  let state = createInitialState(seed);
  for (let t = 0; t < 500; t++) {
    if (state.status === 'gameover' || !state.current) break;
    const moves = await ai.suggest(state, 1);
    const best = moves[0];
    if (!best) break;
    state = commitMove(state, best);
  }
  return { score: state.score, maxChain: state.maxChain };
}

function evalAmaGames(
  seed0: number,
  count: number,
): { score: number; maxChain: number }[] {
  if (!existsSync(AMA_BIN)) {
    throw new Error(`ama binary not found at ${AMA_BIN}`);
  }
  const tmp = '/tmp/ama-eval.jsonl';
  spawnSync(
    AMA_BIN,
    [
      '--games', String(count),
      '--seed', String(seed0),
      '--weights', 'build',
      '--out', tmp,
      '--topk', '1',
    ],
    { cwd: AMA_REPO, stdio: 'inherit' },
  );
  const byGame = new Map<number, { score: number; maxChain: number }>();
  const text = readFileSync(tmp, 'utf-8');
  for (const line of text.split('\n')) {
    if (!line.trim()) continue;
    const j = JSON.parse(line) as {
      game_id: number;
      final_score: number;
      final_max_chain: number;
    };
    byGame.set(j.game_id, { score: j.final_score, maxChain: j.final_max_chain });
  }
  return Array.from(byGame.values());
}

async function topOneAgreement(
  a: PuyoAI,
  b: PuyoAI,
  seeds: number[],
): Promise<number> {
  let same = 0;
  let total = 0;
  for (const seed of seeds.slice(0, 20)) {
    let state = createInitialState(seed);
    for (let t = 0; t < 30; t++) {
      if (!state.current || state.status === 'gameover') break;
      const [ma, mb] = await Promise.all([a.suggest(state, 1), b.suggest(state, 1)]);
      if (ma[0] && mb[0]) {
        total++;
        if (moveToActionIndex(ma[0]) === moveToActionIndex(mb[0])) same++;
      }
      state = commitMove(state, ma[0]!);
    }
  }
  return total === 0 ? 0 : same / total;
}

async function main() {
  const args = process.argv.slice(2);
  const get = (k: string, d: string) => {
    const i = args.indexOf(k);
    return i >= 0 && i + 1 < args.length ? args[i + 1]! : d;
  };
  const games = Number(get('--games', '100'));
  const seed0 = Number(get('--seed', '1'));
  const aKind = get('--a', 'heuristic') as AiKind;
  const bKind = get('--b', 'ml-ama-v1') as AiKind;

  console.log(`Eval: ${games} games  seed0=${seed0}  A=${aKind}  B=${bKind}`);

  const seeds = Array.from({ length: games }, (_, i) => (seed0 + i) >>> 0);

  const playMany = async (kind: AiKind) => {
    if (kind === 'ama') return evalAmaGames(seed0, games);
    const ai = (await makeAi(kind))!;
    const out: { score: number; maxChain: number }[] = [];
    for (const s of seeds) out.push(await playOne(ai, s));
    return out;
  };

  const [aRes, bRes] = await Promise.all([playMany(aKind), playMany(bKind)]);

  const avg = (arr: number[]) => arr.reduce((x, y) => x + y, 0) / arr.length;
  const avgA = avg(aRes.map((r) => r.score));
  const avgB = avg(bRes.map((r) => r.score));
  const chA = avg(aRes.map((r) => r.maxChain));
  const chB = avg(bRes.map((r) => r.maxChain));
  console.log(`${aKind} avg score: ${avgA.toFixed(0)}  max-chain mean: ${chA.toFixed(2)}`);
  console.log(`${bKind} avg score: ${avgB.toFixed(0)}  max-chain mean: ${chB.toFixed(2)}`);
  console.log(`Ratio (B/A): ${(avgB / avgA).toFixed(3)}`);

  if (aKind !== 'ama' && bKind !== 'ama') {
    const ai_a = (await makeAi(aKind))!;
    const ai_b = (await makeAi(bKind))!;
    const t1 = await topOneAgreement(ai_a, ai_b, seeds);
    console.log(`Top-1 agreement: ${t1.toFixed(3)}`);
  }
}

void main();
