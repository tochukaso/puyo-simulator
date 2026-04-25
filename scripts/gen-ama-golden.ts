import { spawnSync } from 'node:child_process';
import { mkdirSync, readFileSync, writeFileSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';

const AMA_REPO = process.env.AMA_REPO ?? '/Users/yasumitsuomori/git/ama';
const AMA_BIN = join(AMA_REPO, 'bin/dump_selfplay/dump_selfplay.exe');

function parseArg(name: string, fallback: string): string {
  const i = process.argv.indexOf(name);
  return i >= 0 && i + 1 < process.argv.length ? process.argv[i + 1]! : fallback;
}

function main() {
  const games = Number(parseArg('--games', '50'));
  const seed = Number(parseArg('--seed', '7777'));
  const out = parseArg('--out', 'src/ai/wasm-ama/__tests__/ama_golden.jsonl');

  if (!existsSync(AMA_BIN)) {
    console.error(`ama dump_selfplay binary not found: ${AMA_BIN}`);
    console.error(`Build it: cd ${AMA_REPO} && make dump_selfplay`);
    process.exit(1);
  }

  const tmp = join('/tmp', `ama-golden-${seed}.jsonl`);
  console.log(`Running ama for ${games} games (seed ${seed}) -> ${tmp}`);
  const ret = spawnSync(
    AMA_BIN,
    [
      '--games', String(games),
      '--seed', String(seed),
      '--weights', 'build',
      '--out', tmp,
      '--topk', '5',
    ],
    { cwd: AMA_REPO, stdio: 'inherit' },
  );
  if (ret.status !== 0) {
    console.error(`ama exited ${ret.status}`);
    process.exit(1);
  }

  const lines = readFileSync(tmp, 'utf8').trim().split('\n');
  const golden: string[] = [];
  for (const line of lines) {
    if (!line.trim()) continue;
    let row: Record<string, unknown>;
    try {
      row = JSON.parse(line);
    } catch {
      continue;
    }
    const topk = row.topk as
      | Array<{ axisCol: number; rotation: number; score: number }>
      | undefined;
    if (!topk || topk.length === 0) continue;
    const exp = topk[0]!;
    golden.push(
      JSON.stringify({
        gameId: row.game_id,
        moveIndex: row.move_index,
        field: row.field,
        currentAxis: row.current_axis,
        currentChild: row.current_child,
        next1Axis: row.next1_axis,
        next1Child: row.next1_child,
        next2Axis: row.next2_axis,
        next2Child: row.next2_child,
        expected: { axisCol: exp.axisCol, rotation: exp.rotation, score: exp.score },
      }),
    );
  }

  mkdirSync(dirname(out), { recursive: true });
  writeFileSync(out, golden.join('\n') + '\n');
  console.log(`Wrote ${golden.length} golden rows to ${out}`);
}

main();
