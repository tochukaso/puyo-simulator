import { describe, it, expect, beforeAll } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { WasmAmaAI } from '../wasm-ama-ai';
import { AI_ROW_OFFSET } from '../../../game/constants';
import type { Color, GameState, Rotation } from '../../../game/types';

interface GoldenRow {
  gameId: number;
  moveIndex: number;
  field: string[];
  currentAxis: string;
  currentChild: string;
  next1Axis: string;
  next1Child: string;
  next2Axis: string;
  next2Child: string;
  expected: { axisCol: number; rotation: number; score: number };
}

const GOLDEN_PATH = resolve(
  process.cwd(),
  'src/ai/wasm-ama/__tests__/ama_golden.jsonl',
);

function rowToState(row: GoldenRow): GameState {
  // Golden fixtures are 13-row strings (the AI's view). The game now uses a
  // 14-row field, so we pad AI_ROW_OFFSET empty rows on top before handing
  // it to the WASM ama (which then drops them again on its way back to its
  // 13-row internal representation — net effect: identical fixture input).
  const cells: Color[][] = [];
  for (let r = 0; r < AI_ROW_OFFSET; r++) {
    cells.push(new Array(6).fill(null) as Color[]);
  }
  for (let r = 0; r < 13; r++) {
    const rowChars = row.field[r]!;
    const rowCells: (Color | null)[] = [];
    for (let c = 0; c < 6; c++) {
      const ch = rowChars[c]!;
      if (ch === 'R' || ch === 'B' || ch === 'Y' || ch === 'P') rowCells.push(ch);
      else rowCells.push(null);
    }
    cells.push(rowCells as Color[]);
  }
  return {
    field: { cells },
    current: {
      pair: {
        axis: row.currentAxis as Color,
        child: row.currentChild as Color,
      },
      axisRow: 1,
      axisCol: 2,
      rotation: 0 as Rotation,
    },
    nextQueue: [
      { axis: row.next1Axis as Color, child: row.next1Child as Color },
      { axis: row.next2Axis as Color, child: row.next2Child as Color },
    ],
    score: 0,
    chainCount: 0,
    totalChains: 0,
    maxChain: 0,
    status: 'playing',
    rngSeed: 0,
    queueIndex: 0,
  } as GameState;
}

const hasGolden = existsSync(GOLDEN_PATH);
// Each WASM suggest takes ~3s (6 BRANCH sequential), so 8k+ rows would
// take hours. Opt-in only: run with `AMA_GOLDEN_TEST=1 npm test`.
const enabled = hasGolden && process.env.AMA_GOLDEN_TEST === '1';

describe.skipIf(!enabled)('ama WASM matches native ama (golden file)', () => {
  const ai = new WasmAmaAI();
  let rows: GoldenRow[] = [];

  beforeAll(async () => {
    await ai.init();
    const text = readFileSync(GOLDEN_PATH, 'utf8');
    rows = text
      .trim()
      .split('\n')
      .map((l) => JSON.parse(l) as GoldenRow);
    expect(rows.length).toBeGreaterThan(100);
  }, 60_000);

  it('first 10 rows: WASM picks the same move as native', async () => {
    for (let i = 0; i < 10; i++) {
      const row = rows[i]!;
      const moves = await ai.suggest(rowToState(row), 1);
      const m = moves[0];
      expect(m, `gameId=${row.gameId} moveIndex=${row.moveIndex}`).toBeDefined();
      expect(m!.axisCol).toBe(row.expected.axisCol);
      expect(m!.rotation).toBe(row.expected.rotation);
    }
  });

  it('full set: same-move rate ≥ 95%', async () => {
    let match = 0;
    for (const row of rows) {
      const moves = await ai.suggest(rowToState(row), 1);
      const m = moves[0];
      if (m && m.axisCol === row.expected.axisCol && m.rotation === row.expected.rotation) {
        match++;
      }
    }
    const rate = match / rows.length;
    console.log(`golden same-move rate: ${(rate * 100).toFixed(2)}% (${match}/${rows.length})`);
    expect(rate).toBeGreaterThanOrEqual(0.95);
  }, 1_800_000);
});
