# Value Target Rework — B 案 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Switch the value-head training signal from per-game `final_score` to per-position `topk[0].score`, retrain as `policy-ama-v3`, wire it through inference/eval, and judge whether the KPI moves above 0.30 (per spec §1.3).

**Architecture:** Single-axis change to the distillation pipeline (data loader picks a different field for the value target) with a parallel checkpoint name (`policy-ama-v3`) so v2 stays reproducible. No model architecture, augmentation, or training-loop changes.

**Tech Stack:** Python 3.11 + PyTorch + ONNX/onnx2tf + tensorflowjs (training/export); TypeScript + Tensorflow.js + Tensorflow.js-node (inference/eval); pytest + vitest.

**Spec:** `docs/superpowers/specs/2026-04-26-value-target-rework-design.md`

---

## Pre-flight

All commands assume cwd = `/Users/yasumitsuomori/git/puyo-simulator/.worktrees/puyo-mvp`.

Python work assumes the venv is active:

```bash
cd python && source .venv/bin/activate
```

Existing code state at start of this plan (commit `53823df`):
- `python/puyo_train/dataset_ama.py` exports `VALUE_SCALE = 50000.0`, `value_target_from_score(score)` (no scale arg), `AmaDataset(__init__: paths, temperature, augment)`, `load_all(data_dir, temperature, augment)`.
- `python/puyo_train/distill.py` `run_distillation(... temperature=20.0, augment=True ...)` calls `load_all(data_dir, temperature=temperature, augment=augment)`.
- `python/train_ama.py` exposes `--temperature`, `--no-augment`, `--out` defaulting to `policy-ama-v2.pt`.
- `scripts/eval-ai.ts` `makeAi` already supports `'ml-ama-v2-search'`. Add `'ml-ama-v3-search'` and a parallel branch.
- `src/ai/types.ts` `AiKind` includes `'ml-ama-v2-search'`. Add `'ml-ama-v3-search'`.

---

## Task 1: `value_target_from_score` accepts a `scale` argument

**Files:**
- Modify: `python/puyo_train/dataset_ama.py`
- Modify: `python/tests/test_dataset_ama.py`

- [ ] **Step 1: Write the failing test**

Append to `python/tests/test_dataset_ama.py`:

```python
def test_value_target_from_score_uses_scale():
    """value_target_from_score must accept a scale parameter; default
    scale=50000 preserves backward compat (v2 reproducibility)."""
    from puyo_train.dataset_ama import value_target_from_score
    import math

    # Default scale = 50000
    assert math.isclose(value_target_from_score(50000.0), math.tanh(1.0), abs_tol=1e-6)
    # Custom scale = 200000 (used by v3 with topk score)
    assert math.isclose(
        value_target_from_score(200000.0, scale=200000.0),
        math.tanh(1.0),
        abs_tol=1e-6,
    )
    # Same input, different scale → different output
    a = value_target_from_score(100000.0)  # default 50000
    b = value_target_from_score(100000.0, scale=200000.0)
    assert a != b
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd python && source .venv/bin/activate && pytest tests/test_dataset_ama.py::test_value_target_from_score_uses_scale -v`
Expected: FAIL with `TypeError: value_target_from_score() got an unexpected keyword argument 'scale'` or similar.

- [ ] **Step 3: Add the `scale` argument**

In `python/puyo_train/dataset_ama.py`, replace:

```python
def value_target_from_score(score: float) -> float:
    return float(math.tanh(score / VALUE_SCALE))
```

with:

```python
def value_target_from_score(score: float, scale: float = VALUE_SCALE) -> float:
    return float(math.tanh(score / scale))
```

Keep `VALUE_SCALE = 50000.0` unchanged (it stays the default).

- [ ] **Step 4: Run test to verify it passes**

Run: `pytest tests/test_dataset_ama.py::test_value_target_from_score_uses_scale -v`
Expected: PASS.

- [ ] **Step 5: Run the full dataset_ama test file to confirm no regression**

Run: `pytest tests/test_dataset_ama.py -v`
Expected: all existing tests still pass (the `scale` default preserves prior behavior).

- [ ] **Step 6: Commit**

```bash
cd /Users/yasumitsuomori/git/puyo-simulator/.worktrees/puyo-mvp
git add python/puyo_train/dataset_ama.py python/tests/test_dataset_ama.py
git commit -m "feat(python): value_target_from_score accepts scale arg (default unchanged)"
```

---

## Task 2: AmaDataset / `load_all` accept `value_source`

**Files:**
- Modify: `python/puyo_train/dataset_ama.py`
- Modify: `python/tests/test_dataset_ama.py`

- [ ] **Step 1: Write the failing test**

Append to `python/tests/test_dataset_ama.py`:

```python
def test_dataset_value_source_topk_uses_topk_score(tmp_path):
    """When value_source='topk_score', value_target is derived from
    row['topk'][0]['score'] with scale=200000 (not from final_score)."""
    import json
    import math
    from puyo_train.dataset_ama import load_all

    sample = {
        "field": ["......"] * 13,
        "current_axis": "R", "current_child": "B",
        "next1_axis": "Y", "next1_child": "P",
        "next2_axis": "R", "next2_child": "R",
        "topk": [
            {"axisCol": 0, "rotation": 0, "score": 100000},
            {"axisCol": 1, "rotation": 0, "score": 50000},
        ],
        "final_score": 0,  # final_score is zero — would yield value 0 under default
    }
    p = tmp_path / "x.jsonl"
    p.write_text(json.dumps(sample) + "\n")

    # Default (value_source='final_score'): final_score=0 → tanh(0)=0
    ds_final = load_all(tmp_path, temperature=20.0, value_source="final_score")
    _, _, _, v_final = ds_final[0]
    assert float(v_final) == 0.0

    # value_source='topk_score': topk[0].score=100000, scale=200000 → tanh(0.5)
    ds_topk = load_all(tmp_path, temperature=20.0, value_source="topk_score")
    _, _, _, v_topk = ds_topk[0]
    assert math.isclose(float(v_topk), math.tanh(0.5), abs_tol=1e-5)


def test_dataset_value_source_default_is_final_score(tmp_path):
    """Without value_source argument, behavior matches v2 (final_score-based)."""
    import json
    import math
    from puyo_train.dataset_ama import load_all

    sample = {
        "field": ["......"] * 13,
        "current_axis": "R", "current_child": "B",
        "next1_axis": "Y", "next1_child": "P",
        "next2_axis": "R", "next2_child": "R",
        "topk": [{"axisCol": 0, "rotation": 0, "score": 999999}],
        "final_score": 50000,
    }
    p = tmp_path / "x.jsonl"
    p.write_text(json.dumps(sample) + "\n")

    ds = load_all(tmp_path, temperature=20.0)  # no value_source
    _, _, _, v = ds[0]
    # final_score=50000, default scale=50000 → tanh(1.0)
    assert math.isclose(float(v), math.tanh(1.0), abs_tol=1e-5)
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pytest tests/test_dataset_ama.py::test_dataset_value_source_topk_uses_topk_score tests/test_dataset_ama.py::test_dataset_value_source_default_is_final_score -v`
Expected: FAIL — `load_all() got an unexpected keyword argument 'value_source'`.

- [ ] **Step 3: Add `value_source` to AmaDataset and `load_all`**

In `python/puyo_train/dataset_ama.py`:

1. Find the `AmaDataset` class `__init__`. Add `value_source: str = "final_score"` to its signature (right after `augment`) and store as `self.value_source = value_source`.

2. Find the line in `__getitem__`:

```python
value = value_target_from_score(float(row.get("final_score", 0.0)))
```

Replace with:

```python
if self.value_source == "topk_score":
    topk = row.get("topk") or []
    top_score = float(topk[0].get("score", 0.0)) if topk else 0.0
    value = value_target_from_score(top_score, scale=200000.0)
else:
    value = value_target_from_score(float(row.get("final_score", 0.0)))
```

3. Update `load_all`:

```python
def load_all(
    data_dir: Path,
    temperature: float = 100.0,
    augment: bool = False,
    value_source: str = "final_score",
) -> AmaDataset:
```

…and forward `value_source=value_source` to the `AmaDataset(...)` call inside `load_all`.

- [ ] **Step 4: Run tests to verify they pass**

Run: `pytest tests/test_dataset_ama.py -v`
Expected: all pass (new + existing).

- [ ] **Step 5: Commit**

```bash
cd /Users/yasumitsuomori/git/puyo-simulator/.worktrees/puyo-mvp
git add python/puyo_train/dataset_ama.py python/tests/test_dataset_ama.py
git commit -m "feat(python): AmaDataset/load_all support value_source='topk_score'"
```

---

## Task 3: `run_distillation` and `train_ama.py` expose `value_source`

**Files:**
- Modify: `python/puyo_train/distill.py`
- Modify: `python/train_ama.py`

- [ ] **Step 1: Add `value_source` to `run_distillation`**

In `python/puyo_train/distill.py`, find the `run_distillation` signature (around line 28). Add `value_source: str = "final_score"` after `augment: bool = True`. Then find the `load_all` call and pass `value_source=value_source`.

The signature should look like:

```python
def run_distillation(
    *,
    data_dir: Path,
    out_path: Path,
    epochs: int,
    batch_size: int,
    lr: float,
    device: str,
    val_fraction: float,
    seed: int = 0,
    alpha: float = 1.0,
    temperature: float = 20.0,
    augment: bool = True,
    value_source: str = "final_score",
) -> list[dict]:
```

And the `load_all` call:

```python
ds = load_all(data_dir, temperature=temperature, augment=augment, value_source=value_source)
```

- [ ] **Step 2: Add `--value-source` to `train_ama.py`**

In `python/train_ama.py`, between the existing argument parsers, add:

```python
p.add_argument(
    "--value-source",
    choices=["final_score", "topk_score"],
    default="final_score",
)
```

Then in the `run_distillation` call, add:

```python
        value_source=args.value_source,
```

- [ ] **Step 3: Run distill smoke test**

Run: `cd python && source .venv/bin/activate && pytest tests/test_distill_smoke.py -v`
Expected: PASS (the smoke test calls `run_distillation` with default args; `value_source` defaults to `'final_score'` so behavior is unchanged).

- [ ] **Step 4: Verify CLI parses cleanly**

Run: `python train_ama.py --help 2>&1 | grep -i value-source`
Expected output should include the `--value-source` line with the two choices.

- [ ] **Step 5: Commit**

```bash
cd /Users/yasumitsuomori/git/puyo-simulator/.worktrees/puyo-mvp
git add python/puyo_train/distill.py python/train_ama.py
git commit -m "feat(python): run_distillation + train_ama --value-source flag"
```

---

## Task 4: Train policy-ama-v3 with topk-score targets

**Files:**
- Generates: `python/checkpoints/policy-ama-v3.pt`
- Generates: `data/eval-runs/train-v3-2026-04-26.log`

- [ ] **Step 1: Run training**

```bash
cd /Users/yasumitsuomori/git/puyo-simulator/.worktrees/puyo-mvp
mkdir -p data/eval-runs
cd python && source .venv/bin/activate
python train_ama.py \
  --device mps \
  --epochs 30 \
  --temperature 20.0 \
  --value-source topk_score \
  --out checkpoints/policy-ama-v3.pt \
  2>&1 | tee ../data/eval-runs/train-v3-2026-04-26.log
```

Wall-clock estimate: ~30–60 minutes on Apple Silicon (same dataset, same model, just different value labels). If MPS is unavailable, drop to `--device cpu` (slower, ~2–3×).

- [ ] **Step 2: Verify checkpoint exists**

```bash
ls -la /Users/yasumitsuomori/git/puyo-simulator/.worktrees/puyo-mvp/python/checkpoints/policy-ama-v3.pt
```

Expected: ~5 MB file, modified just now.

- [ ] **Step 3: Sanity-check the training trajectory**

Run: `tail -10 /Users/yasumitsuomori/git/puyo-simulator/.worktrees/puyo-mvp/data/eval-runs/train-v3-2026-04-26.log`
Expected: 30 lines `epoch=N train=… val=… top1=…` printed. `top1` should rise across epochs (topk-score targets give the value head a real signal, so total loss should land lower than v2's at convergence — a healthy run shows train loss < v2's final 2.16).

- [ ] **Step 4: No commit (checkpoints are gitignored)**

---

## Task 5: Export policy-ama-v3 to TF.js

**Files:**
- Generates: `public/models/policy-ama-v3/{model.json, group1-shard*.bin}`

- [ ] **Step 1: Run the export**

```bash
cd /Users/yasumitsuomori/git/puyo-simulator/.worktrees/puyo-mvp/python
source .venv/bin/activate
python -m puyo_train.export \
  --ckpt checkpoints/policy-ama-v3.pt \
  --out ../public/models/policy-ama-v3
```

Wall-clock ~30 seconds.

- [ ] **Step 2: Verify outputs**

```bash
ls -la /Users/yasumitsuomori/git/puyo-simulator/.worktrees/puyo-mvp/public/models/policy-ama-v3/
du -sh /Users/yasumitsuomori/git/puyo-simulator/.worktrees/puyo-mvp/public/models/policy-ama-v3/
```

Expected: `model.json` + 1–2 shard files; total ~5.4 MB (matches v2 since architecture is unchanged).

- [ ] **Step 3: Commit the model artifacts**

```bash
cd /Users/yasumitsuomori/git/puyo-simulator/.worktrees/puyo-mvp
git add public/models/policy-ama-v3/
git commit -m "feat(model): export policy-ama-v3 (topk-score value target)"
```

---

## Task 6: Register `ml-ama-v3-search` in TS types and worker

**Files:**
- Modify: `src/ai/types.ts`
- Modify: `src/ai/worker/ai.worker.ts`

- [ ] **Step 1: Extend `AiKind`**

In `src/ai/types.ts`, replace:

```ts
export type AiKind = 'heuristic' | 'ml-v1' | 'ml-ama-v1' | 'ml-ama-v2-search' | 'ama-wasm';
```

with:

```ts
export type AiKind = 'heuristic' | 'ml-v1' | 'ml-ama-v1' | 'ml-ama-v2-search' | 'ml-ama-v3-search' | 'ama-wasm';
```

- [ ] **Step 2: Add a v3 singleton + dispatch in the worker**

Read `src/ai/worker/ai.worker.ts` to find the existing `mlSearchInstance` singleton and `getOrInitMlSearch()` function. Insert v3 equivalents directly below them.

Add this block right after the existing v2 helpers:

```ts
let mlSearchInstanceV3: MlSearchAI | null = null;

async function getOrInitMlSearchV3(): Promise<MlSearchAI> {
  if (!mlSearchInstanceV3) {
    mlSearchInstanceV3 = new MlSearchAI({
      modelUrl: '/models/policy-ama-v3/model.json',
      K: 6,
    });
  }
  await mlSearchInstanceV3.init();
  return mlSearchInstanceV3;
}
```

In the `set-ai` `if (msg.kind === 'ml-ama-v2-search') { ... }` branch, add a parallel branch right after it:

```ts
      if (msg.kind === 'ml-ama-v3-search') {
        active = await getOrInitMlSearchV3();
        send({ type: 'set-ai', kind: 'ml-ama-v3-search', ok: true });
        return;
      }
```

- [ ] **Step 3: Run the TS test suite**

Run: `npm test 2>&1 | tail -10`
Expected: all green; existing 119 pass / 2 skip should be the same. The new kind isn't selected by any test, so it must compile but doesn't yet need to run.

- [ ] **Step 4: Run the build to confirm TypeScript compiles**

Run: `npm run build 2>&1 | tail -8`
Expected: green.

- [ ] **Step 5: Commit**

```bash
git add src/ai/types.ts src/ai/worker/ai.worker.ts
git commit -m "feat(ai): register ml-ama-v3-search worker dispatch"
```

---

## Task 7: Add the v3 option to the Header selector

**Files:**
- Modify: `src/ui/components/Header/Header.tsx`

- [ ] **Step 1: Update the `VALID` array and add the option**

Read `src/ui/components/Header/Header.tsx` to find the `VALID` constant and the `<select>` block.

Replace `VALID`:

```ts
const VALID: readonly Kind[] = ['heuristic', 'ml-v1', 'ml-ama-v1', 'ml-ama-v2-search', 'ml-ama-v3-search', 'ama-wasm'] as const;
```

In the `<select aria-label="AI">` block, add an `<option>` directly after the v2 line:

```tsx
<option value="ml-ama-v3-search">ML (ama-v3 + search)</option>
```

- [ ] **Step 2: Run Header tests**

Run: `npm test -- src/ui/components/Header 2>&1 | tail -10`
Expected: green. Existing tests don't reference the new kind so adding it is non-breaking.

- [ ] **Step 3: Commit**

```bash
git add src/ui/components/Header/Header.tsx
git commit -m "feat(ui): Header dropdown adds ML (ama-v3 + search)"
```

---

## Task 8: Wire `ml-ama-v3-search` into the Node-side eval factory

**Files:**
- Modify: `scripts/eval-ai.ts`

- [ ] **Step 1: Add a v3 branch to `makeAi`**

Read `scripts/eval-ai.ts` and find the `makeAi` function. After the existing `'ml-ama-v2-search'` branch, add:

```ts
  if (kindOrPath === 'ml-ama-v3-search') {
    const { createNodeMlSearchAI } = await import('./ml-ai-node');
    return await createNodeMlSearchAI('public/models/policy-ama-v3/model.json');
  }
```

(`createNodeMlSearchAI` already accepts the model path; no change to `scripts/ml-ai-node.ts` required.)

- [ ] **Step 2: Smoke-test the wire-up with a tiny eval**

Run:

```bash
cd /Users/yasumitsuomori/git/puyo-simulator/.worktrees/puyo-mvp
npm run eval -- --seeds 0 --max-moves 30 --ai ml-ama-v3-search --out /tmp/v3-smoke.json
```

Expected: completes in 1–2 minutes, prints `seed=0 score=… maxChain=… moves=30` and `wrote /tmp/v3-smoke.json`. Cat the JSON to confirm it contains the expected `kind: "ml-ama-v3-search"` block:

```bash
node -e "const j = require('/tmp/v3-smoke.json'); console.log(j.ais[0].kind, j.ais[0].aggregate.avgScore)"
```

- [ ] **Step 3: Run TS test suite + build**

```bash
npm test 2>&1 | tail -5
npm run build 2>&1 | tail -5
```

Expected: both green.

- [ ] **Step 4: Commit**

```bash
git add scripts/eval-ai.ts
git commit -m "feat(eval): wire ml-ama-v3-search through eval-ai makeAi"
```

---

## Task 9: Final eval — measure v3-search vs ama

**Files:**
- Generates: `data/eval-runs/v3-search-2026-04-26.json`

- [ ] **Step 1: Run the eval against the native ama baseline**

```bash
cd /Users/yasumitsuomori/git/puyo-simulator/.worktrees/puyo-mvp
npm run eval -- \
  --preset standard \
  --max-moves 200 \
  --ai ml-ama-v3-search \
  --ai ama \
  --baseline ama \
  --out data/eval-runs/v3-search-2026-04-26.json
```

The same risk as P-15 applies: ml-search per-move time at full 200 moves with K=6 is large. Expected wall-clock: 20 min (ama) + 30–180 min (v3-search) = up to ~3 hours.

If the run stalls (no new `seed=N` line for >30 minutes), kill it and proceed with whatever seeds completed. The trend will be clear from 5+ seeds even if not all 20 finish.

- [ ] **Step 2: Extract the numbers**

```bash
node -e "
const j = require('./data/eval-runs/v3-search-2026-04-26.json');
for (const a of j.ais) {
  console.log(a.kind, 'avgScore=' + a.aggregate.avgScore.toFixed(0),
              'avgMaxChain=' + a.aggregate.avgMaxChain.toFixed(2));
}
for (const c of j.comparisons) {
  console.log(c.ai, 'vs', c.baseline, 'avgScoreRatio=' + c.avgScoreRatio.toFixed(3));
}
"
```

If the run was killed mid-way and the JSON wasn't written, parse the partial log instead:

```bash
grep -E "^  seed=" /tmp/v3-search-eval.log
```

…and compute the average manually for the seeds that completed.

- [ ] **Step 3: Append v3 results to the baseline doc**

Append to `docs/superpowers/progress/2026-04-26-ml-search-baseline.md`:

```markdown

---

## v3-search results (2026-04-26)

`policy-ama-v3` uses `topk[0].score` as the value-target source (scale 200,000).
Architecture, augmentation, and policy training are identical to v2 —
the only change is the value-head training signal.

| AI | seeds run | avg score | avg maxChain | score / ama | maxChain / ama |
| --- | --- | --- | --- | --- | --- |
| ml-ama-v3-search | <fill from JSON> | <fill> | <fill> | **<fill>** | **<fill>** |

### KPI verdict (per spec §1.3 of value-target-rework-design.md)

- score / ama ≥ 0.30 — <met / not met>
- (Reference) v2 score / ama = 0.056

### Decision (per spec §1.3)

- **score / ama ≥ 0.30** → B 案 hypothesis confirmed; A 案 (N-step rollout)
  expected to give further gains, run that next.
- **0.10 ≤ X < 0.30** → partial signal; A 案 is still required, plan accordingly.
- **< 0.10** → value target alone insufficient; A 案 spec must include
  additional axes (model capacity, batched inference, search depth) before
  re-running.
```

Replace each `<fill>` with the actual numbers from the JSON. Format avgScore as integer-rounded, avgMaxChain to 2 decimals, ratios to 3 decimals.

- [ ] **Step 4: Commit**

```bash
git add docs/superpowers/progress/2026-04-26-ml-search-baseline.md
git commit -m "docs(progress): record ml-ama-v3-search KPI vs ama"
```

---

## Final Steps

- [ ] **Run the full test suite**

```bash
npm test 2>&1 | tail -10
cd python && source .venv/bin/activate && pytest -v 2>&1 | tail -10 && cd ..
```

Expected: TS 119+ pass / 2 skip, Python 40+ pass.

- [ ] **Run the production build**

```bash
npm run build 2>&1 | tail -5
```

Expected: green; precache should now include `models/policy-ama-v3/`.

- [ ] **Note any open follow-ups**

If KPI < 0.30, write a one-paragraph follow-up at the bottom of
`docs/superpowers/progress/2026-04-26-ml-search-baseline.md` recording
which axes the next iteration should target (per spec §4.3).

---

## Notes for the executing engineer

- **Task 4 is offline-bound** (~30–60 min of training). Start it as soon as Tasks 1–3 land so it finishes by the time Tasks 6–8 are ready to wire up.
- **Task 9 is the longest single step** (up to 3 hours). If it stalls, recover with whatever partial data the log holds — the qualitative answer (ratio in which bucket: ≥0.30 / 0.10–0.30 / <0.10) is robust to small samples.
- The `value_target_from_score` default and the `value_source='final_score'` default both preserve v2 reproducibility. If anything in v2's pipeline regresses, suspect a non-default codepath.
- `policy-ama-v2/` and `policy-ama-v3/` coexist in `public/models/`. The browser bundle will precache both; total PWA cache grows by ~5.4 MB.
