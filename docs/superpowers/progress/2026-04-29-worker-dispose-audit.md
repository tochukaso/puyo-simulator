# Worker / WasmAmaAI dispose audit

**Date:** 2026-04-29
**Branch:** feat/web-ama-wasm-optimization

## Singleton verification

- Worker: `workerSingleton` in src/ui/hooks/useAiSuggestion.ts:9 — single Worker
  created lazily on first `getWorker()` call (early-return at line 18 prevents
  re-creation), never recreated.
- WasmAmaAI: `amaWasmInstances` in src/ai/worker/ai.worker.ts:22 — cached
  per-variant (`'default' | 'gtr-only'`), reused across kind switches; preset
  is hot-swapped via `setPreset` rather than re-instantiating.
- MlAI / MlSearchAI: also cached at module scope (`mlInstances`,
  `mlSearchInstance`).

## Component-mount discipline

`useAiSuggestion` registers callbacks into module-level `Set`s
(`suggestHandlers`, `aiReadyHandlers`) on mount and removes them on unmount.
The Worker itself is *not* tied to component lifecycle — it is created on the
first `getWorker()` call and lives for the full page session.

`grep -rn "new Worker" src/` returns exactly one hit (the guarded creation in
`getWorker`). `grep -rn "WasmAmaAI" src/` shows the only production
instantiation is inside `getOrInitAmaWasm` behind the variant cache; the other
two hits are in unit tests.

## Findings

Clean. No worker re-creation, no `WasmAmaAI` instance leak, no missing
dispose. The current architecture intentionally keeps the Worker and its
WASM heap alive for the page session — disposing on unmount would force a
cold restart on every navigation.

No code change required.
