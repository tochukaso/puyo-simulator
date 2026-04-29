// Run: tsx scripts/bench-ama.ts [--runs N]
//
// Measures per-suggestion latency for ama-native by spawning the
// golden_replay example against a 100-row subsample. Outputs p50/p90/p99
// statistics. Strength is verified separately by the golden test gate.

import { spawnSync } from 'node:child_process';
import { resolve } from 'node:path';
import { existsSync } from 'node:fs';

const REPLAY = resolve('src-tauri/target/release/examples/golden_replay');
const GOLDEN = resolve('src/ai/native-ama/__tests__/fixtures/ama_golden_100.jsonl');

if (!existsSync(REPLAY)) {
  console.error('missing', REPLAY);
  console.error('build with: cd src-tauri && cargo build --release --example golden_replay');
  process.exit(2);
}
if (!existsSync(GOLDEN)) {
  console.error('missing', GOLDEN);
  process.exit(2);
}

const args = parseArgs(process.argv.slice(2));
const runs = parseInt(args.runs ?? '5', 10);

console.log(`bench: ${runs} runs × 100 rows from ${GOLDEN}`);

// Warmup: 1 run not counted
console.log('warmup...');
spawnSync(REPLAY, [GOLDEN], { encoding: 'utf8' });

const samples: number[] = [];
for (let i = 0; i < runs; i++) {
  const t0 = performance.now();
  const r = spawnSync(REPLAY, [GOLDEN], { encoding: 'utf8' });
  const dt = performance.now() - t0;
  if (r.status !== 0) {
    console.error(`run ${i} failed:`, r.stderr);
    process.exit(3);
  }
  const m = r.stdout.match(/total=(\d+)/);
  const n = parseInt(m![1]!, 10);
  const perRow = dt / n;
  samples.push(perRow);
  console.log(`run ${i + 1}: ${dt.toFixed(0)}ms total, ${perRow.toFixed(2)}ms/suggestion (n=${n})`);
}

samples.sort((a, b) => a - b);
const p = (q: number) => samples[Math.floor((samples.length - 1) * q)]!;
const mean = samples.reduce((a, b) => a + b, 0) / samples.length;

console.log('\nper-suggestion latency (ms):');
console.log(`  p50:  ${p(0.5).toFixed(2)}`);
console.log(`  p90:  ${p(0.9).toFixed(2)}`);
console.log(`  p99:  ${p(0.99).toFixed(2)}`);
console.log(`  max:  ${samples[samples.length - 1]!.toFixed(2)}`);
console.log(`  mean: ${mean.toFixed(2)}`);

console.log(`\nNote: each sample = avg over 100 suggestions (avg-of-avg, not true p99).`);
console.log(`Real p99 across individual suggestions requires per-row timing in golden_replay,`);
console.log(`which is a future enhancement.`);

function parseArgs(argv: string[]): Record<string, string | undefined> {
  const out: Record<string, string | undefined> = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]!;
    if (a.startsWith('--')) out[a.slice(2)] = argv[++i];
  }
  return out;
}
