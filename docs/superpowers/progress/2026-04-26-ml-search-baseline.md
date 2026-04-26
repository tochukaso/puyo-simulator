# ML Search Baseline (2026-04-26)

20 seeds (0..19), max 200 moves per game (native ama is hard-capped at
200 moves in `dump_selfplay.cpp`; non-ama AIs were aligned to 200 via
`--max-moves 200` for fair comparison).

Source: `data/eval-runs/baseline-2026-04-26.json` (gitignored).

| AI | avg score | median score | avg maxChain | max score | avg score / ama |
| --- | --- | --- | --- | --- | --- |
| ml-ama-v1     | 3,379   | 1,550   | 2.35  | 22,880  | 0.008 |
| ama (native)  | 375,978 | 414,770 | 12.70 | 552,240 | 1.000 |

## Baseline rationale

- **ama-wasm dropped**: at ~30–90 min/seed it would have taken 10+ hours;
  native ama runs in ~20 minutes total for 20 games using its built-in
  multi-threading. ama-wasm and native ama produce different absolute
  scores (the handoff measured ama-wasm 467K vs native 358K on seed 1)
  but track the same algorithm; native is treated as a faithful proxy.
- **heuristic AI dropped**: per spec request, weak AIs aren't useful as
  baseline reference. Only the strong baseline (ama) and the regression
  reference (ml-ama-v1) are kept.
- **max-moves 200**: forced by native ama's hard cap. The KPI denominator
  is therefore "ama's average score over its 200-move games", not the
  500-move number that ama-wasm would produce. This is fine because the
  v2 search AI is also evaluated at the same horizon in P-15.

## Target for `ml-ama-v2-search` (per spec §1.2, restated)

- avg score / ama (native, 200 moves) **≥ 0.50** — main KPI
- avg maxChain / ama **≥ 0.70**
- avg score > ml-ama-v1 baseline (3,379) — no-regression floor

## Distance to target

Current `ml-ama-v1` sits at **0.008** (0.8%) of ama. Reaching 0.50
requires roughly a 60× score improvement. Spec §1.4's fallback applies
if the v2 build lands in 0.3 ≤ X < 0.5 — set midpoint target and run a
second iteration on top.

---

## v2-search results (2026-04-26, partial)

The full 20-seed eval stalled after seed 2 (no progress in 1 hour at
seed 3). Killed and reporting partial data — 3 seeds is a small
sample but the gap to KPI is large enough that the qualitative verdict
is robust.

| AI | seeds run | avg score | avg maxChain | score / ama | maxChain / ama |
| --- | --- | --- | --- | --- | --- |
| ml-ama-v2-search | 3 (0..2) | 21,120 | 4.00 | **0.056** | **0.315** |

Per-seed: seed 0=17,060 (chain=3), seed 1=22,280 (chain=5),
seed 2=24,020 (chain=4). All games used the full 200 moves
(no early gameovers).

### KPI verdict

- avg score / ama ≥ 0.50 — ❌ **MISSED** (0.056, ~9× below target)
- avg maxChain / ama ≥ 0.70 — ❌ **MISSED** (0.315)
- avg score > ml-ama-v1 (3,379) — ✅ **MET** (6.3× over v1)

### Spec §1.4 outcome

Score ratio sits in the **"< 0.3" bucket**: per spec, this requires
revisiting design assumptions rather than running a second iteration on
top of the same architecture.

Likely root causes (ordered by suspected impact):

1. **value head quality** — the search backs up `value(leaf)` from a
   model whose value target is `tanh(teacher_score / 50000)`, i.e.
   teacher's chosen-line score. This is not a true position evaluation;
   the value head is essentially noise for non-teacher placements. This
   was flagged as risk §6.1 in the spec and is the most likely reason
   search adds little over policy-only inference.
2. **policy quality** — final epoch top1=0.194 (~19%). With K=6 beam
   the top-K hit rate should still be >90%, so this is not the
   bottleneck.
3. **encoding limits** — 11ch added heightmap and connectivity but
   doesn't capture chain structure (chain length, GTR-shape proximity
   etc.). The model has to derive these via convolution over a thin
   stack.
4. **chance node simplification** — 2 representatives is fine in
   theory, unlikely to be material here.

### Suggested next iteration

- **#1 priority**: rework value target — replace `tanh(teacher_score)`
  with the teacher's actual N-step rollout score from each position.
  This requires extending `dump_selfplay` to dump per-position
  value-after-N-moves, then retraining v2.
- **#2 priority**: investigate why the eval stalled. The stall
  suggests an O(N²) or worse scaling somewhere (search tree blow-up
  on busier mid-game positions?). Profiling and possibly batching the
  forward calls (currently serial per node) is worth doing before any
  re-eval.
- Defer spec rewrite until after these two — the headline failure
  pattern (KPI 0.056 with healthy non-regression floor) points at the
  value signal, not the search architecture.
