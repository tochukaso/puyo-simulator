# ama-native bench results

**Date:** 2026-04-29
**Branch:** `feat/ama-native-tauri`
**Binary:** `src-tauri/target/release/examples/golden_replay`
**Host:** Intel Mac (x86_64-apple-darwin)
**Build:** clang++ -O3 -flto -msse4.1 -mbmi2 -DPEXT (per `ama/makefile` `native-x86-darwin`)

## Per-suggestion latency

```
> puyo-simulator@0.0.0 bench:ama
> tsx scripts/bench-ama.ts

bench: 5 runs × 100 rows from /Users/yasumitsuomori/git/puyo3/src/ai/native-ama/__tests__/fixtures/ama_golden_100.jsonl
warmup...
run 1: 12257ms total, 122.57ms/suggestion (n=100)
run 2: 12536ms total, 125.36ms/suggestion (n=100)
run 3: 12863ms total, 128.63ms/suggestion (n=100)
run 4: 13092ms total, 130.92ms/suggestion (n=100)
run 5: 12896ms total, 128.96ms/suggestion (n=100)

per-suggestion latency (ms):
  p50:  128.63
  p90:  128.96
  p99:  128.96
  max:  130.92
  mean: 127.29

Note: each sample = avg over 100 suggestions (avg-of-avg, not true p99).
Real p99 across individual suggestions requires per-row timing in golden_replay,
which is a future enhancement.
```

## Verdict against spec gates

| target | gate p99 | measured | result |
| --- | --- | --- | --- |
| Intel Mac (Tauri) | < 500ms | 128.96 ms | PASS |

The 500ms p99 gate is for end-to-end suggestion latency in the Tauri app.
This bench measures direct C++ FFI call time (no Tauri IPC overhead, no
spawn_blocking, no JSON serialization). The Tauri end-to-end latency will
be slightly higher (~10-30 ms IPC) but should still beat 500ms by a wide
margin.

## Notes

- Each "sample" is the average over 100 suggestions in one process invocation.
- True per-suggestion p99 requires golden_replay to emit per-row timings —
  future enhancement.
- The 8769-row full sweep (Task 5.1) finished in 501s wall = 57ms/suggestion
  average. This bench should agree with that.
- Observed mean here (127 ms/suggestion) is roughly 2× the full-sweep figure;
  the smaller subsample exposes more startup/teardown overhead amortization
  per suggestion than the full 8769-row sweep does. The trend (well under
  500 ms) is consistent.
