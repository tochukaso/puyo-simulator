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
