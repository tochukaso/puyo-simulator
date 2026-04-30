# Tauri manual E2E checklist

Run before tagging a release. Items marked (Android) are skipped on the
option A path until the Android toolchain is provisioned.

## macOS (.app)

- [ ] `npm run tauri:build` succeeds (universal-apple-darwin target)
- [ ] Open `bundle/macos/Puyo Trainer.app` — window appears, no crash
- [ ] AI selector lists `ama (Native) ⚡`
- [ ] Selecting `ama (Native)` shows a candidate within 500ms (target 200ms)
- [ ] Playing 10 turns: no UI freeze, suggestions update each turn
- [ ] Switching to `ama (WASM)` and back works
- [ ] Quitting and relaunching restores last AI choice
- [ ] DevTools console (right-click → Inspect Element): no errors,
      no `[ama-native] invoke failed`

## Android (.apk) — deferred

- [ ] Android toolchain provisioned (NDK r26+, Java 17, rust targets)
- [ ] `npm run tauri:build:android` succeeds
- [ ] `adb install -r ...apk` succeeds
- [ ] Launch via launcher icon — no crash
- [ ] `ama (Native) ⚡` listed in AI selector
- [ ] Suggestion within 800ms (target 500ms)
- [ ] 10 turns played: no freeze
- [ ] Background → foreground works (lifecycle test)
- [ ] No "Class not found" / JNI errors in `adb logcat | grep -i tauri`

## Cross-cutting

- [ ] License page accessible from app (third-party/ contents bundled
      via `npm run licenses:collect`)
- [ ] Bench: `PATH="$HOME/.cargo/bin:$PATH" npm run bench:ama` p99 within
      gate (Intel Mac < 500ms, Apple Silicon < 500ms, Android arm64 < 800ms)
- [ ] Golden test (optional, slow): `npm test -- ama-native-golden` matches
      ≥ 90% (gate documented in
      `docs/superpowers/progress/2026-04-29-ama-native-golden-results.md`)
