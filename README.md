# Puyo Training Simulator

A Puyo Puyo training web app with an AI advisor (mobile-friendly PWA).

## Status

MVP (Phase 0-4 complete): heuristic-AI advice version.

## Development

```
npm install
npm run dev      # Development server
npm run test     # Unit tests
npm run e2e      # E2E smoke tests
npm run build    # Production build
npm run lint     # Lint
```

## Supply chain security (Takumi Guard)

NPM and PyPI installs are routed through the
[Takumi Guard](https://flatt.tech/takumi/features/guard) registry proxy,
which blocks known-malicious packages.

- NPM: `.npmrc` at the repo root sets `registry=https://npm.flatt.tech/`
- Python: `python/requirements.txt` (`--index-url`) and `python/pip.conf`
  point to `https://pypi.flatt.tech/simple/`
- CI: `.github/workflows/ci.yml` uses `flatt-security/setup-takumi-guard-npm@v1`
  (acquires a short-lived token via OIDC)

## Documentation

- Design spec: `docs/superpowers/specs/2026-04-24-puyo-simulator-design.md`
- MVP implementation plan: `docs/superpowers/plans/2026-04-24-puyo-mvp.md`

## Next phases

Phase 5-7: Python pre-training DQN
Phase 8: Deployment and polish

## Bundled software

- [ama](https://github.com/citrus610/ama) (MIT) by citrus610 — bundled as
  WebAssembly under the `ama (WASM)` AI option. License: `LICENSES/ama-MIT.txt`.

## Rebuilding ama WASM (optional)

The `public/wasm/ama.wasm` artifact is committed to this repo (the matching
emscripten glue is regenerated into `src/ai/wasm-ama/_glue/ama.js` and is
gitignored). To rebuild from source:

1. Install Emscripten: `brew install emscripten` (~5GB, 10-20 min)
2. Clone ama: `git clone https://github.com/citrus610/ama /path/to/ama`
3. Build: `AMA_REPO=/path/to/ama npm run build:ama-wasm`
