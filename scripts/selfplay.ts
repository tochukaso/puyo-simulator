import { Worker, isMainThread, parentPort, workerData } from 'node:worker_threads';
import { writeFileSync, mkdirSync, existsSync, appendFileSync } from 'node:fs';
import { join, dirname, resolve as resolvePath } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createInitialState, commitMove } from '../src/game/state';
import { HeuristicAI } from '../src/ai/heuristic';
import { moveToActionIndex } from '../src/game/action';
import type { GameState } from '../src/game/types';

const __filename = fileURLToPath(import.meta.url);
const TSX_BOOT = resolvePath(dirname(__filename), 'tsx-register.mjs');

interface SampleRow {
  seed: number;
  game_id: number;
  move_index: number;
  field: (string | null)[][];
  current_axis: string;
  current_child: string;
  next1_axis: string;
  next1_child: string;
  next2_axis: string;
  next2_child: string;
  teacher_move: { axisCol: number; rotation: number };
  teacher_action_index: number;
  final_score: number;
  final_max_chain: number;
}

async function playGame(seed: number, gameId: number, ai: HeuristicAI): Promise<SampleRow[]> {
  await ai.init();
  let state: GameState = createInitialState(seed);
  const samples: Omit<SampleRow, 'final_score' | 'final_max_chain'>[] = [];
  let moveIndex = 0;
  const MAX_MOVES = 300; // safety

  while (state.status !== 'gameover' && moveIndex < MAX_MOVES) {
    if (state.current === null) break;
    const moves = await ai.suggest(state, 1);
    const best = moves[0];
    if (!best) break;
    const n1 = state.nextQueue[0]!;
    const n2 = state.nextQueue[1] ?? n1;
    samples.push({
      seed,
      game_id: gameId,
      move_index: moveIndex,
      field: state.field.cells.map((row) => row.map((c) => c)),
      current_axis: state.current.pair.axis,
      current_child: state.current.pair.child,
      next1_axis: n1.axis,
      next1_child: n1.child,
      next2_axis: n2.axis,
      next2_child: n2.child,
      teacher_move: { axisCol: best.axisCol, rotation: best.rotation },
      teacher_action_index: moveToActionIndex(best),
    });
    state = commitMove(state, best);
    moveIndex++;
  }

  return samples.map((s) => ({
    ...s,
    final_score: state.score,
    final_max_chain: state.maxChain,
  }));
}

async function workerMain() {
  const { seeds, gameIdBase, outFile } = workerData as {
    seeds: number[];
    gameIdBase: number;
    outFile: string;
  };
  const ai = new HeuristicAI();
  let lines: string[] = [];
  for (let i = 0; i < seeds.length; i++) {
    const rows = await playGame(seeds[i]!, gameIdBase + i, ai);
    for (const r of rows) lines.push(JSON.stringify(r));
    if (lines.length > 5000) {
      appendFileSync(outFile, lines.join('\n') + '\n');
      lines = [];
    }
    parentPort?.postMessage({ type: 'progress', gameId: gameIdBase + i });
  }
  if (lines.length > 0) appendFileSync(outFile, lines.join('\n') + '\n');
  parentPort?.postMessage({ type: 'done' });
}

async function main() {
  const args = process.argv.slice(2);
  const games = Number(argValue(args, '--games', '10'));
  const workers = Number(argValue(args, '--workers', '4'));
  const seed0 = Number(argValue(args, '--seed', String(Date.now() & 0xffffffff)));
  const outDir = argValue(args, '--out', 'data/selfplay');
  if (!existsSync(outDir)) mkdirSync(outDir, { recursive: true });
  const outFile = join(outDir, `selfplay-${seed0}.jsonl`);
  writeFileSync(outFile, ''); // truncate

  const perWorker = Math.ceil(games / workers);
  const startedAt = Date.now();
  let done = 0;

  const promises: Promise<void>[] = [];
  for (let w = 0; w < workers; w++) {
    const seeds: number[] = [];
    const base = w * perWorker;
    for (let i = 0; i < perWorker && base + i < games; i++) {
      seeds.push((seed0 + base + i) >>> 0);
    }
    if (seeds.length === 0) continue;
    promises.push(
      new Promise((resolve, reject) => {
        const worker = new Worker(__filename, {
          workerData: { seeds, gameIdBase: base, outFile },
          execArgv: ['--import', TSX_BOOT],
        });
        worker.on('message', (msg: { type: string }) => {
          if (msg.type === 'progress') {
            done++;
            if (done % 10 === 0) {
              const elapsed = (Date.now() - startedAt) / 1000;
              const rate = done / elapsed;
              console.log(`  ${done}/${games}  ${rate.toFixed(2)} games/s`);
            }
          } else if (msg.type === 'done') {
            resolve();
          }
        });
        worker.on('error', reject);
        worker.on('exit', (code) => {
          if (code !== 0 && done < games) reject(new Error(`worker exit ${code}`));
        });
      }),
    );
  }

  await Promise.all(promises);
  console.log(`self-play complete: ${games} games → ${outFile}`);
}

function argValue(args: string[], key: string, def: string): string {
  const i = args.indexOf(key);
  return i >= 0 && i + 1 < args.length ? args[i + 1]! : def;
}

if (isMainThread) {
  void main();
} else {
  void workerMain();
}
