import { spawnSync } from 'node:child_process';
import { readFileSync, existsSync, writeFileSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { execSync } from 'node:child_process';
import { createInitialState, commitMove } from '../src/game/state';
import { HeuristicAI } from '../src/ai/heuristic';
import { createNodeMlAI } from './ml-ai-node';
import type { PuyoAI } from '../src/ai/types';
import { STANDARD, expandSeeds } from './eval-presets';

type AiKind = 'heuristic' | 'ml-v1' | 'ml-ama-v1' | 'ml-ama-v2-search' | 'ama' | 'ama-wasm';

const AMA_REPO = process.env.AMA_REPO ?? '/Users/yasumitsuomori/git/ama';
const AMA_BIN = join(AMA_REPO, 'bin/dump_selfplay/dump_selfplay.exe');

async function makeAi(kindOrPath: string): Promise<PuyoAI | null> {
  if (kindOrPath === 'heuristic') return new HeuristicAI();
  if (kindOrPath === 'ml-v1') return await createNodeMlAI('public/models/policy-v1/model.json');
  if (kindOrPath === 'ml-ama-v1') return await createNodeMlAI('public/models/policy-ama-v1/model.json');
  if (kindOrPath === 'ml-ama-v2-search') {
    const { createNodeMlSearchAI } = await import('./ml-ai-node');
    return await (createNodeMlSearchAI as any)('public/models/policy-ama-v2/model.json');
  }
  if (kindOrPath === 'ama') return null; // sentinel — handled by evalAmaGames subprocess
  if (kindOrPath === 'ama-wasm') {
    const { WasmAmaAI } = await import('../src/ai/wasm-ama/wasm-ama-ai');
    const ai = new WasmAmaAI();
    await ai.init();
    return ai;
  }
  if (kindOrPath.endsWith('model.json')) {
    return await createNodeMlAI(kindOrPath);
  }
  throw new Error(`unknown --ai value: ${kindOrPath}`);
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

interface CliArgs {
  ais: string[];
  seeds: number[];
  baseline: string | null;
  out: string | null;
  maxMoves: number;
}

function parseCli(): CliArgs {
  const a = process.argv.slice(2);
  const ais: string[] = [];
  for (let i = 0; i < a.length; i++) {
    if (a[i] === '--ai') { ais.push(a[++i]!); }
  }
  const get = (k: string, d?: string): string | undefined => {
    const i = a.indexOf(k);
    return i >= 0 && i + 1 < a.length ? a[i + 1] : d;
  };
  const preset = get('--preset');
  let seeds: number[];
  const seedsFlag = get('--seeds');
  if (seedsFlag) {
    seeds = seedsFlag.split(',').map((s) => Number(s.trim()));
  } else if (preset === 'standard') {
    seeds = expandSeeds(STANDARD);
  } else {
    const base = Number(get('--seed-base', '0'));
    const count = Number(get('--count', '20'));
    seeds = expandSeeds({ base, count });
  }
  return {
    ais,
    seeds,
    baseline: get('--baseline') ?? null,
    out: get('--out') ?? null,
    maxMoves: Number(get('--max-moves', String(STANDARD.maxMoves))),
  };
}

interface GameResult {
  seed: number;
  score: number;
  maxChain: number;
  totalChains: number;
  moves: number;
  gameover: boolean;
}

async function playSeed(ai: PuyoAI, seed: number, maxMoves: number): Promise<GameResult> {
  let state = createInitialState(seed);
  let moves = 0;
  for (let t = 0; t < maxMoves; t++) {
    if (state.status === 'gameover' || !state.current) break;
    const top = await ai.suggest(state, 1);
    const best = top[0];
    if (!best) break;
    state = commitMove(state, best);
    moves++;
  }
  return {
    seed,
    score: state.score,
    maxChain: state.maxChain,
    totalChains: state.totalChains,
    moves,
    gameover: state.status === 'gameover',
  };
}

function aggregate(games: GameResult[]) {
  const scores = games.map((g) => g.score).sort((x, y) => x - y);
  const avg = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / Math.max(1, xs.length);
  const median = (xs: number[]) =>
    xs.length === 0 ? 0 : xs[Math.floor(xs.length / 2)]!;
  return {
    avgScore: avg(games.map((g) => g.score)),
    medianScore: median(scores),
    avgMaxChain: avg(games.map((g) => g.maxChain)),
    maxScore: scores[scores.length - 1] ?? 0,
  };
}

function gitSha(): string {
  try {
    return execSync('git rev-parse --short HEAD').toString().trim();
  } catch {
    return 'unknown';
  }
}

interface AiResult {
  kind: string;
  version: string;
  model_url: string | null;
  games: GameResult[];
  aggregate: ReturnType<typeof aggregate>;
}

async function main() {
  const args = parseCli();
  if (args.ais.length === 0) {
    console.error('error: pass at least one --ai <kind|path>');
    process.exit(2);
  }

  const allResults: AiResult[] = [];
  for (const aiSpec of args.ais) {
    console.log(`\n=== AI: ${aiSpec} ===`);
    const games: GameResult[] = [];
    if (aiSpec === 'ama') {
      const out = evalAmaGames(args.seeds[0]!, args.seeds.length);
      for (let i = 0; i < args.seeds.length; i++) {
        games.push({
          seed: args.seeds[i]!,
          score: out[i]!.score,
          maxChain: out[i]!.maxChain,
          totalChains: 0,
          moves: 0,
          gameover: true,
        });
      }
    } else {
      const ai = await makeAi(aiSpec);
      if (!ai) throw new Error(`makeAi returned null for ${aiSpec}`);
      for (const seed of args.seeds) {
        const g = await playSeed(ai, seed, args.maxMoves);
        console.log(`  seed=${seed} score=${g.score} maxChain=${g.maxChain} moves=${g.moves}`);
        games.push(g);
      }
    }
    const agg = aggregate(games);
    console.log(`  avgScore=${agg.avgScore.toFixed(0)} avgMaxChain=${agg.avgMaxChain.toFixed(2)}`);
    allResults.push({
      kind: aiSpec,
      version: aiSpec,
      model_url: aiSpec.endsWith('model.json') ? aiSpec : null,
      games,
      aggregate: agg,
    });
  }

  interface Comparison {
    baseline: string;
    ai: string;
    avgScoreRatio: number | null;
    perSeed: { seed: number; ratio: number | null }[];
  }
  const comparisons: Comparison[] = [];
  if (args.baseline) {
    const base = allResults.find((r) => r.kind === args.baseline);
    if (base) {
      for (const r of allResults) {
        if (r.kind === args.baseline) continue;
        const perSeed = r.games.map((g, i) => ({
          seed: g.seed,
          ratio:
            base.games[i] && base.games[i]!.score > 0
              ? g.score / base.games[i]!.score
              : null,
        }));
        const ratios = perSeed.map((p) => p.ratio).filter((x): x is number => x !== null);
        const avgRatio =
          ratios.length === 0
            ? null
            : ratios.reduce((a, b) => a + b, 0) / ratios.length;
        comparisons.push({ baseline: args.baseline, ai: r.kind, avgScoreRatio: avgRatio, perSeed });
        console.log(`  vs ${args.baseline}: avgScoreRatio=${avgRatio?.toFixed(3) ?? 'n/a'}`);
      }
    }
  }

  if (args.out) {
    const payload = {
      timestamp: new Date().toISOString(),
      git_sha: gitSha(),
      seeds: args.seeds,
      ais: allResults,
      comparisons,
    };
    mkdirSync(dirname(args.out), { recursive: true });
    writeFileSync(args.out, JSON.stringify(payload, null, 2));
    console.log(`\nwrote ${args.out}`);
  }
}

void main();
