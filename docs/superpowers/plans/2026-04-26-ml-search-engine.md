# ML Search Engine Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the 1-ply policy ML AI with a 3-ply expectimax search engine using an 11ch encoding, color canonicalization, and 48× data augmentation, exported as `policy-ama-v2-search`. Bring the new model's average score per game within 50% of `ama-wasm` on a fixed 20-seed eval set.

**Architecture:** Python distillation pipeline updated (encoding 7→11ch, canonicalize colors, LR flip + permutation augmentation, temperature 100→20, ResNet 8→10 blocks). TF.js inference moves from policy 1-shot to expectimax search (depth 3 deterministic + 1 chance node, K=6 beam, 2 chance representatives = same/different color). Eval harness extended to compare AIs on fixed seeds with structured JSON output.

**Tech Stack:** Python 3.11, PyTorch (ResNet), ONNX → TF.js conversion, TypeScript (worker + Tensorflow.js inference), pytest + vitest.

**Spec:** `docs/superpowers/specs/2026-04-26-ml-search-engine-design.md`

---

## Pre-flight

All commands assume cwd = `/Users/yasumitsuomori/git/puyo-simulator/.worktrees/puyo-mvp`.

Python work assumes the venv is active:

```bash
cd python && source .venv/bin/activate
```

---

## Task 1: Eval harness — gitignore & preset constant

**Files:**
- Modify: `.gitignore`
- Create: `scripts/eval-presets.ts`

- [ ] **Step 1: Add eval-runs to gitignore**

Edit `.gitignore`, append after the existing `data/` blocks:

```gitignore
# Eval harness output (local accumulation, not committed)
data/eval-runs/
```

- [ ] **Step 2: Write the eval presets module**

Create `scripts/eval-presets.ts`:

```ts
// Standard seed set for repeatable AI eval. One preset, intentionally —
// branching the seed set across runs makes histories incomparable.
export const STANDARD = {
  base: 0,
  count: 20,
  maxMoves: 500,
} as const;

export type Preset = typeof STANDARD;

export function expandSeeds(p: { base: number; count: number }): number[] {
  return Array.from({ length: p.count }, (_, i) => p.base + i);
}
```

- [ ] **Step 3: Commit**

```bash
git add .gitignore scripts/eval-presets.ts
git commit -m "feat(eval): standard seed preset + ignore eval-runs/"
```

---

## Task 2: Eval harness — extend `eval-ai.ts` with new flags

**Files:**
- Modify: `scripts/eval-ai.ts`

- [ ] **Step 1: Read the current `eval-ai.ts` to understand its shape**

```bash
cat scripts/eval-ai.ts
```

Expected: ~120 lines with `makeAi`, `playOne`, `evalAmaGames`, and a CLI `main` that reads `--ai`, `--games`, `--seed`. We're going to keep `makeAi`/`playOne`/`evalAmaGames`, replace `main`, and add path-based AI loading.

- [ ] **Step 2: Replace `makeAi` to accept paths**

Replace the existing `makeAi` function in `scripts/eval-ai.ts`:

```ts
type AiKind = 'heuristic' | 'ml-v1' | 'ml-ama-v1' | 'ml-ama-v2-search' | 'ama' | 'ama-wasm';

async function makeAi(kindOrPath: string): Promise<PuyoAI | null> {
  if (kindOrPath === 'heuristic') return new HeuristicAI();
  if (kindOrPath === 'ml-v1') return await createNodeMlAI('public/models/policy-v1/model.json');
  if (kindOrPath === 'ml-ama-v1') return await createNodeMlAI('public/models/policy-ama-v1/model.json');
  if (kindOrPath === 'ml-ama-v2-search') {
    // Search-based AI lives in a separate module; created via dedicated factory.
    const { createNodeMlSearchAI } = await import('./ml-ai-node');
    return await createNodeMlSearchAI('public/models/policy-ama-v2/model.json');
  }
  if (kindOrPath === 'ama') return null; // sentinel — handled by evalAmaGames subprocess
  if (kindOrPath === 'ama-wasm') {
    const { WasmAmaAI } = await import('../src/ai/wasm-ama/wasm-ama-ai');
    const ai = new WasmAmaAI();
    await ai.init();
    return ai;
  }
  // Treat as model.json path → policy AI (1-ply).
  if (kindOrPath.endsWith('model.json')) {
    return await createNodeMlAI(kindOrPath);
  }
  throw new Error(`unknown --ai value: ${kindOrPath}`);
}
```

Note: `createNodeMlSearchAI` is added in Task 13. For now this import will fail at runtime if you select `ml-ama-v2-search`. That is expected — Tasks 1-12 don't need the search AI.

- [ ] **Step 3: Add structured CLI args + run loop**

Replace the bottom `main()` in `scripts/eval-ai.ts` with:

```ts
import { writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { dirname } from 'node:path';
import { execSync } from 'node:child_process';
import { STANDARD, expandSeeds } from './eval-presets';

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

async function main() {
  const args = parseCli();
  if (args.ais.length === 0) {
    console.error('error: pass at least one --ai <kind|path>');
    process.exit(2);
  }

  const allResults: any[] = [];
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

  let comparisons: any[] = [];
  if (args.baseline) {
    const base = allResults.find((r) => r.kind === args.baseline);
    if (base) {
      for (const r of allResults) {
        if (r.kind === args.baseline) continue;
        const perSeed = r.games.map((g: GameResult, i: number) => ({
          seed: g.seed,
          ratio: base.games[i] && base.games[i].score > 0
            ? g.score / base.games[i].score
            : null,
        }));
        const ratios = perSeed.map((p: any) => p.ratio).filter((x: any) => x !== null) as number[];
        const avgRatio = ratios.length === 0
          ? null
          : ratios.reduce((a, b) => a + b, 0) / ratios.length;
        comparisons.push({
          baseline: args.baseline,
          ai: r.kind,
          avgScoreRatio: avgRatio,
          perSeed,
        });
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
```

- [ ] **Step 4: Smoke test the harness with heuristic only**

Run:

```bash
npm run eval -- --preset standard --ai heuristic --out /tmp/eval-test.json
```

Expected: 20 lines `seed=N score=... maxChain=...`, then `avgScore=...`, `wrote /tmp/eval-test.json`. Inspect file:

```bash
cat /tmp/eval-test.json | head -30
```

Should show `timestamp`, `git_sha`, `seeds: [0,…,19]`, `ais: [{kind: "heuristic", games: [...], aggregate: {...}}]`.

- [ ] **Step 5: Commit**

```bash
git add scripts/eval-ai.ts
git commit -m "feat(eval): structured JSON output, --preset/--baseline/--ai-path flags"
```

---

## Task 3: Baseline measurement

**Files:**
- Create: `data/eval-runs/baseline-2026-04-26.json` (gitignored)
- Create: `docs/superpowers/progress/2026-04-26-ml-search-baseline.md`

- [ ] **Step 1: Run the baseline eval (heuristic, ml-ama-v1, ama-wasm)**

```bash
mkdir -p data/eval-runs
npm run eval -- \
  --preset standard \
  --ai heuristic \
  --ai ml-ama-v1 \
  --ai ama-wasm \
  --baseline ama-wasm \
  --out data/eval-runs/baseline-2026-04-26.json
```

Expected: ~5–15 minutes (ama-wasm dominates time). Final stdout shows:

```
=== AI: heuristic ===
  ...
=== AI: ml-ama-v1 ===
  ...
=== AI: ama-wasm ===
  ...
  vs ama-wasm: avgScoreRatio=...
```

If `npm run eval` is missing, run instead: `npx tsx scripts/eval-ai.ts ...`

- [ ] **Step 2: Document the numbers**

Create `docs/superpowers/progress/2026-04-26-ml-search-baseline.md`:

```markdown
# ML Search Baseline (2026-04-26)

20 seeds (0..19), max 500 moves per game. Source:
`data/eval-runs/baseline-2026-04-26.json` (gitignored).

| AI | avg score | avg maxChain | avg score / ama |
| --- | --- | --- | --- |
| heuristic | <fill in> | <fill in> | <fill in> |
| ml-ama-v1 | <fill in> | <fill in> | <fill in> |
| ama-wasm  | <fill in> | <fill in> | 1.000 |

Target for `ml-ama-v2-search` (per spec §1.2):
- avg score / ama ≥ 0.50
- avg maxChain / ama ≥ 0.70
- avg score > ml-ama-v1 baseline (no regression)
```

Read the JSON and fill in the table values.

- [ ] **Step 3: Commit baseline doc**

```bash
git add docs/superpowers/progress/2026-04-26-ml-search-baseline.md
git commit -m "docs(progress): record ML search baseline (heuristic / ml-ama-v1 / ama-wasm)"
```

---

## Task 4: Python — `canonicalize_colors`

**Files:**
- Modify: `python/puyo_train/encoding.py`
- Create: `python/tests/test_canonicalize.py`

- [ ] **Step 1: Write the failing test**

Create `python/tests/test_canonicalize.py`:

```python
from puyo_train.encoding import canonicalize_colors


def _empty_field():
    return [["." for _ in range(6)] for _ in range(13)]


def _state(field=None, current=None, queue=None):
    return {
        "field": [
            [c if c in ("R", "B", "Y", "P") else None for c in row]
            for row in (field or _empty_field())
        ],
        "current": current,
        "next_queue": queue or [],
    }


def test_canonicalize_idempotent_on_empty():
    s = _state()
    out, perm = canonicalize_colors(s)
    assert perm == {}
    assert out["field"] == s["field"]


def test_canonicalize_uses_first_appearance_order_in_field():
    # bottom row left→right: Y first, then R
    field = _empty_field()
    field[12][0] = "Y"
    field[12][1] = "R"
    s = _state(field=field)
    out, perm = canonicalize_colors(s)
    # Y → canonical id 0 → label 'R', R → id 1 → label 'B'
    assert perm == {"Y": 0, "R": 1}
    assert out["field"][12][0] == "R"
    assert out["field"][12][1] == "B"


def test_canonicalize_continues_into_current_then_queue():
    field = _empty_field()
    field[12][0] = "B"  # B first → id 0
    s = _state(
        field=field,
        current={"axis": "Y", "child": "P", "axisRow": 1, "axisCol": 2, "rotation": 0},
        queue=[{"axis": "R", "child": "B"}],
    )
    out, perm = canonicalize_colors(s)
    # Order: B(field) → Y(curr.axis) → P(curr.child) → R(queue.axis); B reuses id 0
    assert perm == {"B": 0, "Y": 1, "P": 2, "R": 3}
    assert out["current"]["axis"] == "B"  # Y → 1 → 'B'
    assert out["current"]["child"] == "Y"  # P → 2 → 'Y'
    assert out["next_queue"][0]["axis"] == "P"  # R → 3 → 'P'
    assert out["next_queue"][0]["child"] == "R"  # B → 0 → 'R'


def test_canonicalize_idempotent_on_canonical_input():
    field = _empty_field()
    field[12][0] = "Y"
    field[12][1] = "R"
    s = _state(field=field)
    out1, _ = canonicalize_colors(s)
    out2, _ = canonicalize_colors(out1)
    assert out1 == out2
```

- [ ] **Step 2: Run the test, verify it fails**

```bash
cd python && source .venv/bin/activate && pytest tests/test_canonicalize.py -v
```

Expected: 4 errors / `ImportError: cannot import name 'canonicalize_colors'`.

- [ ] **Step 3: Implement `canonicalize_colors`**

Append to `python/puyo_train/encoding.py`:

```python
def canonicalize_colors(state: dict) -> tuple[dict, dict[str, int]]:
    """Renames colors so that they appear in canonical order (R, B, Y, P) by
    first-appearance scan: field bottom→top + left→right, then current.axis,
    current.child, next1.axis, next1.child, next2.axis, next2.child.

    Returns (canonical_state, perm) where perm maps original color → canonical id.
    """
    perm: dict[str, int] = {}

    def _see(c):
        if c is None or c not in ("R", "B", "Y", "P"):
            return
        if c not in perm and len(perm) < 4:
            perm[c] = len(perm)

    field = state["field"]
    for r in range(12, -1, -1):
        for c in range(6):
            _see(field[r][c])

    cur = state.get("current")
    if cur is not None:
        _see(cur.get("axis"))
        _see(cur.get("child"))
    for pair in state.get("next_queue", []):
        _see(pair.get("axis"))
        _see(pair.get("child"))

    def _remap(c):
        if c is None or c not in perm:
            return c
        return COLOR_ORDER[perm[c]]

    canon_field = [[_remap(c) for c in row] for row in field]
    canon_state = {
        "field": canon_field,
        "current": (
            None
            if cur is None
            else {**cur, "axis": _remap(cur.get("axis")), "child": _remap(cur.get("child"))}
        ),
        "next_queue": [
            {**p, "axis": _remap(p.get("axis")), "child": _remap(p.get("child"))}
            for p in state.get("next_queue", [])
        ],
    }
    return canon_state, perm
```

- [ ] **Step 4: Run the test, verify it passes**

```bash
pytest tests/test_canonicalize.py -v
```

Expected: 4 passed.

- [ ] **Step 5: Commit**

```bash
cd .. && git add python/puyo_train/encoding.py python/tests/test_canonicalize.py
git commit -m "feat(python): canonicalize_colors for color-symmetry normalization"
```

---

## Task 5: Python — encoding 11ch

**Files:**
- Modify: `python/puyo_train/encoding.py`
- Modify: `python/tests/test_encoding.py`

- [ ] **Step 1: Update `BOARD_CHANNELS` and `encode_state`**

In `python/puyo_train/encoding.py`, change `BOARD_CHANNELS = 7` → `BOARD_CHANNELS = 11`.

Replace the `encode_state` function with:

```python
def encode_state(state: dict) -> tuple[np.ndarray, np.ndarray, np.ndarray]:
    """state = {"field": [[color or None]], "current": {...}, "next_queue": [{...}]}

    Apply color canonicalization first, then build an 11ch board tensor:
      ch 0..3  one-hot per canonical color
      ch 4     empty cell
      ch 5     axis color (broadcast across all cells, scaled to [0,1])
      ch 6     child color (broadcast, scaled)
      ch 7     column heightmap (height / 13, broadcast across that column)
      ch 8     same-color 4-connected mask (1 where the cell already belongs
               to a 4-connected same-color group, else 0)
      ch 9     ceiling-row-occupied flag for the column (broadcast)
      ch 10    danger-row (row 1) occupied flag for the column (broadcast)
    """
    canon_state, _perm = canonicalize_colors(state)

    board = np.zeros((ROWS, COLS, BOARD_CHANNELS), dtype=np.float32)
    field = canon_state["field"]
    for r in range(ROWS):
        for c in range(COLS):
            cell = field[r][c]
            if cell is None:
                board[r, c, 4] = 1.0
            else:
                board[r, c, _COLOR_INDEX[cell]] = 1.0

    current = canon_state.get("current")
    if current is not None:
        ax = _COLOR_INDEX[current["axis"]] / 3.0
        ch = _COLOR_INDEX[current["child"]] / 3.0
        board[:, :, 5] = ax
        board[:, :, 6] = ch

    # ch 7: heightmap per column
    heights = _column_heights(field)
    for c in range(COLS):
        board[:, c, 7] = heights[c] / float(ROWS)

    # ch 8: 4-connected mask
    mask = _four_connected_mask(field)
    for r in range(ROWS):
        for c in range(COLS):
            if mask[r][c]:
                board[r, c, 8] = 1.0

    # ch 9: ceiling occupancy (row 0)
    for c in range(COLS):
        if field[0][c] is not None:
            board[:, c, 9] = 1.0
    # ch 10: danger row occupancy (row 1)
    for c in range(COLS):
        if field[1][c] is not None:
            board[:, c, 10] = 1.0

    queue = np.zeros((QUEUE_DIM,), dtype=np.float32)
    nq = canon_state.get("next_queue", [])
    if len(nq) >= 1:
        n1 = nq[0]
        queue[_COLOR_INDEX[n1["axis"]]] = 1.0
        queue[4 + _COLOR_INDEX[n1["child"]]] = 1.0
    if len(nq) >= 2:
        n2 = nq[1]
        queue[8 + _COLOR_INDEX[n2["axis"]]] = 1.0
        queue[12 + _COLOR_INDEX[n2["child"]]] = 1.0

    legal = _legal_mask(field, current)
    return board, queue, legal


def _column_heights(field) -> list[int]:
    heights = [0] * COLS
    for c in range(COLS):
        for r in range(ROWS):
            if field[r][c] is not None:
                heights[c] = ROWS - r
                break
    return heights


def _four_connected_mask(field) -> list[list[bool]]:
    """Mark cells that already belong to a same-color group of size ≥ 4."""
    seen = [[False] * COLS for _ in range(ROWS)]
    out = [[False] * COLS for _ in range(ROWS)]
    for r in range(ROWS):
        for c in range(COLS):
            if seen[r][c] or field[r][c] is None:
                continue
            color = field[r][c]
            stack = [(r, c)]
            group = []
            while stack:
                y, x = stack.pop()
                if (
                    y < 0 or y >= ROWS or x < 0 or x >= COLS
                    or seen[y][x] or field[y][x] != color
                ):
                    continue
                seen[y][x] = True
                group.append((y, x))
                stack.extend([(y - 1, x), (y + 1, x), (y, x - 1), (y, x + 1)])
            if len(group) >= 4:
                for y, x in group:
                    out[y][x] = True
    return out
```

- [ ] **Step 2: Update existing encoding tests for the new shape**

Replace the body of `python/tests/test_encoding.py` with tests that target the 11ch shape. Read the existing file first to understand which tests exist:

```bash
cd python && cat tests/test_encoding.py
```

Then rewrite the file to:

```python
import numpy as np
from puyo_train.encoding import (
    BOARD_CHANNELS,
    BOARD_H,
    BOARD_W,
    QUEUE_DIM,
    encode_state,
)
# Note: BOARD_H / BOARD_W are not currently exported. If the test fails to
# import them, define them in encoding.py as ROWS / COLS aliases (already
# present), or change these imports to ROWS / COLS.


def _empty_field():
    return [[None] * 6 for _ in range(13)]


def _state(field=None, current=None, queue=None):
    return {
        "field": field or _empty_field(),
        "current": current,
        "next_queue": queue or [],
    }


def test_board_shape_is_11ch():
    s = _state(current={"axis": "R", "child": "B", "axisRow": 1, "axisCol": 2, "rotation": 0})
    board, queue, legal = encode_state(s)
    assert board.shape == (13, 6, 11)
    assert queue.shape == (16,)
    assert legal.shape == (22,)


def test_empty_cells_set_channel_4():
    s = _state(current={"axis": "R", "child": "R", "axisRow": 1, "axisCol": 2, "rotation": 0})
    board, _, _ = encode_state(s)
    # All 78 cells empty → ch 4 == 1
    assert np.all(board[:, :, 4] == 1.0)


def test_height_channel_reflects_column_heights():
    field = _empty_field()
    field[12][0] = "R"  # height 1 in col 0
    field[12][3] = "B"
    field[11][3] = "B"  # height 2 in col 3
    s = _state(field=field, current={"axis": "R", "child": "R", "axisRow": 1, "axisCol": 2, "rotation": 0})
    board, _, _ = encode_state(s)
    assert board[0, 0, 7] == 1.0 / 13.0  # col 0, height 1
    assert board[0, 3, 7] == 2.0 / 13.0  # col 3, height 2
    assert board[0, 1, 7] == 0.0  # col 1, height 0


def test_four_connected_mask():
    field = _empty_field()
    # Vertical 4-stack of canonicalized colour at col 0 rows 9..12
    for r in range(9, 13):
        field[r][0] = "R"
    s = _state(field=field, current={"axis": "B", "child": "B", "axisRow": 1, "axisCol": 2, "rotation": 0})
    board, _, _ = encode_state(s)
    for r in range(9, 13):
        assert board[r, 0, 8] == 1.0
    # Cells outside the group are 0
    assert board[8, 0, 8] == 0.0


def test_ceiling_and_danger_flags():
    field = _empty_field()
    field[0][1] = "R"  # ceiling row, col 1
    field[1][2] = "B"  # danger row, col 2
    s = _state(field=field, current={"axis": "R", "child": "R", "axisRow": 1, "axisCol": 2, "rotation": 0})
    board, _, _ = encode_state(s)
    assert np.all(board[:, 1, 9] == 1.0)
    assert np.all(board[:, 1, 10] == 0.0)  # row 1 of col 1 is empty
    assert np.all(board[:, 2, 10] == 1.0)


def test_color_canonicalization_applied():
    """Place Y in field, then current=(R, R). After canonicalize, Y→0(R), R→1(B).
    Channel 0 should mark the Y position, channel 5 (axis) should be B's id (1/3).
    """
    field = _empty_field()
    field[12][0] = "Y"
    s = _state(field=field, current={"axis": "R", "child": "R", "axisRow": 1, "axisCol": 2, "rotation": 0})
    board, _, _ = encode_state(s)
    # Y at field[12][0] becomes canonical 'R' (id 0)
    assert board[12, 0, 0] == 1.0
    # axis was R → canonical 'B' (id 1) → broadcast value 1/3
    assert np.allclose(board[:, :, 5], 1.0 / 3.0)
```

- [ ] **Step 3: Add `BOARD_H`/`BOARD_W` aliases if missing**

Append to the constants block at the top of `python/puyo_train/encoding.py` (after `COLS = 6`):

```python
BOARD_H = ROWS
BOARD_W = COLS
```

- [ ] **Step 4: Run encoding tests**

```bash
cd python && pytest tests/test_encoding.py -v
```

Expected: all tests pass. If a test fails because of an existing `test_encoding.py` test you didn't notice, restore that test alongside the new ones.

- [ ] **Step 5: Commit**

```bash
cd .. && git add python/puyo_train/encoding.py python/tests/test_encoding.py
git commit -m "feat(python): encoding 11ch (height/connected/ceiling/danger) + canonicalize"
```

---

## Task 6: Python — augmentation module

**Files:**
- Create: `python/puyo_train/augmentation.py`
- Create: `python/tests/test_augmentation.py`

- [ ] **Step 1: Write the failing test**

Create `python/tests/test_augmentation.py`:

```python
import numpy as np
from puyo_train.augmentation import (
    apply_lr_flip,
    apply_color_permutation,
    flip_action_index,
)


def test_flip_action_index_is_involution():
    for i in range(22):
        assert flip_action_index(flip_action_index(i)) == i


def test_flip_action_index_known_pairs():
    # rot 0, axis_col 0 ↔ rot 0, axis_col 5
    assert flip_action_index(0) == 5
    assert flip_action_index(5) == 0
    # rot 2, axis_col 1 ↔ rot 2, axis_col 4
    assert flip_action_index(7) == 10
    # rot 1, axis_col 0 ↔ rot 3, axis_col 5
    # rot 1 indices: 12..16 (col 0..4); rot 3 indices: 17..21 (col 1..5)
    # rot1 col 0 (index 12) ↔ rot3 col 5 (index 21)
    assert flip_action_index(12) == 21
    assert flip_action_index(21) == 12
    # rot1 col 4 (index 16) ↔ rot3 col 1 (index 17)
    assert flip_action_index(16) == 17


def test_apply_lr_flip_board_columns():
    board = np.zeros((13, 6, 11), dtype=np.float32)
    board[12, 0, 0] = 1.0  # mark col 0
    queue = np.zeros((16,), dtype=np.float32)
    target = np.zeros((22,), dtype=np.float32)
    target[0] = 1.0  # rot0 col 0
    fb, fq, ft = apply_lr_flip(board, queue, target)
    assert fb[12, 5, 0] == 1.0  # column 0 → 5
    assert fb[12, 0, 0] == 0.0
    assert ft[5] == 1.0  # action 0 → action 5
    assert ft[0] == 0.0


def test_apply_color_permutation_swaps_channels_and_queue():
    board = np.zeros((13, 6, 11), dtype=np.float32)
    board[12, 0, 0] = 1.0  # color 0
    board[12, 1, 1] = 1.0  # color 1
    queue = np.zeros((16,), dtype=np.float32)
    queue[0] = 1.0  # n1.axis = color 0
    queue[5] = 1.0  # n1.child = color 1
    target = np.zeros((22,), dtype=np.float32)
    target[3] = 1.0
    perm = (1, 0, 2, 3)  # swap colors 0 and 1
    fb, fq, ft = apply_color_permutation(board, queue, target, perm)
    # Channel 0 cell becomes channel 1
    assert fb[12, 0, 1] == 1.0
    assert fb[12, 0, 0] == 0.0
    # Queue index 0 ('n1.axis = color 0') becomes index 1 ('n1.axis = color 1')
    assert fq[1] == 1.0
    assert fq[0] == 0.0
    # action target unchanged
    assert ft[3] == 1.0
```

- [ ] **Step 2: Run the test, verify it fails**

```bash
cd python && pytest tests/test_augmentation.py -v
```

Expected: ImportError (`augmentation` module not found).

- [ ] **Step 3: Implement augmentation**

Create `python/puyo_train/augmentation.py`:

```python
"""Data augmentation for puyo distillation.

LR flip mirrors the field horizontally (col 0..5 → 5..0), and remaps actions
since rotations 1↔3 swap when the axis swings to the other side.

Color permutation reshuffles canonical colors 0..3, exploiting puyo's full
4-color symmetry. Combined with LR flip this gives 24×2 = 48× augmentation."""
from __future__ import annotations

import numpy as np

# Action layout (matches action.py):
#   0..5   rot 0, axis_col 0..5
#   6..11  rot 2, axis_col 0..5
#   12..16 rot 1, axis_col 0..4
#   17..21 rot 3, axis_col 1..5

def flip_action_index(i: int) -> int:
    if i < 6:
        return 5 - i
    if i < 12:
        return 6 + (5 - (i - 6))
    if i < 17:
        # rot 1, axis_col c → rot 3, axis_col 5-c. rot3 col v has index 17+(v-1).
        c = i - 12
        v = 5 - c
        return 17 + (v - 1)
    # rot 3, axis_col v (1..5) → rot 1, axis_col 5-v (0..4).
    v = (i - 17) + 1
    c = 5 - v
    return 12 + c


def apply_lr_flip(
    board: np.ndarray, queue: np.ndarray, policy: np.ndarray
) -> tuple[np.ndarray, np.ndarray, np.ndarray]:
    fb = board[:, ::-1, :].copy()  # mirror columns
    fq = queue.copy()  # queue is per-color one-hot, no spatial index to flip
    ft = np.zeros_like(policy)
    for i in range(policy.shape[0]):
        ft[flip_action_index(i)] = policy[i]
    return fb, fq, ft


def apply_color_permutation(
    board: np.ndarray,
    queue: np.ndarray,
    policy: np.ndarray,
    perm: tuple[int, int, int, int],
) -> tuple[np.ndarray, np.ndarray, np.ndarray]:
    """perm[i] = new index that color i should be mapped to."""
    assert len(perm) == 4 and sorted(perm) == [0, 1, 2, 3]
    fb = board.copy()
    # Permute color channels 0..3, leave 4..10 alone
    for old in range(4):
        fb[:, :, perm[old]] = board[:, :, old]
    # If old == new for some i, the above can clobber; recompute cleanly via
    # explicit gather:
    new = np.zeros_like(board)
    for old in range(4):
        new[:, :, perm[old]] = board[:, :, old]
    new[:, :, 4:] = board[:, :, 4:]
    fb = new

    # Queue layout: [n1.axis(4), n1.child(4), n2.axis(4), n2.child(4)]
    fq = np.zeros_like(queue)
    for block_start in (0, 4, 8, 12):
        for old in range(4):
            fq[block_start + perm[old]] = queue[block_start + old]

    return fb, fq, policy.copy()
```

- [ ] **Step 4: Run the test, verify it passes**

```bash
pytest tests/test_augmentation.py -v
```

Expected: 4 passed.

- [ ] **Step 5: Commit**

```bash
cd .. && git add python/puyo_train/augmentation.py python/tests/test_augmentation.py
git commit -m "feat(python): LR-flip + color-permutation augmentation"
```

---

## Task 7: Python — wire augmentation into training dataset

**Files:**
- Modify: `python/puyo_train/dataset_ama.py`
- Modify: `python/tests/test_dataset_ama.py`

- [ ] **Step 1: Read the current dataset to understand its structure**

```bash
cd python && cat puyo_train/dataset_ama.py
```

Identify the `__getitem__` and any wrapper that performs encoding.

- [ ] **Step 2: Add augmentation arguments + apply randomly per sample**

In `dataset_ama.py`:

1. Import the new helpers at the top:

```python
import random
from .augmentation import apply_lr_flip, apply_color_permutation
from itertools import permutations
```

2. Find the dataset class. Add `augment: bool = False` to its `__init__`. Store `self.augment = augment`.

3. In `__getitem__`, after the existing call that produces `(board, queue, soft_policy, value_target)`, insert:

```python
if self.augment:
    if random.random() < 0.5:
        board, queue, soft_policy = apply_lr_flip(board, queue, soft_policy)
    perm = random.choice(list(permutations((0, 1, 2, 3))))
    board, queue, soft_policy = apply_color_permutation(board, queue, soft_policy, perm)
```

4. In `load_all`, add `augment: bool = False` to the signature and forward it to the constructor.

- [ ] **Step 3: Add a test that confirms augmentation does not produce NaN / shape mismatch**

Append to `python/tests/test_dataset_ama.py`:

```python
def test_dataset_augmentation_preserves_shapes(tmp_path):
    """Smoke test: with augment=True, every sample still returns the right
    tensor shapes."""
    import json
    from puyo_train.dataset_ama import load_all

    sample = {
        "field": ["......"] * 13,
        "current_axis": "R", "current_child": "B",
        "next1_axis": "Y", "next1_child": "P",
        "next2_axis": "R", "next2_child": "R",
        "topk": [
            {"axisCol": 0, "rotation": 0, "score": 1000},
            {"axisCol": 1, "rotation": 0, "score": 500},
        ],
    }
    p = tmp_path / "x.jsonl"
    p.write_text(json.dumps(sample) + "\n")
    ds = load_all(tmp_path, temperature=20.0, augment=True)
    for _ in range(20):  # repeat to stress the random branches
        board, queue, policy, value = ds[0]
        assert board.shape == (13, 6, 11)
        assert queue.shape == (16,)
        assert policy.shape == (22,)
        assert value.shape == ()
```

- [ ] **Step 4: Run dataset tests**

```bash
pytest tests/test_dataset_ama.py -v
```

Expected: all green (existing + new).

- [ ] **Step 5: Commit**

```bash
cd .. && git add python/puyo_train/dataset_ama.py python/tests/test_dataset_ama.py
git commit -m "feat(python): apply LR-flip + color-permutation in dataset_ama"
```

---

## Task 8: Python — model_v2 wider input + extra blocks

**Files:**
- Modify: `python/puyo_train/model_v2.py`
- Modify: `python/tests/test_model_v2.py`

- [ ] **Step 1: Update model dims**

In `python/puyo_train/model_v2.py`, change:

```python
BOARD_C = 7      # → 11
BLOCKS = 8       # → 10
```

The full constants section becomes:

```python
class PolicyValueNetV2(nn.Module):
    BOARD_C = 11
    BOARD_H = 13
    BOARD_W = 6
    BLOCKS = 10
    CHANNELS = 64
```

No other change needed inside the class — `nn.Conv2d(BOARD_C, CHANNELS, …)` will pick up the new value.

- [ ] **Step 2: Update the existing model_v2 test**

In `python/tests/test_model_v2.py`, find any reference to `BOARD_C = 7` or input shape `(…, 7)` and update to 11. The forward-pass test should now use:

```python
board = torch.zeros((1, 13, 6, 11))
queue = torch.zeros((1, 16))
```

- [ ] **Step 3: Run model test**

```bash
cd python && pytest tests/test_model_v2.py -v
```

Expected: all green; forward returns `(policy_logits.shape == (1, 22), value.shape == (1,))`.

- [ ] **Step 4: Commit**

```bash
cd .. && git add python/puyo_train/model_v2.py python/tests/test_model_v2.py
git commit -m "feat(python): model_v2 board_c 7→11, blocks 8→10"
```

---

## Task 9: Python — distill defaults (T=20) + train_ama wires augment

**Files:**
- Modify: `python/puyo_train/distill.py`
- Modify: `python/train_ama.py`
- Modify: `python/tests/test_distill_smoke.py`

- [ ] **Step 1: Change distill default temperature 100 → 20**

In `python/puyo_train/distill.py`, find the `run_distillation` signature line `temperature: float = 100.0` and change to `temperature: float = 20.0`.

In the same file, find `load_all(data_dir, temperature=temperature)` and replace with `load_all(data_dir, temperature=temperature, augment=augment)`.

Add `augment: bool = True` to the `run_distillation` keyword arguments (right after `temperature`).

- [ ] **Step 2: Update `train_ama.py` to expose the augment flag and the new defaults**

Replace the body of `python/train_ama.py` with:

```python
from __future__ import annotations

import argparse
from pathlib import Path

from puyo_train.distill import run_distillation


def main() -> None:
    p = argparse.ArgumentParser()
    p.add_argument("--data", type=Path, default=Path("../data/ama-selfplay"))
    p.add_argument("--out", type=Path, default=Path("checkpoints/policy-ama-v2.pt"))
    p.add_argument("--epochs", type=int, default=30)
    p.add_argument("--batch", type=int, default=256)
    p.add_argument("--lr", type=float, default=1e-3)
    p.add_argument("--val", type=float, default=0.1)
    p.add_argument("--device", type=str, default="mps")
    p.add_argument("--temperature", type=float, default=20.0)
    p.add_argument("--no-augment", action="store_true")
    args = p.parse_args()

    run_distillation(
        data_dir=args.data,
        out_path=args.out,
        epochs=args.epochs,
        batch_size=args.batch,
        lr=args.lr,
        device=args.device,
        val_fraction=args.val,
        temperature=args.temperature,
        augment=not args.no_augment,
    )


if __name__ == "__main__":
    main()
```

- [ ] **Step 3: Run the distill smoke test**

```bash
cd python && pytest tests/test_distill_smoke.py -v
```

If the test passes a hard-coded `temperature=100` or no `augment` kwarg, leave the test as-is — `augment` defaults to `True`, `temperature` keyword is allowed. Update the test only if it fails because of a signature mismatch.

- [ ] **Step 4: Commit**

```bash
cd .. && git add python/puyo_train/distill.py python/train_ama.py python/tests/test_distill_smoke.py
git commit -m "feat(python): distill T=20 default, augment flag, train_ama → policy-ama-v2"
```

---

## Task 10: Train policy-ama-v2

**Files:**
- Generates: `python/checkpoints/policy-ama-v2.pt`

- [ ] **Step 1: Run training**

```bash
cd python && source .venv/bin/activate
python train_ama.py --device mps --epochs 30 --temperature 20.0
```

(Use `--device cpu` if MPS is unavailable. Training takes ~30–60 minutes on Apple Silicon for 30 epochs over the existing 44K dataset with augmentation.)

- [ ] **Step 2: Confirm checkpoint exists and the val_top1 trajectory looks healthy**

The script prints `epoch=N train=… val=… top1=…` per epoch. After it completes:

```bash
ls -la checkpoints/policy-ama-v2.pt
```

Expected: file ~5 MB, modified just now. `top1` should rise across epochs (typically 0.3 → 0.6+ on this dataset).

- [ ] **Step 3: Save training log**

Save the stdout to `data/eval-runs/train-2026-04-26.log`:

```bash
python train_ama.py --device mps --epochs 30 --temperature 20.0 \
  2>&1 | tee ../data/eval-runs/train-2026-04-26.log
```

(If you already ran step 1, just rerun for the log; checkpoints overwrite.)

- [ ] **Step 4: No commit** (checkpoints are gitignored under `python/checkpoints/`).

---

## Task 11: Export policy-ama-v2 to TF.js

**Files:**
- Modify (if needed): `python/puyo_train/export.py`
- Generates: `public/models/policy-ama-v2/{model.json, group1-shard*.bin}`

- [ ] **Step 1: Verify export.py handles the wider input**

```bash
cd python && grep -n "BOARD_C\|7\|11\|input" puyo_train/export.py
```

If the script hard-codes board channels = 7 anywhere, change to `model.BOARD_C` (preferred) or 11.

- [ ] **Step 2: Run the export**

```bash
python -m puyo_train.export --ckpt checkpoints/policy-ama-v2.pt --out ../public/models/policy-ama-v2
```

- [ ] **Step 3: Verify outputs**

```bash
cd .. && ls public/models/policy-ama-v2/
```

Expected: `model.json`, one or more `group1-shard*.bin`.

- [ ] **Step 4: Commit the model artifacts**

```bash
git add public/models/policy-ama-v2/
git commit -m "feat(model): export policy-ama-v2 (11ch + 10 blocks)"
```

---

## Task 12: TS — encoding 11ch + canonicalize

**Files:**
- Modify: `src/ai/ml/encoding.ts`
- Modify: `src/ai/ml/__tests__/encoding.test.ts`
- Create: `src/ai/ml/__tests__/canonicalize.test.ts`

- [ ] **Step 1: Read the existing TS encoding for context**

```bash
cat src/ai/ml/encoding.ts
```

- [ ] **Step 2: Write a TS canonicalize test that mirrors Python**

Create `src/ai/ml/__tests__/canonicalize.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { canonicalizeColors } from '../encoding';
import { ROWS, COLS } from '../../../game/constants';
import type { Color } from '../../../game/types';

function emptyField(): (Color | null)[][] {
  return Array.from({ length: ROWS }, () => Array<Color | null>(COLS).fill(null));
}

describe('canonicalizeColors', () => {
  it('is a no-op on empty state', () => {
    const state = {
      field: { cells: emptyField() },
      current: null,
      nextQueue: [],
    };
    const { canonical, perm } = canonicalizeColors(state as any);
    expect(perm).toEqual({});
    expect(canonical.field.cells).toEqual(state.field.cells);
  });

  it('renames first-seen field color to R', () => {
    const cells = emptyField();
    cells[12]![0] = 'Y';
    cells[12]![1] = 'R';
    const state = {
      field: { cells },
      current: null,
      nextQueue: [],
    };
    const { canonical, perm } = canonicalizeColors(state as any);
    expect(perm).toEqual({ Y: 0, R: 1 });
    expect(canonical.field.cells[12]![0]).toBe('R');
    expect(canonical.field.cells[12]![1]).toBe('B');
  });

  it('continues into current then queue', () => {
    const cells = emptyField();
    cells[12]![0] = 'B';
    const state = {
      field: { cells },
      current: { pair: { axis: 'Y', child: 'P' }, axisRow: 1, axisCol: 2, rotation: 0 },
      nextQueue: [{ axis: 'R', child: 'B' }],
    };
    const { canonical, perm } = canonicalizeColors(state as any);
    expect(perm).toEqual({ B: 0, Y: 1, P: 2, R: 3 });
    expect(canonical.current!.pair.axis).toBe('B'); // Y → B
    expect(canonical.current!.pair.child).toBe('Y'); // P → Y
    expect(canonical.nextQueue[0]!.axis).toBe('P'); // R → P
    expect(canonical.nextQueue[0]!.child).toBe('R'); // B → R
  });
});
```

- [ ] **Step 3: Implement canonicalize + 11ch encoding in TS**

Replace `src/ai/ml/encoding.ts` with (read the original first to keep helper exports the worker depends on):

```ts
import { ROWS, COLS } from '../../game/constants';
import type { Color, GameState, Pair } from '../../game/types';
import { ACTION_COUNT, actionIndexToMove } from '../../game/action';

export const BOARD_CHANNELS = 11;
export const QUEUE_DIM = 16;
const COLOR_ORDER: Color[] = ['R', 'B', 'Y', 'P'];
const COLOR_INDEX: Record<Color, number> = { R: 0, B: 1, Y: 2, P: 3 };

interface CanonState {
  field: { cells: (Color | null)[][] };
  current: GameState['current'];
  nextQueue: Pair[];
}

export function canonicalizeColors(state: GameState): {
  canonical: CanonState;
  perm: Partial<Record<Color, number>>;
} {
  const perm: Partial<Record<Color, number>> = {};
  const see = (c: Color | null | undefined) => {
    if (c == null) return;
    if (perm[c] === undefined && Object.keys(perm).length < 4) {
      perm[c] = Object.keys(perm).length;
    }
  };

  const cells = state.field.cells as readonly (readonly (Color | null)[])[];
  for (let r = ROWS - 1; r >= 0; r--) {
    for (let c = 0; c < COLS; c++) see(cells[r]![c]);
  }
  if (state.current) {
    see(state.current.pair.axis);
    see(state.current.pair.child);
  }
  for (const p of state.nextQueue) {
    see(p.axis);
    see(p.child);
  }

  const remap = (c: Color | null | undefined): Color | null => {
    if (c == null) return null;
    const id = perm[c];
    return id === undefined ? c : COLOR_ORDER[id]!;
  };

  const canonField: (Color | null)[][] = cells.map((row) =>
    row.map((c) => remap(c)),
  );
  const canonCurrent = state.current
    ? {
        ...state.current,
        pair: {
          axis: remap(state.current.pair.axis)!,
          child: remap(state.current.pair.child)!,
        },
      }
    : null;
  const canonQueue: Pair[] = state.nextQueue.map((p) => ({
    axis: remap(p.axis)!,
    child: remap(p.child)!,
  }));

  return {
    canonical: {
      field: { cells: canonField },
      current: canonCurrent,
      nextQueue: canonQueue,
    },
    perm,
  };
}

export function encodeState(state: GameState): {
  board: Float32Array;
  queue: Float32Array;
  legalMask: Uint8Array;
} {
  const { canonical } = canonicalizeColors(state);
  const board = new Float32Array(ROWS * COLS * BOARD_CHANNELS);
  const cellIdx = (r: number, c: number, ch: number) =>
    r * COLS * BOARD_CHANNELS + c * BOARD_CHANNELS + ch;

  // ch 0..3 + ch 4 (empty)
  for (let r = 0; r < ROWS; r++) {
    for (let c = 0; c < COLS; c++) {
      const v = canonical.field.cells[r]![c];
      if (v == null) {
        board[cellIdx(r, c, 4)] = 1;
      } else {
        board[cellIdx(r, c, COLOR_INDEX[v])] = 1;
      }
    }
  }

  // ch 5/6: axis/child broadcast
  if (canonical.current) {
    const ax = COLOR_INDEX[canonical.current.pair.axis] / 3;
    const ch = COLOR_INDEX[canonical.current.pair.child] / 3;
    for (let r = 0; r < ROWS; r++) {
      for (let c = 0; c < COLS; c++) {
        board[cellIdx(r, c, 5)] = ax;
        board[cellIdx(r, c, 6)] = ch;
      }
    }
  }

  // ch 7: heightmap
  const heights = new Array<number>(COLS).fill(0);
  for (let c = 0; c < COLS; c++) {
    for (let r = 0; r < ROWS; r++) {
      if (canonical.field.cells[r]![c] != null) {
        heights[c] = ROWS - r;
        break;
      }
    }
    for (let r = 0; r < ROWS; r++) board[cellIdx(r, c, 7)] = heights[c]! / ROWS;
  }

  // ch 8: 4-connected mask
  const mask = fourConnectedMask(canonical.field.cells);
  for (let r = 0; r < ROWS; r++) {
    for (let c = 0; c < COLS; c++) {
      if (mask[r]![c]) board[cellIdx(r, c, 8)] = 1;
    }
  }

  // ch 9 / 10: ceiling and danger occupancy per column
  for (let c = 0; c < COLS; c++) {
    if (canonical.field.cells[0]![c] != null) {
      for (let r = 0; r < ROWS; r++) board[cellIdx(r, c, 9)] = 1;
    }
    if (canonical.field.cells[1]![c] != null) {
      for (let r = 0; r < ROWS; r++) board[cellIdx(r, c, 10)] = 1;
    }
  }

  // queue
  const queue = new Float32Array(QUEUE_DIM);
  if (canonical.nextQueue.length >= 1) {
    const n1 = canonical.nextQueue[0]!;
    queue[COLOR_INDEX[n1.axis]] = 1;
    queue[4 + COLOR_INDEX[n1.child]] = 1;
  }
  if (canonical.nextQueue.length >= 2) {
    const n2 = canonical.nextQueue[1]!;
    queue[8 + COLOR_INDEX[n2.axis]] = 1;
    queue[12 + COLOR_INDEX[n2.child]] = 1;
  }

  // legal mask (depends on board cols only, current pair shape)
  const legalMask = new Uint8Array(ACTION_COUNT);
  if (canonical.current) {
    for (let i = 0; i < ACTION_COUNT; i++) {
      const m = actionIndexToMove(i);
      const dc = m.rotation === 1 ? 1 : m.rotation === 3 ? -1 : 0;
      if (m.axisCol >= 0 && m.axisCol < COLS && m.axisCol + dc >= 0 && m.axisCol + dc < COLS) {
        legalMask[i] = 1;
      }
    }
  }

  return { board, queue, legalMask };
}

function fourConnectedMask(cells: readonly (readonly (Color | null)[])[]): boolean[][] {
  const seen: boolean[][] = Array.from({ length: ROWS }, () =>
    Array<boolean>(COLS).fill(false),
  );
  const out: boolean[][] = Array.from({ length: ROWS }, () =>
    Array<boolean>(COLS).fill(false),
  );
  for (let r = 0; r < ROWS; r++) {
    for (let c = 0; c < COLS; c++) {
      if (seen[r]![c] || cells[r]![c] == null) continue;
      const color = cells[r]![c]!;
      const stack: [number, number][] = [[r, c]];
      const group: [number, number][] = [];
      while (stack.length) {
        const [y, x] = stack.pop()!;
        if (y < 0 || y >= ROWS || x < 0 || x >= COLS) continue;
        if (seen[y]![x] || cells[y]![x] !== color) continue;
        seen[y]![x] = true;
        group.push([y, x]);
        stack.push([y - 1, x], [y + 1, x], [y, x - 1], [y, x + 1]);
      }
      if (group.length >= 4) for (const [y, x] of group) out[y]![x] = true;
    }
  }
  return out;
}
```

- [ ] **Step 4: Update existing encoding tests for the new shape**

Edit `src/ai/ml/__tests__/encoding.test.ts`. Read it first; replace any references to `BOARD_CHANNELS = 7`/`shape (..., 7)` with 11. The shape assertion must read:

```ts
expect(board.length).toBe(13 * 6 * 11);
```

- [ ] **Step 5: Run the TS tests**

```bash
npm test -- src/ai/ml/__tests__/canonicalize.test.ts src/ai/ml/__tests__/encoding.test.ts
```

Expected: all green.

- [ ] **Step 6: Commit**

```bash
git add src/ai/ml/encoding.ts src/ai/ml/__tests__/encoding.test.ts src/ai/ml/__tests__/canonicalize.test.ts
git commit -m "feat(ts): encoding 11ch + canonicalize, mirrors python"
```

---

## Task 13: TS — search engine `ml-search-ai.ts`

**Files:**
- Create: `src/ai/ml/ml-search-ai.ts`
- Create: `src/ai/ml/__tests__/ml-search-ai.test.ts`
- Modify: `scripts/ml-ai-node.ts` (add `createNodeMlSearchAI`)

This is the largest task — it implements the K=6 expectimax with chance node and batched NN inference.

- [ ] **Step 1: Inspect the simulator to find what we need to advance state by a hypothetical move**

```bash
grep -n "applyMoveToField\|simulateChain\|applyMove\b" src/game/state.ts src/game/*.ts
```

You need a function that takes `(field, currentPair, move)` and returns `(nextField, scoreDelta, totalChainsDelta, maxChainDelta, gameover)`. If `commitMove` exists and does this, prefer reusing it.

- [ ] **Step 2: Write a sanity test for the search AI**

Create `src/ai/ml/__tests__/ml-search-ai.test.ts`:

```ts
import { describe, it, expect, beforeAll } from 'vitest';
import { createInitialState } from '../../../game/state';

// The search AI needs the trained model. If model.json is missing this
// test is skipped — the model is produced by Python training.
import { existsSync } from 'node:fs';

const MODEL_OK = existsSync('public/models/policy-ama-v2/model.json');

describe.runIf(MODEL_OK)('MlSearchAI', () => {
  let ai: any;

  beforeAll(async () => {
    const { MlSearchAI } = await import('../ml-search-ai');
    ai = new MlSearchAI({ modelUrl: '/models/policy-ama-v2/model.json', K: 6 });
    await ai.init();
  }, 60_000);

  it('returns one legal move on the empty board', async () => {
    const state = createInitialState(7);
    const moves = await ai.suggest(state, 1);
    expect(moves.length).toBe(1);
    expect(moves[0].axisCol).toBeGreaterThanOrEqual(0);
    expect(moves[0].axisCol).toBeLessThanOrEqual(5);
  }, 30_000);
});
```

- [ ] **Step 3: Implement the search AI**

Create `src/ai/ml/ml-search-ai.ts`:

```ts
import type { PuyoAI } from '../types';
import type { GameState, Move, Color, Rotation } from '../../game/types';
import { encodeState, BOARD_CHANNELS, QUEUE_DIM } from './encoding';
import { actionIndexToMove, ACTION_COUNT } from '../../game/action';
import { commitMove } from '../../game/state';
import { ROWS, COLS } from '../../game/constants';

interface TfNS {
  loadGraphModel(url: string): Promise<unknown>;
  tensor(data: Float32Array | number[], shape: number[]): {
    dispose(): void;
  };
  zeros(shape: number[]): { dispose(): void };
  concat(tensors: any[], axis: number): any;
}

interface TfModel {
  predict(inputs: any): any;
  dispose(): void;
}

const SAME_COLOR_PAIRS: Array<[Color, Color]> = [
  ['R', 'R'], // canonical color 0,0
];
const DIFF_COLOR_PAIRS: Array<[Color, Color]> = [
  ['R', 'B'], // canonical 0,1
];
const CHANCE_BRANCHES: Array<{ pair: [Color, Color]; weight: number }> = [
  { pair: SAME_COLOR_PAIRS[0]!, weight: 0.25 },
  { pair: DIFF_COLOR_PAIRS[0]!, weight: 0.75 },
];

export interface MlSearchOpts {
  modelUrl: string;
  K?: number; // beam width per ply
  // For node-side use, allow injecting a tfjs module so the search runs in Node.
  tf?: TfNS;
  modelLoader?: (url: string) => Promise<TfModel>;
}

interface NodeWithState {
  state: GameState;
  scoreSoFar: number;
  isTerminal: boolean;
}

export class MlSearchAI implements PuyoAI {
  readonly name = 'ml-search';
  readonly version: string;
  private model: TfModel | null = null;
  private tf: TfNS | null = null;
  private readonly K: number;
  private readonly opts: MlSearchOpts;

  constructor(opts: MlSearchOpts) {
    this.opts = opts;
    this.K = opts.K ?? 6;
    this.version = `policy-ama-v2-search-K${this.K}`;
  }

  async init(): Promise<void> {
    if (this.model) return;
    if (this.opts.tf && this.opts.modelLoader) {
      this.tf = this.opts.tf;
      this.model = await this.opts.modelLoader(this.opts.modelUrl);
    } else {
      const mod = await import('@tensorflow/tfjs');
      this.tf = mod as unknown as TfNS;
      this.model = (await mod.loadGraphModel(this.opts.modelUrl)) as unknown as TfModel;
    }
  }

  async suggest(state: GameState, topK: number): Promise<Move[]> {
    await this.init();
    if (!state.current) return [];

    // Depth 1: from root, evaluate all 22 legal placements via policy. Pick top-K.
    const rootCands = await this.expand(state);
    if (rootCands.length === 0) return [];

    // Depth 2..3 + chance: build out the tree, then evaluate leaves in one batch.
    const scored: Array<{ move: Move; expValue: number }> = [];
    for (const r1 of rootCands) {
      const next1 = applyMove(state, r1.move);
      if (next1.isTerminal) {
        scored.push({ move: r1.move, expValue: -1 + next1.scoreSoFar / 50000 });
        continue;
      }
      const cand2 = await this.expand(next1.state);
      let bestChild = -Infinity;
      for (const r2 of cand2) {
        const next2 = applyMove(next1.state, r2.move);
        if (next2.isTerminal) {
          bestChild = Math.max(bestChild, -1 + next2.scoreSoFar / 50000);
          continue;
        }
        const cand3 = await this.expand(next2.state);
        let bestGrand = -Infinity;
        for (const r3 of cand3) {
          const next3 = applyMove(next2.state, r3.move);
          // chance node at depth 4
          let expV = 0;
          for (const ch of CHANCE_BRANCHES) {
            const stateAtChance = withReplacedNextPair(next3.state, ch.pair);
            const v = await this.evalLeaf(stateAtChance);
            expV += ch.weight * v;
          }
          bestGrand = Math.max(bestGrand, expV + next3.scoreSoFar / 50000);
        }
        bestChild = Math.max(bestChild, bestGrand);
      }
      scored.push({ move: r1.move, expValue: bestChild + next1.scoreSoFar / 50000 });
    }

    scored.sort((a, b) => b.expValue - a.expValue);
    return scored.slice(0, topK).map((s) => ({ ...s.move, score: Math.round(s.expValue * 50000) }));
  }

  // Run one forward pass; return policy logits (22) and value (scalar).
  private async forward(state: GameState): Promise<{ policy: Float32Array; value: number }> {
    const { board, queue } = encodeState(state);
    const tf = this.tf!;
    const b = tf.tensor(board, [1, ROWS, COLS, BOARD_CHANNELS]);
    const q = tf.tensor(queue, [1, QUEUE_DIM]);
    const out = (this.model!.predict([b, q]) as unknown as Array<{
      size: number;
      data(): Promise<Float32Array>;
      dispose(): void;
    }>);
    const policyT = out.find((t) => t.size === ACTION_COUNT)!;
    const valueT = out.find((t) => t.size === 1)!;
    const [pol, val] = await Promise.all([policyT.data(), valueT.data()]);
    (b as any).dispose();
    (q as any).dispose();
    for (const t of out) t.dispose();
    return { policy: pol, value: val[0] ?? 0 };
  }

  private async evalLeaf(state: GameState): Promise<number> {
    const { value } = await this.forward(state);
    return value;
  }

  // Expand a state: compute policy, return top-K legal moves in descending order.
  private async expand(state: GameState): Promise<Array<{ move: Move; logit: number }>> {
    if (!state.current) return [];
    const { policy } = await this.forward(state);
    const { legalMask } = encodeState(state);
    const cands: Array<{ move: Move; logit: number }> = [];
    for (let i = 0; i < ACTION_COUNT; i++) {
      if (!legalMask[i]) continue;
      const m = actionIndexToMove(i);
      cands.push({
        move: { axisCol: m.axisCol, rotation: m.rotation as Rotation },
        logit: policy[i] ?? -Infinity,
      });
    }
    cands.sort((a, b) => b.logit - a.logit);
    return cands.slice(0, this.K);
  }
}

function applyMove(state: GameState, move: Move): { state: GameState; scoreSoFar: number; isTerminal: boolean } {
  const next = commitMove(state, move);
  return {
    state: next,
    scoreSoFar: next.score - state.score,
    isTerminal: next.status === 'gameover' || !next.current,
  };
}

function withReplacedNextPair(state: GameState, pair: [Color, Color]): GameState {
  // After three deterministic moves, the "next2" position is the upcoming
  // unknown pair. Patch the state's nextQueue so the value head sees the
  // chance-node sample as if it had appeared.
  const nq = state.nextQueue.slice();
  if (nq.length === 0) return state;
  // The chance branch represents the new pair entering next2.
  const replaced: any = { axis: pair[0], child: pair[1] };
  if (nq.length >= 2) nq[1] = replaced;
  else nq.push(replaced);
  return { ...state, nextQueue: nq };
}
```

- [ ] **Step 4: Add `createNodeMlSearchAI` factory for the eval harness**

Read the existing `scripts/ml-ai-node.ts`:

```bash
cat scripts/ml-ai-node.ts
```

Append (or modify) to add:

```ts
import { MlSearchAI } from '../src/ai/ml/ml-search-ai';

export async function createNodeMlSearchAI(modelJsonPath: string) {
  // Use the same node-tf wrapper used by createNodeMlAI for graph loading.
  // Construct the search wrapper around it.
  const tf = await import('@tensorflow/tfjs-node');
  const ai = new MlSearchAI({
    modelUrl: `file://${modelJsonPath}`,
    K: 6,
    tf: tf as any,
    modelLoader: async (url) => (await tf.loadGraphModel(url)) as any,
  });
  await ai.init();
  return ai;
}
```

- [ ] **Step 5: Run sanity test**

```bash
npm test -- src/ai/ml/__tests__/ml-search-ai.test.ts
```

If model.json is missing, the suite is skipped (`describe.runIf`). To run end-to-end you need Task 11 to have produced the model. If it has, you should see 1 passed.

- [ ] **Step 6: Commit**

```bash
git add src/ai/ml/ml-search-ai.ts src/ai/ml/__tests__/ml-search-ai.test.ts scripts/ml-ai-node.ts
git commit -m "feat(ai): K=6 expectimax search engine + chance node + node factory"
```

---

## Task 14: TS — rename `ml-ai.ts` → `ml-policy-ai.ts`, register new AiKind

**Files:**
- Rename: `src/ai/ml/ml-ai.ts` → `src/ai/ml/ml-policy-ai.ts`
- Modify: `src/ai/types.ts`
- Modify: `src/ai/worker/ai.worker.ts`
- Modify: `src/ai/ml/__tests__/ml-ai.test.ts` (rename + update import)

- [ ] **Step 1: Rename + grep for usages**

```bash
git mv src/ai/ml/ml-ai.ts src/ai/ml/ml-policy-ai.ts
git mv src/ai/ml/__tests__/ml-ai.test.ts src/ai/ml/__tests__/ml-policy-ai.test.ts
grep -rn "from.*ml/ml-ai" src/ scripts/
```

Update all imports to `ml/ml-policy-ai`.

- [ ] **Step 2: Add the new kind to `AiKind`**

In `src/ai/types.ts`:

```ts
export type AiKind = 'heuristic' | 'ml-v1' | 'ml-ama-v1' | 'ml-ama-v2-search' | 'ama-wasm';
```

- [ ] **Step 3: Wire the new kind in the worker**

In `src/ai/worker/ai.worker.ts`, alongside the existing `mlInstances` block, add:

```ts
import { MlSearchAI } from '../ml/ml-search-ai';
let mlSearchInstance: MlSearchAI | null = null;

async function getOrInitMlSearch(): Promise<MlSearchAI> {
  if (!mlSearchInstance) {
    mlSearchInstance = new MlSearchAI({
      modelUrl: '/models/policy-ama-v2/model.json',
      K: 6,
    });
  }
  await mlSearchInstance.init();
  return mlSearchInstance;
}
```

In the `set-ai` dispatch, add a branch:

```ts
if (msg.kind === 'ml-ama-v2-search') {
  active = await getOrInitMlSearch();
  send({ type: 'set-ai', kind: 'ml-ama-v2-search', ok: true });
  return;
}
```

(Keep the existing `'ama-wasm'` branch and the ml/heuristic branches intact.)

- [ ] **Step 4: Update Header selector**

In `src/ui/components/Header/Header.tsx`, find the `<select aria-label="AI">` block and add an option:

```tsx
<option value="ml-ama-v2-search">ML (ama-v2 + search)</option>
```

Add `'ml-ama-v2-search'` to the `VALID` array near the top of the file.

- [ ] **Step 5: Run vitest, fix any breakage from the rename**

```bash
npm test 2>&1 | tail -30
```

If any test still imports `../ml/ml-ai`, fix it.

- [ ] **Step 6: Commit**

```bash
git add src/ai/ml/ml-policy-ai.ts src/ai/ml/__tests__/ml-policy-ai.test.ts src/ai/types.ts src/ai/worker/ai.worker.ts src/ui/components/Header/Header.tsx
git commit -m "feat: register ml-ama-v2-search kind, rename ml-ai → ml-policy-ai"
```

---

## Task 15: Final eval — measure new model

**Files:**
- Generates: `data/eval-runs/v2-search-2026-04-26.json`
- Modify: `docs/superpowers/progress/2026-04-26-ml-search-baseline.md`

- [ ] **Step 1: Run the eval against ama-wasm baseline**

```bash
npm run eval -- \
  --preset standard \
  --ai ml-ama-v1 \
  --ai ml-ama-v2-search \
  --ai ama-wasm \
  --baseline ama-wasm \
  --out data/eval-runs/v2-search-2026-04-26.json
```

Expect this to take longer than the baseline because each ml-ama-v2-search turn runs ~475 NN forward passes. Up to 20 s per turn × 200+ turns × 20 seeds is theoretically over an hour, but in practice batching is faster. If runtime balloons past 1 hour, lower `--max-moves` to 200 for a first read.

- [ ] **Step 2: Update the baseline doc with v2-search numbers**

Append to `docs/superpowers/progress/2026-04-26-ml-search-baseline.md`:

```markdown

## v2-search (2026-04-26)

| AI | avg score | avg maxChain | avg score / ama |
| --- | --- | --- | --- |
| ml-ama-v2-search | <fill in> | <fill in> | <fill in> |

**KPI check** (per spec §1.2):

- avg score / ama ≥ 0.50: <met / not met>
- avg maxChain / ama ≥ 0.70: <met / not met>
- avg score > ml-ama-v1 (no regression): <met / not met>
```

- [ ] **Step 3: Decide next step per spec §1.4**

If KPI met → done. If 0.3 ≤ ratio < 0.5 → write `docs/superpowers/specs/2026-04-27-ml-search-followup-design.md` and brainstorm value-target rework. If < 0.3 → flag the spec as needing rework.

- [ ] **Step 4: Commit results doc**

```bash
git add docs/superpowers/progress/2026-04-26-ml-search-baseline.md
git commit -m "docs(progress): record ml-ama-v2-search KPI vs ama"
```

---

## Final Steps

- [ ] **Run the full test suite**

```bash
npm test 2>&1 | tail -15
cd python && pytest -v 2>&1 | tail -15 && cd ..
```

Expect both green (some tests may be skipped if model artifacts are absent).

- [ ] **Run the production build**

```bash
npm run build 2>&1 | tail -10
```

Confirm `dist/` is produced and PWA precache includes `models/policy-ama-v2/`.

- [ ] **Optional: commit the merged feature**

If the worker pattern was for a single feature commit, all per-task commits already exist on the branch. No additional commit needed.

---

## Notes for the executing engineer

- The Python training (Task 10) is the longest single step and runs offline — start it as soon as Task 9 lands so it finishes by the time Tasks 11-13 are ready.
- TS encoding (Task 12) MUST match Python encoding (Task 5) byte-for-byte for the trained model to interpret board state correctly. If the search AI returns nonsense, suspect this first.
- The chance-node simplification (2 reps) is a deliberate approximation. It exists in `CHANCE_BRANCHES` near the top of `ml-search-ai.ts`; expanding to 16 reps is a one-liner if eval shows it matters.
- If `applyMoveToField` in the simulator does not exist as a pure function, fall back to using `commitMove` (which already plays out chains and gravity); the search treats the resulting state as the next ply.
