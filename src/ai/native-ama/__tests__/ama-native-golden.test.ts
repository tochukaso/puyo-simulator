import { describe, it, expect } from 'vitest';
import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';

const REPLAY = resolve('src-tauri/target/release/golden_replay');
const GOLDEN = resolve('src/ai/wasm-ama/__tests__/ama_golden.jsonl');

describe.skipIf(!existsSync(REPLAY))('ama-native golden file', () => {
  it('matches WASM golden file at gating threshold', () => {
    const r = spawnSync(REPLAY, [GOLDEN], { encoding: 'utf8' });
    expect(r.status).toBe(0);

    const m = r.stdout.match(/match_rate=([\d.]+)/);
    expect(m).not.toBeNull();
    const rate = parseFloat(m![1]!);

    // Gating thresholds — see docs/superpowers/progress/2026-04-29-ama-native-golden-results.md
    //
    // x86_64 native (Apple Clang real SSE) vs ama-wasm (emcc emul SSE):
    //   empirically 0.9255 — they break tied beam scores differently.
    //   Strength equivalence is checked by Phase 6 self-play eval, not here.
    //
    // arm64 (sse2neon) vs ama-wasm: not yet measured (no arm64 host).
    //   Use the same 0.90 gate for now.
    const threshold = 0.90;
    expect(rate).toBeGreaterThanOrEqual(threshold);
  }, 30 * 60 * 1000); // up to 30 min on slow hosts (8769 beam searches)
});
