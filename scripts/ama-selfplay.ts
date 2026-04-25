import { spawn } from 'node:child_process';
import { mkdirSync, existsSync } from 'node:fs';
import { join, resolve as resolvePath } from 'node:path';

const AMA_REPO = process.env.AMA_REPO ?? '/Users/yasumitsuomori/git/ama';
const AMA_BIN = join(AMA_REPO, 'bin/dump_selfplay/dump_selfplay.exe');

interface Args {
  games: number;
  workers: number;
  seed: number;
  weights: string;
  outDir: string;
  topk: number;
}

function parseArgs(): Args {
  const a = process.argv.slice(2);
  const get = (k: string, d: string) => {
    const i = a.indexOf(k);
    return i >= 0 && i + 1 < a.length ? a[i + 1]! : d;
  };
  return {
    games: Number(get('--games', '50000')),
    workers: Number(get('--workers', '8')),
    seed: Number(get('--seed', '20260425')),
    weights: get('--weights', 'build'),
    outDir: get('--out', 'data/ama-selfplay'),
    topk: Number(get('--topk', '5')),
  };
}

async function main() {
  const args = parseArgs();
  if (!existsSync(AMA_BIN)) {
    console.error(`ama binary not found at ${AMA_BIN}`);
    console.error('Build it first: cd /Users/yasumitsuomori/git/ama && make dump_selfplay');
    process.exit(1);
  }
  if (!existsSync(args.outDir)) mkdirSync(args.outDir, { recursive: true });

  const perWorker = Math.ceil(args.games / args.workers);
  console.log(`Running ${args.games} games across ${args.workers} workers (~${perWorker}/worker)`);
  const start = Date.now();

  const promises: Promise<void>[] = [];
  for (let w = 0; w < args.workers; w++) {
    const wgames = Math.min(perWorker, args.games - w * perWorker);
    if (wgames <= 0) continue;
    const wseed = args.seed + w * perWorker;
    const wout = resolvePath(join(args.outDir, `ama-${args.seed}-w${w}.jsonl`));
    const cmd = [
      AMA_BIN,
      '--games', String(wgames),
      '--seed', String(wseed),
      '--weights', args.weights,
      '--out', wout,
      '--topk', String(args.topk),
    ];
    promises.push(
      new Promise((resolve, reject) => {
        const proc = spawn(cmd[0]!, cmd.slice(1), { cwd: AMA_REPO, stdio: 'inherit' });
        proc.on('error', reject);
        proc.on('exit', (code) => {
          if (code === 0) {
            console.log(`worker ${w}: done (${wgames} games → ${wout})`);
            resolve();
          } else {
            reject(new Error(`worker ${w} exited ${code}`));
          }
        });
      }),
    );
  }
  await Promise.all(promises);
  const elapsed = (Date.now() - start) / 1000;
  console.log(`all workers complete in ${elapsed.toFixed(1)}s (${(args.games / elapsed).toFixed(2)} games/s)`);
}

void main();
