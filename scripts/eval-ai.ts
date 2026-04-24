import { createInitialState, commitMove } from '../src/game/state';
import { HeuristicAI } from '../src/ai/heuristic';
import { createNodeMlAI } from './ml-ai-node';
import type { PuyoAI } from '../src/ai/types';
import { moveToActionIndex } from '../src/game/action';

async function playOne(ai: PuyoAI, seed: number): Promise<{ score: number; maxChain: number }> {
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

async function topOneAgreement(a: PuyoAI, b: PuyoAI, seeds: number[]): Promise<number> {
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
  const games = Number(arg(args, '--games', '100'));
  const seed0 = Number(arg(args, '--seed', '1'));
  const mlPath = arg(args, '--ml', 'public/models/policy-v1/model.json');

  await Promise.all([new HeuristicAI().init()]);
  const heuristic = new HeuristicAI();
  const ml = await createNodeMlAI(mlPath);

  console.log(`Evaluating ${games} games per AI, seed0=${seed0}`);
  const seeds = Array.from({ length: games }, (_, i) => (seed0 + i) >>> 0);

  const hRes = await Promise.all(seeds.map((s) => playOne(heuristic, s)));
  const mRes = await Promise.all(seeds.map((s) => playOne(ml, s)));

  const avg = (arr: number[]) => arr.reduce((a, b) => a + b, 0) / arr.length;
  const avgH = avg(hRes.map((r) => r.score));
  const avgM = avg(mRes.map((r) => r.score));
  const chainH = avg(hRes.map((r) => r.maxChain));
  const chainM = avg(mRes.map((r) => r.maxChain));

  const top1 = await topOneAgreement(heuristic, ml, seeds);

  console.log(`Heuristic avg score: ${avgH.toFixed(0)}  max-chain mean: ${chainH.toFixed(2)}`);
  console.log(`ML        avg score: ${avgM.toFixed(0)}  max-chain mean: ${chainM.toFixed(2)}`);
  console.log(`Ratio (ML/H): ${(avgM / avgH).toFixed(3)}`);
  console.log(`Top-1 agreement (on shared trajectory): ${top1.toFixed(3)}`);
}

function arg(args: string[], key: string, def: string): string {
  const i = args.indexOf(key);
  return i >= 0 && i + 1 < args.length ? args[i + 1]! : def;
}

void main();
