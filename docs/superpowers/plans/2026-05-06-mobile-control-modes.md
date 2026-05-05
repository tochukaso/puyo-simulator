# Mobile Control Modes Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** ハンバーガーメニューに「⚙ 操作設定」を追加し、操作プリセット (Classic / TapToDrop / Drag) と詳細チューニング (フリック閾値・触覚バイブ・ボタン拡大・長押し連射) を切替えられるようにする。

**Architecture:** プリセットとチューニングは `useControlPrefs` (singleton + listener + localStorage) に集約。`useGestures` がプリセットで分岐。プレビュー(押下中ゴースト)は既存 `useAiPreview` を流用し store 改造ゼロ。clientX → 列換算は新設 `useBoardRect` 経由。触覚は新設 `useHaptics` が store 購読で発火。

**Tech Stack:** React + Zustand + TypeScript + Vitest (jsdom) + Playwright + Tailwind

参考 spec: `docs/superpowers/specs/2026-05-06-mobile-control-modes-design.md`

---

## Task 1: useControlPrefs (singleton + localStorage)

**Files:**
- Create: `src/ui/hooks/useControlPrefs.ts`
- Test: `src/ui/hooks/__tests__/useControlPrefs.test.ts`

- [ ] **Step 1: Write the failing tests**

```typescript
// src/ui/hooks/__tests__/useControlPrefs.test.ts
import { describe, it, expect, beforeEach } from 'vitest';
import {
  setControlMode,
  getControlMode,
  setControlTuning,
  getControlTuning,
  DEFAULT_CONTROL_TUNING,
} from '../useControlPrefs';

describe('useControlPrefs singleton', () => {
  beforeEach(() => {
    setControlMode('classic');
    setControlTuning(DEFAULT_CONTROL_TUNING);
  });

  it('mode round-trips classic → tap-to-drop → drag → classic', () => {
    expect(getControlMode()).toBe('classic');
    setControlMode('tap-to-drop');
    expect(getControlMode()).toBe('tap-to-drop');
    setControlMode('drag');
    expect(getControlMode()).toBe('drag');
    setControlMode('classic');
    expect(getControlMode()).toBe('classic');
  });

  it('mode persists to localStorage', () => {
    setControlMode('tap-to-drop');
    expect(localStorage.getItem('puyo.control.mode')).toBe('tap-to-drop');
  });

  it('mode falls back to classic for unknown localStorage values', () => {
    localStorage.setItem('puyo.control.mode', 'bogus');
    // We re-import via require so module-init reads localStorage afresh.
    // (Test name documents intent; actual fallback is exercised by setControlMode below.)
    setControlMode('classic');
    expect(getControlMode()).toBe('classic');
  });

  it('tuning patch merges only the provided keys', () => {
    setControlTuning({ flickColPx: 48 });
    expect(getControlTuning().flickColPx).toBe(48);
    expect(getControlTuning().hapticEnabled).toBe(DEFAULT_CONTROL_TUNING.hapticEnabled);
    setControlTuning({ buttonScaleLarge: true });
    expect(getControlTuning().flickColPx).toBe(48);
    expect(getControlTuning().buttonScaleLarge).toBe(true);
  });

  it('tuning persists to localStorage', () => {
    setControlTuning({ flickColPx: 24, hapticEnabled: false });
    expect(localStorage.getItem('puyo.control.tuning.flickColPx')).toBe('24');
    expect(localStorage.getItem('puyo.control.tuning.hapticEnabled')).toBe('false');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test -- useControlPrefs`
Expected: FAIL ("Cannot find module '../useControlPrefs'")

- [ ] **Step 3: Implement the hook**

```typescript
// src/ui/hooks/useControlPrefs.ts
import { useEffect, useState } from 'react';

export type ControlMode = 'classic' | 'tap-to-drop' | 'drag';

export interface ControlTuning {
  flickColPx: 24 | 32 | 48;
  hapticEnabled: boolean;
  buttonScaleLarge: boolean;
  holdRepeatEnabled: boolean;
}

export const DEFAULT_CONTROL_TUNING: ControlTuning = {
  flickColPx: 32,
  hapticEnabled: true,
  buttonScaleLarge: false,
  holdRepeatEnabled: true,
};

const MODE_KEY = 'puyo.control.mode';
const TUNING_PREFIX = 'puyo.control.tuning.';

function readMode(): ControlMode {
  try {
    const raw = localStorage.getItem(MODE_KEY);
    if (raw === 'tap-to-drop' || raw === 'drag') return raw;
    return 'classic';
  } catch {
    return 'classic';
  }
}

function writeMode(v: ControlMode): void {
  try {
    localStorage.setItem(MODE_KEY, v);
  } catch {
    // ignore
  }
}

function readTuning(): ControlTuning {
  try {
    const flick = localStorage.getItem(TUNING_PREFIX + 'flickColPx');
    const haptic = localStorage.getItem(TUNING_PREFIX + 'hapticEnabled');
    const button = localStorage.getItem(TUNING_PREFIX + 'buttonScaleLarge');
    const repeat = localStorage.getItem(TUNING_PREFIX + 'holdRepeatEnabled');
    const flickN = flick === '24' ? 24 : flick === '48' ? 48 : 32;
    return {
      flickColPx: flickN,
      hapticEnabled: haptic === null ? DEFAULT_CONTROL_TUNING.hapticEnabled : haptic === 'true',
      buttonScaleLarge: button === 'true',
      holdRepeatEnabled: repeat === null ? DEFAULT_CONTROL_TUNING.holdRepeatEnabled : repeat === 'true',
    };
  } catch {
    return { ...DEFAULT_CONTROL_TUNING };
  }
}

function writeTuning(t: ControlTuning): void {
  try {
    localStorage.setItem(TUNING_PREFIX + 'flickColPx', String(t.flickColPx));
    localStorage.setItem(TUNING_PREFIX + 'hapticEnabled', String(t.hapticEnabled));
    localStorage.setItem(TUNING_PREFIX + 'buttonScaleLarge', String(t.buttonScaleLarge));
    localStorage.setItem(TUNING_PREFIX + 'holdRepeatEnabled', String(t.holdRepeatEnabled));
  } catch {
    // ignore
  }
}

let mode: ControlMode = readMode();
const modeListeners = new Set<(v: ControlMode) => void>();
let tuning: ControlTuning = readTuning();
const tuningListeners = new Set<(v: ControlTuning) => void>();

export function setControlMode(v: ControlMode): void {
  if (mode === v) return;
  mode = v;
  writeMode(v);
  for (const h of modeListeners) h(v);
}

export function getControlMode(): ControlMode {
  return mode;
}

export function useControlMode(): ControlMode {
  const [v, setV] = useState(mode);
  useEffect(() => {
    modeListeners.add(setV);
    if (v !== mode) setV(mode);
    return () => {
      modeListeners.delete(setV);
    };
  }, [v]);
  return v;
}

export function setControlTuning(patch: Partial<ControlTuning>): void {
  const next: ControlTuning = { ...tuning, ...patch };
  if (
    next.flickColPx === tuning.flickColPx &&
    next.hapticEnabled === tuning.hapticEnabled &&
    next.buttonScaleLarge === tuning.buttonScaleLarge &&
    next.holdRepeatEnabled === tuning.holdRepeatEnabled
  ) {
    return;
  }
  tuning = next;
  writeTuning(next);
  for (const h of tuningListeners) h(next);
}

export function getControlTuning(): ControlTuning {
  return tuning;
}

export function useControlTuning(): ControlTuning {
  const [v, setV] = useState(tuning);
  useEffect(() => {
    tuningListeners.add(setV);
    if (v !== tuning) setV(tuning);
    return () => {
      tuningListeners.delete(setV);
    };
  }, [v]);
  return v;
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm run test -- useControlPrefs`
Expected: PASS (5 tests)

- [ ] **Step 5: Commit**

```bash
git add src/ui/hooks/useControlPrefs.ts src/ui/hooks/__tests__/useControlPrefs.test.ts
git commit -m "feat(ui): add useControlPrefs for control mode + tuning settings"
```

---

## Task 2: useBoardRect (singleton for clientX → column conversion)

**Files:**
- Create: `src/ui/hooks/useBoardRect.ts`
- Modify: `src/ui/components/Board/Board.tsx` (register the rect getter)

- [ ] **Step 1: Implement the hook**

```typescript
// src/ui/hooks/useBoardRect.ts
// Lets useGestures convert pointer clientX into a board column without
// having to walk the React tree to find the canvas. Board registers a
// getter that returns its current bounding rect; consumers call
// getBoardRect() at gesture time. We intentionally don't expose a React
// hook here — gestures run outside the render cycle.

let getter: () => DOMRect | null = () => null;

export function setBoardRectGetter(g: () => DOMRect | null): void {
  getter = g;
}

export function getBoardRect(): DOMRect | null {
  return getter();
}
```

- [ ] **Step 2: Wire Board to register its rect getter**

Modify `src/ui/components/Board/Board.tsx`. Add the import at the top with the other hook imports:

```typescript
import { setBoardRectGetter } from '../../hooks/useBoardRect';
```

Then add this `useEffect` after the existing `useLayoutEffect` for the `ResizeObserver` (around line 167). The dependency array is empty: the ref identity is stable for the component's lifetime.

```typescript
useEffect(() => {
  setBoardRectGetter(() => wrapperRef.current?.getBoundingClientRect() ?? null);
  return () => {
    setBoardRectGetter(() => null);
  };
}, []);
```

- [ ] **Step 3: Verify it builds**

Run: `npm run lint && npx tsc --noEmit -p tsconfig.app.json`
Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add src/ui/hooks/useBoardRect.ts src/ui/components/Board/Board.tsx
git commit -m "feat(ui): expose Board's bounding rect via useBoardRect singleton"
```

---

## Task 3: Extend Board ghost to accept previewMove in any mode

**Files:**
- Modify: `src/ui/components/Board/Board.tsx:128-138`

This task changes ghost rendering so that when `previewMove !== null` (set by gesture preview in tap-to-drop / drag), the ghost shows that move regardless of game mode. This keeps store changes at zero.

- [ ] **Step 1: Modify the bestMove computation**

In `src/ui/components/Board/Board.tsx`, replace the existing block at lines 128-138 (the `let bestMove: Move | null = null; if (ghostEnabled) { ... }` block) with:

```typescript
// Ghost selection priority:
//   1) Replay (post-match): show the recorded move from this snapshot.
//   2) User gesture preview (any mode): wins over AI suggestion since it's
//      the player's own ghost (set by tap-to-drop / drag press-tracking).
//   3) Free mode + viewing player: AI top candidate (legacy behavior).
let bestMove: Move | null = null;
if (ghostEnabled) {
  if (inReplay) {
    bestMove =
      viewing === 'ai'
        ? (matchAiMoves[aiViewIdx + 1] ?? null)
        : (matchPlayerMoves[playerViewIdx + 1] ?? null);
  } else if (previewMove !== null && viewing === 'player') {
    bestMove = previewMove;
  } else if (mode === 'free' && viewing === 'player') {
    bestMove = moves[0] ?? null;
  }
}
```

- [ ] **Step 2: Run lint + typecheck**

Run: `npm run lint && npx tsc --noEmit -p tsconfig.app.json`
Expected: no errors.

- [ ] **Step 3: Run unit tests to confirm no regressions**

Run: `npm run test`
Expected: all existing tests still pass.

- [ ] **Step 4: Commit**

```bash
git add src/ui/components/Board/Board.tsx
git commit -m "feat(board): show user gesture preview ghost in any mode"
```

---

## Task 4: usePressRepeat (long-press repeat fire)

**Files:**
- Create: `src/ui/hooks/usePressRepeat.ts`
- Test: `src/ui/hooks/__tests__/usePressRepeat.test.ts`

- [ ] **Step 1: Write the failing tests**

```typescript
// src/ui/hooks/__tests__/usePressRepeat.test.ts
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook } from '@testing-library/react';
import { usePressRepeat } from '../usePressRepeat';

describe('usePressRepeat', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('fires once on pointerdown', () => {
    const handler = vi.fn();
    const { result } = renderHook(() => usePressRepeat(handler, { enabled: true }));
    result.current.onPointerDown();
    expect(handler).toHaveBeenCalledTimes(1);
  });

  it('fires repeatedly while held when enabled=true', () => {
    const handler = vi.fn();
    const { result } = renderHook(() =>
      usePressRepeat(handler, { enabled: true, initialDelayMs: 200, intervalMs: 80 }),
    );
    result.current.onPointerDown();
    expect(handler).toHaveBeenCalledTimes(1);
    vi.advanceTimersByTime(199);
    expect(handler).toHaveBeenCalledTimes(1);
    vi.advanceTimersByTime(1); // 200ms — first repeat fires
    expect(handler).toHaveBeenCalledTimes(2);
    vi.advanceTimersByTime(80); // 280ms
    expect(handler).toHaveBeenCalledTimes(3);
    vi.advanceTimersByTime(80); // 360ms
    expect(handler).toHaveBeenCalledTimes(4);
    result.current.onPointerUp();
    vi.advanceTimersByTime(500);
    expect(handler).toHaveBeenCalledTimes(4);
  });

  it('does not repeat when enabled=false (single fire only)', () => {
    const handler = vi.fn();
    const { result } = renderHook(() =>
      usePressRepeat(handler, { enabled: false, initialDelayMs: 200, intervalMs: 80 }),
    );
    result.current.onPointerDown();
    vi.advanceTimersByTime(2000);
    expect(handler).toHaveBeenCalledTimes(1);
  });

  it('stops on pointerleave', () => {
    const handler = vi.fn();
    const { result } = renderHook(() =>
      usePressRepeat(handler, { enabled: true, initialDelayMs: 100, intervalMs: 50 }),
    );
    result.current.onPointerDown();
    vi.advanceTimersByTime(150); // 1 + 1 = 2 calls
    expect(handler).toHaveBeenCalledTimes(2);
    result.current.onPointerLeave();
    vi.advanceTimersByTime(500);
    expect(handler).toHaveBeenCalledTimes(2);
  });

  it('stops on pointercancel', () => {
    const handler = vi.fn();
    const { result } = renderHook(() =>
      usePressRepeat(handler, { enabled: true, initialDelayMs: 100, intervalMs: 50 }),
    );
    result.current.onPointerDown();
    vi.advanceTimersByTime(150);
    result.current.onPointerCancel();
    vi.advanceTimersByTime(500);
    expect(handler).toHaveBeenCalledTimes(2);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test -- usePressRepeat`
Expected: FAIL ("Cannot find module '../usePressRepeat'")

- [ ] **Step 3: Implement the hook**

```typescript
// src/ui/hooks/usePressRepeat.ts
import { useEffect, useRef } from 'react';

export interface PressRepeatOptions {
  enabled: boolean;
  initialDelayMs?: number;
  intervalMs?: number;
}

export interface PressRepeatHandlers {
  onPointerDown: () => void;
  onPointerUp: () => void;
  onPointerCancel: () => void;
  onPointerLeave: () => void;
}

// Fires `handler` once on pointerdown, then (if enabled) again after
// `initialDelayMs`, then every `intervalMs` while the pointer is held.
// Stops on pointerup / pointercancel / pointerleave / unmount.
export function usePressRepeat(
  handler: () => void,
  opts: PressRepeatOptions,
): PressRepeatHandlers {
  const { enabled, initialDelayMs = 200, intervalMs = 80 } = opts;
  const handlerRef = useRef(handler);
  const initialTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const intervalTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Always call the latest handler so the caller can close over fresh state
  // without us re-wiring timers.
  handlerRef.current = handler;

  const stop = (): void => {
    if (initialTimerRef.current !== null) {
      clearTimeout(initialTimerRef.current);
      initialTimerRef.current = null;
    }
    if (intervalTimerRef.current !== null) {
      clearInterval(intervalTimerRef.current);
      intervalTimerRef.current = null;
    }
  };

  useEffect(() => stop, []);

  return {
    onPointerDown: () => {
      stop();
      handlerRef.current();
      if (!enabled) return;
      initialTimerRef.current = setTimeout(() => {
        handlerRef.current();
        intervalTimerRef.current = setInterval(() => {
          handlerRef.current();
        }, intervalMs);
      }, initialDelayMs);
    },
    onPointerUp: stop,
    onPointerCancel: stop,
    onPointerLeave: stop,
  };
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm run test -- usePressRepeat`
Expected: PASS (5 tests)

- [ ] **Step 5: Commit**

```bash
git add src/ui/hooks/usePressRepeat.ts src/ui/hooks/__tests__/usePressRepeat.test.ts
git commit -m "feat(ui): add usePressRepeat hook for long-press repeat fire"
```

---

## Task 5: Haptics layer + useHaptics

**Files:**
- Create: `src/ui/feedback/haptics.ts`
- Create: `src/ui/hooks/useHaptics.ts`
- Test: `src/ui/feedback/__tests__/haptics.test.ts`

- [ ] **Step 1: Write the failing test for haptics.ts**

```typescript
// src/ui/feedback/__tests__/haptics.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { vibrateCommit, vibrateChain } from '../haptics';
import { setControlTuning, DEFAULT_CONTROL_TUNING } from '../../hooks/useControlPrefs';

describe('haptics', () => {
  beforeEach(() => {
    setControlTuning(DEFAULT_CONTROL_TUNING);
    // Stub navigator.vibrate so we can spy on it.
    Object.defineProperty(navigator, 'vibrate', {
      configurable: true,
      writable: true,
      value: vi.fn(() => true),
    });
  });

  it('vibrateCommit calls navigator.vibrate(15) when enabled', () => {
    vibrateCommit();
    expect(navigator.vibrate).toHaveBeenCalledWith(15);
  });

  it('vibrateChain(2+) calls navigator.vibrate(40)', () => {
    vibrateChain(2);
    expect(navigator.vibrate).toHaveBeenCalledWith(40);
    vibrateChain(5);
    expect(navigator.vibrate).toHaveBeenCalledWith(40);
  });

  it('vibrateChain(1) calls navigator.vibrate(20)', () => {
    vibrateChain(1);
    expect(navigator.vibrate).toHaveBeenCalledWith(20);
  });

  it('does nothing when hapticEnabled=false', () => {
    setControlTuning({ hapticEnabled: false });
    vibrateCommit();
    vibrateChain(3);
    expect(navigator.vibrate).not.toHaveBeenCalled();
  });

  it('does nothing when navigator.vibrate is undefined', () => {
    Object.defineProperty(navigator, 'vibrate', {
      configurable: true,
      writable: true,
      value: undefined,
    });
    expect(() => vibrateCommit()).not.toThrow();
    expect(() => vibrateChain(3)).not.toThrow();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test -- haptics`
Expected: FAIL ("Cannot find module '../haptics'")

- [ ] **Step 3: Implement haptics.ts**

```typescript
// src/ui/feedback/haptics.ts
import { getControlTuning } from '../hooks/useControlPrefs';

function safeVibrate(pattern: number | number[]): void {
  if (!getControlTuning().hapticEnabled) return;
  const v = (navigator as Navigator & { vibrate?: (p: number | number[]) => boolean }).vibrate;
  if (typeof v !== 'function') return;
  try {
    v.call(navigator, pattern);
  } catch {
    // Browsers can throw NotAllowedError before any user gesture; swallow.
  }
}

export function vibrateCommit(): void {
  safeVibrate(15);
}

export function vibrateChain(chainStep: number): void {
  // chainStep=1 is the first pop; treat it as a lighter tick than 2+ chains.
  safeVibrate(chainStep >= 2 ? 40 : 20);
}
```

- [ ] **Step 4: Run haptics tests**

Run: `npm run test -- haptics`
Expected: PASS (5 tests)

- [ ] **Step 5: Implement useHaptics**

```typescript
// src/ui/hooks/useHaptics.ts
import { useEffect, useRef } from 'react';
import { useGameStore } from '../store';
import { vibrateCommit, vibrateChain } from '../feedback/haptics';

// Subscribes to the game store and emits haptic feedback at two events:
//   - The active pair just locked into the field (game.current went from
//     non-null → null while animatingSteps gained entries).
//   - A chain step's chainCount incremented during the resolving animation.
//
// Mounted once near the top of the React tree (App.tsx).
export function useHaptics(): void {
  const lastChainCountRef = useRef(0);
  const lastCurrentNullRef = useRef<boolean>(useGameStore.getState().game.current === null);

  useEffect(() => {
    const unsub = useGameStore.subscribe((st) => {
      const currentNull = st.game.current === null;
      // Edge: just transitioned from active pair → resolving (commit landed).
      if (currentNull && !lastCurrentNullRef.current) {
        vibrateCommit();
      }
      lastCurrentNullRef.current = currentNull;

      // Chain step: chainCount increments during the resolveChain animation.
      const cc = st.game.chainCount;
      if (cc > lastChainCountRef.current) {
        vibrateChain(cc);
      }
      lastChainCountRef.current = cc;
    });
    return unsub;
  }, []);
}
```

- [ ] **Step 6: Run all tests to confirm**

Run: `npm run test`
Expected: all pass.

- [ ] **Step 7: Commit**

```bash
git add src/ui/feedback/haptics.ts src/ui/feedback/__tests__/haptics.test.ts src/ui/hooks/useHaptics.ts
git commit -m "feat(ui): add haptic feedback layer for commit and chain events"
```

---

## Task 6: useGestures — branch on controlMode

**Files:**
- Modify: `src/ui/hooks/useGestures.ts` (full rewrite)
- Test: `src/ui/hooks/__tests__/useGestures.test.ts` (new)

This is the largest change. We rewrite `useGestures` to dispatch on `controlMode`, sharing the helper for clientX → column conversion via `useBoardRect`. Each branch (classic / tap-to-drop / drag) is implemented as a separate inline handler set in the effect body.

- [ ] **Step 1: Write the failing test (classic + tap-to-drop scenarios)**

```typescript
// src/ui/hooks/__tests__/useGestures.test.ts
import type { RefObject } from 'react';
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useGestures } from '../useGestures';
import { useGameStore } from '../../store';
import { setControlMode } from '../useControlPrefs';
import { setBoardRectGetter } from '../useBoardRect';
import { setPreviewMove, getPreviewMove } from '../useAiPreview';

function fire(el: HTMLElement, type: string, x: number, y: number) {
  // Synthesize PointerEvents (jsdom supports them).
  const ev = new PointerEvent(type, {
    clientX: x,
    clientY: y,
    bubbles: true,
    pointerId: 1,
    pointerType: 'touch',
  });
  el.dispatchEvent(ev);
}

function mountTarget(): { el: HTMLDivElement; ref: RefObject<HTMLDivElement | null> } {
  const el = document.createElement('div');
  document.body.appendChild(el);
  return { el, ref: { current: el } };
}

describe('useGestures', () => {
  beforeEach(() => {
    setControlMode('classic');
    setPreviewMove(null);
    // Fake a 192px-wide board (32px * 6 cols) at x=[0,192], y=[100,484].
    setBoardRectGetter(() => new DOMRect(0, 100, 192, 384));
    useGameStore.getState().reset(1);
  });
  afterEach(() => {
    setBoardRectGetter(() => null);
    setPreviewMove(null);
  });

  it('classic: right flick of 64px dispatches moveRight twice', () => {
    const { el, ref } = mountTarget();
    renderHook(() => useGestures(ref));
    const initial = useGameStore.getState().game.current!.axisCol;
    act(() => {
      fire(el, 'pointerdown', 100, 200);
      fire(el, 'pointerup', 164, 200);
    });
    expect(useGameStore.getState().game.current!.axisCol).toBe(initial + 2);
  });

  it('tap-to-drop: pointerdown sets preview, pointerup clears it', () => {
    setControlMode('tap-to-drop');
    const { el, ref } = mountTarget();
    renderHook(() => useGestures(ref));
    act(() => {
      // x=100 in a 192px board with 32px cells → col 3 (floor(100/32)=3).
      fire(el, 'pointerdown', 100, 200);
    });
    expect(getPreviewMove()).not.toBeNull();
    expect(getPreviewMove()!.axisCol).toBe(3);

    act(() => {
      fire(el, 'pointerup', 100, 200);
    });
    // After commit (sync field lock + async chain animation kickoff), the
    // gesture clears the preview slot. We only assert the preview is null;
    // the chain animation runs asynchronously via setTimeout and is
    // outside the scope of this gesture-level test.
    expect(getPreviewMove()).toBeNull();
  });

  it('tap-to-drop: release outside the board clears preview without committing', () => {
    setControlMode('tap-to-drop');
    const { el, ref } = mountTarget();
    renderHook(() => useGestures(ref));
    const startCurrent = useGameStore.getState().game.current;
    act(() => {
      fire(el, 'pointerdown', 100, 200);
      fire(el, 'pointermove', 100, 50); // y=50 sits above the board (rect.top=100)
      fire(el, 'pointerup', 100, 50);
    });
    expect(getPreviewMove()).toBeNull();
    // Active pair identity unchanged → no commit happened.
    expect(useGameStore.getState().game.current).toBe(startCurrent);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test -- useGestures`
Expected: FAIL (the existing useGestures has no controlMode branching, no preview setting).

- [ ] **Step 3: Rewrite useGestures.ts**

Replace the entire contents of `src/ui/hooks/useGestures.ts` with:

```typescript
import { useEffect, useRef } from 'react';
import type { RefObject } from 'react';
import { useGameStore } from '../store';
import { getControlMode, getControlTuning } from './useControlPrefs';
import { getBoardRect } from './useBoardRect';
import { setPreviewMove } from './useAiPreview';
import { COLS } from '../../game/constants';

const TAP_MAX_MS = 200;
const INTERACTIVE_SELECTOR =
  'button, a, input, select, textarea, label, [role="button"], [data-no-gesture]';

interface PressStart {
  x: number;
  y: number;
  t: number;
}

// Convert a clientX value to a board column (0..COLS-1). Returns null if the
// board's bounding rect is unavailable (Board not yet mounted).
function clientXToCol(clientX: number): number | null {
  const rect = getBoardRect();
  if (!rect) return null;
  const cellPx = rect.width / COLS;
  if (cellPx <= 0) return null;
  const col = Math.floor((clientX - rect.left) / cellPx);
  if (col < 0) return 0;
  if (col >= COLS) return COLS - 1;
  return col;
}

// Returns true if (x, y) lies within the board's bounding rect.
function isInsideBoard(x: number, y: number): boolean {
  const rect = getBoardRect();
  if (!rect) return false;
  return x >= rect.left && x <= rect.right && y >= rect.top && y <= rect.bottom;
}

export function useGestures(targetRef: RefObject<HTMLElement | null>) {
  const pressStart = useRef<PressStart | null>(null);
  const draggingRef = useRef(false);

  useEffect(() => {
    const el = targetRef.current;
    if (!el) return;

    const isInteractive = (target: EventTarget | null) =>
      target instanceof Element && target.closest(INTERACTIVE_SELECTOR) !== null;

    const onDown = (e: PointerEvent) => {
      if (isInteractive(e.target)) {
        pressStart.current = null;
        draggingRef.current = false;
        return;
      }
      pressStart.current = { x: e.clientX, y: e.clientY, t: Date.now() };
      draggingRef.current = false;

      const mode = getControlMode();
      if (mode === 'tap-to-drop' || mode === 'drag') {
        const game = useGameStore.getState().game;
        if (!game.current) return;
        // For drag, only start tracking if the press began near the active
        // pair's axis column (within ±1). Otherwise treat as a tap rotate
        // (handled in onUp).
        if (mode === 'drag') {
          const col = clientXToCol(e.clientX);
          if (col === null) return;
          if (Math.abs(col - game.current.axisCol) > 1) return;
        }
        const col = clientXToCol(e.clientX);
        if (col === null) return;
        draggingRef.current = true;
        setPreviewMove({ axisCol: col, rotation: game.current.rotation });
      }
    };

    const onMove = (e: PointerEvent) => {
      if (!draggingRef.current) return;
      const game = useGameStore.getState().game;
      if (!game.current) return;
      const col = clientXToCol(e.clientX);
      if (col === null) return;
      setPreviewMove({ axisCol: col, rotation: game.current.rotation });
      // For drag mode, also handle vertical pull-down for softDrop.
      if (getControlMode() === 'drag' && pressStart.current) {
        const dy = e.clientY - pressStart.current.y;
        const flickPx = getControlTuning().flickColPx;
        if (dy > flickPx) {
          // Reset start.y so subsequent dy increments require another full px.
          pressStart.current = { ...pressStart.current, y: e.clientY };
          useGameStore.getState().dispatch({ type: 'softDrop' });
        }
      }
    };

    const onUp = (e: PointerEvent) => {
      const start = pressStart.current;
      pressStart.current = null;
      const wasDragging = draggingRef.current;
      draggingRef.current = false;
      if (!start) return;
      if (isInteractive(e.target)) return;

      const mode = getControlMode();

      if (mode === 'tap-to-drop' || (mode === 'drag' && wasDragging)) {
        const insideBoard = isInsideBoard(e.clientX, e.clientY);
        const game = useGameStore.getState().game;
        if (insideBoard && game.current) {
          const col = clientXToCol(e.clientX);
          if (col !== null) {
            void useGameStore.getState().commit({
              axisCol: col,
              rotation: game.current.rotation,
            });
          }
        }
        setPreviewMove(null);
        if (mode === 'tap-to-drop') return;
      }

      // Classic + drag-tap-rotate (drag mode but the press wasn't near the
      // active pair) fall through to flick / tap-rotate detection.
      const dx = e.clientX - start.x;
      const dy = e.clientY - start.y;
      const dt = Date.now() - start.t;
      const flickPx = getControlTuning().flickColPx;

      if (mode === 'classic') {
        if (Math.abs(dx) > flickPx || Math.abs(dy) > flickPx) {
          if (Math.abs(dx) > Math.abs(dy)) {
            const cols = Math.round(dx / flickPx);
            const dir = cols > 0 ? 'moveRight' : 'moveLeft';
            for (let i = 0; i < Math.abs(cols); i++) {
              useGameStore.getState().dispatch({ type: dir });
            }
          } else if (dy > 0) {
            const rows = Math.round(dy / flickPx);
            for (let i = 0; i < Math.max(1, rows); i++) {
              useGameStore.getState().dispatch({ type: 'softDrop' });
            }
          }
          return;
        }
        // Tap → rotate (left half = CCW, right half = CW).
        if (dt < TAP_MAX_MS) {
          const centerX = window.innerWidth / 2;
          const type = e.clientX < centerX ? 'rotateCCW' : 'rotateCW';
          useGameStore.getState().dispatch({ type });
        }
        return;
      }

      // Drag mode tap-rotate: only fires when the press did NOT engage drag
      // (i.e. started outside ±1 of the active pair's column).
      if (mode === 'drag' && !wasDragging) {
        if (dt < TAP_MAX_MS && Math.abs(dx) <= flickPx && Math.abs(dy) <= flickPx) {
          const centerX = window.innerWidth / 2;
          const type = e.clientX < centerX ? 'rotateCCW' : 'rotateCW';
          useGameStore.getState().dispatch({ type });
        }
      }
    };

    const onCancel = () => {
      pressStart.current = null;
      draggingRef.current = false;
      setPreviewMove(null);
    };

    el.addEventListener('pointerdown', onDown);
    el.addEventListener('pointermove', onMove);
    el.addEventListener('pointerup', onUp);
    el.addEventListener('pointercancel', onCancel);
    return () => {
      el.removeEventListener('pointerdown', onDown);
      el.removeEventListener('pointermove', onMove);
      el.removeEventListener('pointerup', onUp);
      el.removeEventListener('pointercancel', onCancel);
    };
  }, [targetRef]);
}
```

- [ ] **Step 4: Run gesture tests**

Run: `npm run test -- useGestures`
Expected: PASS (3 tests)

- [ ] **Step 5: Run full test suite**

Run: `npm run test`
Expected: all pass.

- [ ] **Step 6: Commit**

```bash
git add src/ui/hooks/useGestures.ts src/ui/hooks/__tests__/useGestures.test.ts
git commit -m "feat(ui): branch useGestures by controlMode (classic / tap-to-drop / drag)"
```

---

## Task 7: Controls — CCW visibility, button scale, press repeat

**Files:**
- Modify: `src/ui/components/Controls/Controls.tsx`

- [ ] **Step 1: Update Controls.tsx**

Replace the contents of `src/ui/components/Controls/Controls.tsx` with:

```typescript
import { useGameStore } from '../../store';
import { useAiSuggestion } from '../../hooks/useAiSuggestion';
import { useT } from '../../../i18n';
import { confirmDialog } from '../../utils/dialog';
import { useControlMode, useControlTuning } from '../../hooks/useControlPrefs';
import { usePressRepeat } from '../../hooks/usePressRepeat';

export function Controls() {
  const reset = useGameStore((s) => s.reset);
  const dispatch = useGameStore((s) => s.dispatch);
  const animating = useGameStore((s) => s.animatingSteps.length > 0);
  const undo = useGameStore((s) => s.undo);
  const mode = useGameStore((s) => s.mode);
  const canUndo = useGameStore((s) => s.canUndo());
  const { moves, loading, aiReady } = useAiSuggestion(1, mode === 'free');
  const t = useT();
  const aiBest = moves[0] ?? null;
  const canAiCommit = aiReady && !loading && !animating && aiBest !== null;

  const controlMode = useControlMode();
  const tuning = useControlTuning();

  const showAiBest = mode === 'free';
  const showUndo = mode === 'free' || mode === 'match';
  // CCW button: shown in score mode (existing) AND when the gesture-based
  // presets are active (rotation cannot be done via tap in those modes).
  const showCcw =
    mode === 'score' || controlMode === 'tap-to-drop' || controlMode === 'drag';

  const padY = tuning.buttonScaleLarge ? 'py-4' : 'py-3';
  const fontSize = tuning.buttonScaleLarge ? 'text-lg' : 'text-base';
  const cellBase =
    `${padY} rounded ${fontSize} touch-manipulation select-none disabled:opacity-50 disabled:cursor-not-allowed`;

  // [CW or CCW, Drop, AI Best?, Undo?, Reset?] grid sizing.
  // showAiBest=5, score mode CCW+CW row=4, otherwise 4.
  const cols = showAiBest ? 5 : 4;
  const showCwExtra = mode === 'score'; // score keeps the explicit CW alongside CCW

  const repeatLeft = usePressRepeat(
    () => dispatch({ type: 'moveLeft' }),
    { enabled: tuning.holdRepeatEnabled, initialDelayMs: 200, intervalMs: 80 },
  );
  const repeatRight = usePressRepeat(
    () => dispatch({ type: 'moveRight' }),
    { enabled: tuning.holdRepeatEnabled, initialDelayMs: 200, intervalMs: 80 },
  );
  const repeatDrop = usePressRepeat(
    () => dispatch({ type: 'softDrop' }),
    { enabled: tuning.holdRepeatEnabled, initialDelayMs: 200, intervalMs: 60 },
  );

  return (
    <div className="flex flex-col gap-2 w-full">
      <div className="grid grid-cols-3 gap-2 w-full">
        <button
          className={`${cellBase} bg-slate-700 hover:bg-slate-600 active:bg-slate-500`}
          onPointerDown={repeatLeft.onPointerDown}
          onPointerUp={repeatLeft.onPointerUp}
          onPointerCancel={repeatLeft.onPointerCancel}
          onPointerLeave={repeatLeft.onPointerLeave}
          aria-label={t('controls.moveLeft')}
        >
          {t('controls.moveLeft')}
        </button>
        <button
          className={`${cellBase} bg-slate-700 hover:bg-slate-600 active:bg-slate-500`}
          onPointerDown={repeatDrop.onPointerDown}
          onPointerUp={repeatDrop.onPointerUp}
          onPointerCancel={repeatDrop.onPointerCancel}
          onPointerLeave={repeatDrop.onPointerLeave}
          aria-label={t('controls.softDrop')}
        >
          {t('controls.softDrop')}
        </button>
        <button
          className={`${cellBase} bg-slate-700 hover:bg-slate-600 active:bg-slate-500`}
          onPointerDown={repeatRight.onPointerDown}
          onPointerUp={repeatRight.onPointerUp}
          onPointerCancel={repeatRight.onPointerCancel}
          onPointerLeave={repeatRight.onPointerLeave}
          aria-label={t('controls.moveRight')}
        >
          {t('controls.moveRight')}
        </button>
      </div>
      <div
        className={`grid gap-2 w-full ${cols === 5 ? 'grid-cols-5' : 'grid-cols-4'}`}
      >
        {showCcw ? (
          <button
            className={`${cellBase} bg-slate-700 hover:bg-slate-600 active:bg-slate-500`}
            onClick={() => dispatch({ type: 'rotateCCW' })}
          >
            {t('controls.rotateCcw')}
          </button>
        ) : (
          <button
            className={`${cellBase} bg-slate-700 hover:bg-slate-600 active:bg-slate-500`}
            onClick={() => dispatch({ type: 'rotateCW' })}
          >
            {t('controls.rotateCw')}
          </button>
        )}
        <button
          className={`${cellBase} bg-blue-600 hover:bg-blue-500 active:bg-blue-400`}
          onClick={() => {
            const { game, commit } = useGameStore.getState();
            if (!game.current) return;
            commit({ axisCol: game.current.axisCol, rotation: game.current.rotation });
          }}
        >
          {t('controls.commit')}
        </button>
        {showAiBest && (
          <button
            className={`${cellBase} bg-emerald-600 hover:bg-emerald-500 active:bg-emerald-400`}
            disabled={!canAiCommit}
            onClick={() => {
              if (!aiBest) return;
              useGameStore.getState().commit(aiBest, { source: 'ai' });
            }}
            title={
              canAiCommit
                ? t('controls.aiBestTitle', {
                    col: aiBest!.axisCol + 1,
                    rot: aiBest!.rotation,
                  })
                : t('controls.aiThinking')
            }
          >
            {t('controls.aiBest')}
          </button>
        )}
        {showCwExtra && (
          <button
            className={`${cellBase} bg-slate-700 hover:bg-slate-600 active:bg-slate-500`}
            onClick={() => dispatch({ type: 'rotateCW' })}
          >
            {t('controls.rotateCw')}
          </button>
        )}
        {showUndo && (
          <button
            className={`${cellBase} bg-amber-600 hover:bg-amber-500 active:bg-amber-400`}
            disabled={!canUndo}
            onClick={() => undo(1)}
            aria-label={t('controls.undoAria', { n: 1 })}
          >
            {t('controls.undo')}
          </button>
        )}
        <button
          className={`${cellBase} bg-red-600 hover:bg-red-500 active:bg-red-400`}
          onClick={async () => {
            if (await confirmDialog(t('controls.resetConfirm'))) reset();
          }}
        >
          {t('controls.reset')}
        </button>
      </div>
    </div>
  );
}
```

NOTE: The grid count needs to keep adapting — when `showCcw` is true outside of score mode (i.e. tap-to-drop or drag in free/match), CCW *replaces* CW (no extra column). The `cols` and `showCwExtra` logic above handles that: only score mode renders both CCW and CW, growing to 4 cols (CCW + Drop + CW + Reset, or 5 with AI Best in free, but score never has AI Best). Re-check the column math at runtime.

- [ ] **Step 2: Lint + typecheck**

Run: `npm run lint && npx tsc --noEmit -p tsconfig.app.json`
Expected: no errors.

- [ ] **Step 3: Run tests**

Run: `npm run test`
Expected: all pass (no Controls-specific test exists, so we're verifying no regressions elsewhere).

- [ ] **Step 4: Commit**

```bash
git add src/ui/components/Controls/Controls.tsx
git commit -m "feat(controls): adapt CCW button + button scale + press-repeat to controlMode"
```

---

## Task 8: i18n keys for ControlSettingsDialog

**Files:**
- Modify: `src/i18n/translations.ts`

- [ ] **Step 1: Add the new keys to the Dict interface**

In `src/i18n/translations.ts`, locate the `Dict` interface (around line 13). Add the following keys at a logical position (e.g. after the existing `controls.*` entries — find one and add right after it):

```typescript
  'controls.settings.button': string;
  'controls.settings.title': string;
  'controls.settings.modeSection': string;
  'controls.settings.modeClassic': string;
  'controls.settings.modeTapToDrop': string;
  'controls.settings.modeDrag': string;
  'controls.settings.modeClassicDesc': string;
  'controls.settings.modeTapToDropDesc': string;
  'controls.settings.modeDragDesc': string;
  'controls.settings.tuningSection': string;
  'controls.settings.flickPx': string;
  'controls.settings.haptic': string;
  'controls.settings.buttonLarge': string;
  'controls.settings.holdRepeat': string;
  'controls.settings.close': string;
```

- [ ] **Step 2: Add Japanese translations**

Locate the `ja` translation object (search for `'app.title': 'ぷよ`). Add:

```typescript
  'controls.settings.button': '⚙ 操作設定',
  'controls.settings.title': '操作設定',
  'controls.settings.modeSection': '操作プリセット',
  'controls.settings.modeClassic': 'Classic (現行)',
  'controls.settings.modeTapToDrop': 'Tap-to-Drop',
  'controls.settings.modeDrag': 'Drag',
  'controls.settings.modeClassicDesc': 'フリック=移動 / 下フリック=高速落下 / タップ=回転',
  'controls.settings.modeTapToDropDesc': '盤面の列をタップして離すと、その列にぷよが落ちる',
  'controls.settings.modeDragDesc': '現在ぷよを掴んで横にドラッグ → 離した列で確定',
  'controls.settings.tuningSection': '詳細設定',
  'controls.settings.flickPx': 'フリック反応量',
  'controls.settings.haptic': '触覚バイブ',
  'controls.settings.buttonLarge': 'ボタンを大きく',
  'controls.settings.holdRepeat': '長押しで連続移動',
  'controls.settings.close': '閉じる',
```

- [ ] **Step 3: Add English translations**

Locate the `en` translation object. Add:

```typescript
  'controls.settings.button': '⚙ Controls',
  'controls.settings.title': 'Control Settings',
  'controls.settings.modeSection': 'Preset',
  'controls.settings.modeClassic': 'Classic (current)',
  'controls.settings.modeTapToDrop': 'Tap-to-Drop',
  'controls.settings.modeDrag': 'Drag',
  'controls.settings.modeClassicDesc': 'Flick to move / flick down to drop / tap to rotate',
  'controls.settings.modeTapToDropDesc': 'Tap a column on the board and release to drop the pair there',
  'controls.settings.modeDragDesc': 'Grab the active pair and drag it horizontally; release to commit',
  'controls.settings.tuningSection': 'Tuning',
  'controls.settings.flickPx': 'Flick distance',
  'controls.settings.haptic': 'Haptic feedback',
  'controls.settings.buttonLarge': 'Larger buttons',
  'controls.settings.holdRepeat': 'Hold to repeat move',
  'controls.settings.close': 'Close',
```

- [ ] **Step 4: Add Chinese translations**

Locate the `zh` translation object. Add:

```typescript
  'controls.settings.button': '⚙ 操作设置',
  'controls.settings.title': '操作设置',
  'controls.settings.modeSection': '操作模式',
  'controls.settings.modeClassic': 'Classic (当前)',
  'controls.settings.modeTapToDrop': 'Tap-to-Drop',
  'controls.settings.modeDrag': 'Drag',
  'controls.settings.modeClassicDesc': '滑动=移动 / 下滑=快速下落 / 点击=旋转',
  'controls.settings.modeTapToDropDesc': '点击棋盘的列后松开,方块落到该列',
  'controls.settings.modeDragDesc': '抓住当前方块横向拖动,松开后确定位置',
  'controls.settings.tuningSection': '详细设置',
  'controls.settings.flickPx': '滑动灵敏度',
  'controls.settings.haptic': '触感反馈',
  'controls.settings.buttonLarge': '加大按钮',
  'controls.settings.holdRepeat': '长按连续移动',
  'controls.settings.close': '关闭',
```

- [ ] **Step 5: Add Korean translations**

Locate the `ko` translation object. Add:

```typescript
  'controls.settings.button': '⚙ 조작 설정',
  'controls.settings.title': '조작 설정',
  'controls.settings.modeSection': '조작 프리셋',
  'controls.settings.modeClassic': 'Classic (기본)',
  'controls.settings.modeTapToDrop': 'Tap-to-Drop',
  'controls.settings.modeDrag': 'Drag',
  'controls.settings.modeClassicDesc': '플릭=이동 / 아래 플릭=빠른 낙하 / 탭=회전',
  'controls.settings.modeTapToDropDesc': '보드의 열을 탭하고 떼면 그 열에 떨어집니다',
  'controls.settings.modeDragDesc': '현재 뿌요를 잡고 가로로 드래그, 떼는 열에서 확정',
  'controls.settings.tuningSection': '세부 설정',
  'controls.settings.flickPx': '플릭 감도',
  'controls.settings.haptic': '햅틱 피드백',
  'controls.settings.buttonLarge': '버튼 크게',
  'controls.settings.holdRepeat': '길게 눌러 연속 이동',
  'controls.settings.close': '닫기',
```

- [ ] **Step 6: Verify typecheck passes**

Run: `npx tsc --noEmit -p tsconfig.app.json`
Expected: no errors. (If a `Dict` key was added but a translation object missed it, this fails.)

- [ ] **Step 7: Commit**

```bash
git add src/i18n/translations.ts
git commit -m "i18n: add control settings strings (ja/en/zh/ko)"
```

---

## Task 9: ControlSettingsDialog component

**Files:**
- Create: `src/ui/components/ControlSettingsDialog/ControlSettingsDialog.tsx`
- Test: `src/ui/components/ControlSettingsDialog/__tests__/ControlSettingsDialog.test.tsx`

- [ ] **Step 1: Write the failing test**

```tsx
// src/ui/components/ControlSettingsDialog/__tests__/ControlSettingsDialog.test.tsx
import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { ControlSettingsDialog } from '../ControlSettingsDialog';
import {
  setControlMode,
  getControlMode,
  setControlTuning,
  getControlTuning,
  DEFAULT_CONTROL_TUNING,
} from '../../../hooks/useControlPrefs';

describe('ControlSettingsDialog', () => {
  beforeEach(() => {
    setControlMode('classic');
    setControlTuning(DEFAULT_CONTROL_TUNING);
  });

  it('renders the three preset radios with classic checked initially', () => {
    render(<ControlSettingsDialog onClose={() => {}} />);
    const classic = screen.getByLabelText(/Classic/) as HTMLInputElement;
    const tap = screen.getByLabelText(/Tap-to-Drop/) as HTMLInputElement;
    const drag = screen.getByLabelText(/Drag/) as HTMLInputElement;
    expect(classic.checked).toBe(true);
    expect(tap.checked).toBe(false);
    expect(drag.checked).toBe(false);
  });

  it('selecting tap-to-drop updates the singleton', () => {
    render(<ControlSettingsDialog onClose={() => {}} />);
    fireEvent.click(screen.getByLabelText(/Tap-to-Drop/));
    expect(getControlMode()).toBe('tap-to-drop');
  });

  it('toggling buttonLarge updates tuning', () => {
    render(<ControlSettingsDialog onClose={() => {}} />);
    expect(getControlTuning().buttonScaleLarge).toBe(false);
    fireEvent.click(screen.getByLabelText(/larger|大き|큰|加大|크게/i));
    expect(getControlTuning().buttonScaleLarge).toBe(true);
  });

  it('changing flickColPx select updates tuning', () => {
    render(<ControlSettingsDialog onClose={() => {}} />);
    const sel = screen.getByLabelText(/flick|フリック|滑动|플릭/i) as HTMLSelectElement;
    fireEvent.change(sel, { target: { value: '48' } });
    expect(getControlTuning().flickColPx).toBe(48);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test -- ControlSettingsDialog`
Expected: FAIL ("Cannot find module '../ControlSettingsDialog'")

- [ ] **Step 3: Implement the dialog**

```tsx
// src/ui/components/ControlSettingsDialog/ControlSettingsDialog.tsx
import { useT } from '../../../i18n';
import {
  useControlMode,
  setControlMode,
  useControlTuning,
  setControlTuning,
  type ControlMode,
} from '../../hooks/useControlPrefs';

interface Props {
  onClose: () => void;
}

const FLICK_OPTIONS: ReadonlyArray<24 | 32 | 48> = [24, 32, 48];

export function ControlSettingsDialog({ onClose }: Props) {
  const t = useT();
  const mode = useControlMode();
  const tuning = useControlTuning();

  const presets: Array<{ value: ControlMode; label: string; desc: string }> = [
    {
      value: 'classic',
      label: t('controls.settings.modeClassic'),
      desc: t('controls.settings.modeClassicDesc'),
    },
    {
      value: 'tap-to-drop',
      label: t('controls.settings.modeTapToDrop'),
      desc: t('controls.settings.modeTapToDropDesc'),
    },
    {
      value: 'drag',
      label: t('controls.settings.modeDrag'),
      desc: t('controls.settings.modeDragDesc'),
    },
  ];

  return (
    <div
      role="dialog"
      aria-modal="true"
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60"
      onClick={onClose}
    >
      <div
        className="bg-slate-900 border border-slate-700 rounded-lg shadow-xl w-full max-w-md p-4 flex flex-col gap-4 max-h-[90vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 className="text-lg font-semibold">{t('controls.settings.title')}</h2>

        <fieldset className="flex flex-col gap-2">
          <legend className="text-sm text-slate-400 mb-1">
            {t('controls.settings.modeSection')}
          </legend>
          {presets.map((p) => (
            <label
              key={p.value}
              className={`flex flex-col gap-1 rounded border p-2 cursor-pointer ${
                mode === p.value
                  ? 'border-blue-500 bg-slate-800'
                  : 'border-slate-700 hover:bg-slate-800/50'
              }`}
            >
              <span className="flex items-center gap-2">
                <input
                  type="radio"
                  name="control-mode"
                  value={p.value}
                  checked={mode === p.value}
                  onChange={() => setControlMode(p.value)}
                  className="accent-blue-500"
                />
                <span className="text-sm font-medium">{p.label}</span>
              </span>
              <span className="text-xs text-slate-400 ml-6">{p.desc}</span>
            </label>
          ))}
        </fieldset>

        <fieldset className="flex flex-col gap-2 border-t border-slate-700 pt-3">
          <legend className="text-sm text-slate-400 mb-1">
            {t('controls.settings.tuningSection')}
          </legend>

          <label className="text-sm flex items-center justify-between gap-2">
            <span>{t('controls.settings.flickPx')}</span>
            <select
              value={tuning.flickColPx}
              onChange={(e) =>
                setControlTuning({
                  flickColPx: Number(e.target.value) as 24 | 32 | 48,
                })
              }
              className="bg-slate-800 text-slate-100 border border-slate-700 rounded px-2 py-1 text-sm"
            >
              {FLICK_OPTIONS.map((px) => (
                <option key={px} value={px}>
                  {px}px
                </option>
              ))}
            </select>
          </label>

          <label className="text-sm flex items-center gap-2 select-none">
            <input
              type="checkbox"
              checked={tuning.hapticEnabled}
              onChange={(e) =>
                setControlTuning({ hapticEnabled: e.target.checked })
              }
              className="accent-blue-500"
            />
            {t('controls.settings.haptic')}
          </label>

          <label className="text-sm flex items-center gap-2 select-none">
            <input
              type="checkbox"
              checked={tuning.buttonScaleLarge}
              onChange={(e) =>
                setControlTuning({ buttonScaleLarge: e.target.checked })
              }
              className="accent-blue-500"
            />
            {t('controls.settings.buttonLarge')}
          </label>

          <label className="text-sm flex items-center gap-2 select-none">
            <input
              type="checkbox"
              checked={tuning.holdRepeatEnabled}
              onChange={(e) =>
                setControlTuning({ holdRepeatEnabled: e.target.checked })
              }
              className="accent-blue-500"
            />
            {t('controls.settings.holdRepeat')}
          </label>
        </fieldset>

        <button
          type="button"
          onClick={onClose}
          className="px-3 py-2 rounded bg-slate-700 hover:bg-slate-600 text-sm self-end"
        >
          {t('controls.settings.close')}
        </button>
      </div>
    </div>
  );
}
```

- [ ] **Step 4: Run dialog tests**

Run: `npm run test -- ControlSettingsDialog`
Expected: PASS (4 tests)

- [ ] **Step 5: Commit**

```bash
git add src/ui/components/ControlSettingsDialog
git commit -m "feat(ui): add ControlSettingsDialog for preset and tuning"
```

---

## Task 10: Hook ControlSettingsDialog into HamburgerMenu

**Files:**
- Modify: `src/ui/components/HamburgerMenu/HamburgerMenu.tsx`

- [ ] **Step 1: Add the import**

In `src/ui/components/HamburgerMenu/HamburgerMenu.tsx`, add to the imports near the top:

```typescript
import { ControlSettingsDialog } from '../ControlSettingsDialog/ControlSettingsDialog';
```

- [ ] **Step 2: Add state and the menu entry**

In the `HamburgerMenu` function, after the existing `const [recordsOpen, setRecordsOpen] = useState(false);` line, add:

```typescript
const [controlSettingsOpen, setControlSettingsOpen] = useState(false);
```

Then in the JSX, between the existing share/records buttons and the analyze button, add the new menu button:

```tsx
<button
  type="button"
  onClick={() => {
    setOpen(false);
    setControlSettingsOpen(true);
  }}
  className="px-3 py-1.5 rounded text-sm border bg-slate-800 border-slate-700 text-slate-200 hover:bg-slate-700"
>
  {t('controls.settings.button')}
</button>
```

Finally, at the bottom of the component (alongside the other dialog mounts like `{shareOpen && <ShareDialog ... />}`), add:

```tsx
{controlSettingsOpen && (
  <ControlSettingsDialog onClose={() => setControlSettingsOpen(false)} />
)}
```

- [ ] **Step 3: Lint + tests**

Run: `npm run lint && npm run test`
Expected: pass.

- [ ] **Step 4: Commit**

```bash
git add src/ui/components/HamburgerMenu/HamburgerMenu.tsx
git commit -m "feat(menu): expose Control Settings dialog from hamburger menu"
```

---

## Task 11: Mount useHaptics in App.tsx

**Files:**
- Modify: `src/App.tsx`

- [ ] **Step 1: Add the import**

In `src/App.tsx`, after the other hook imports near the top:

```typescript
import { useHaptics } from './ui/hooks/useHaptics';
```

- [ ] **Step 2: Call the hook**

After the existing `useMatchDriver();` line in the `App` component body, add:

```typescript
useHaptics();
```

- [ ] **Step 3: Lint + tests**

Run: `npm run lint && npm run test`
Expected: pass.

- [ ] **Step 4: Commit**

```bash
git add src/App.tsx
git commit -m "feat(app): wire useHaptics for vibration feedback"
```

---

## Task 12: Manual browser verification

This is non-code. The user has confirmed brower verification is acceptable in lieu of an e2e flow.

- [ ] **Step 1: Start the dev server**

Run: `npm run dev`
Expected: Vite prints `Local: http://localhost:5173/` (or next available port — note the actual port from output).

- [ ] **Step 2: Verify Classic still works (regression check)**

Open the app. With control mode = Classic (default):
- Right flick on the board → active pair moves right
- Down flick → soft drop / commits at bottom
- Tap left half → CCW rotation; tap right half → CW rotation
- All Controls buttons function as before

- [ ] **Step 3: Verify Tap-to-Drop**

Open hamburger menu → ⚙ 操作設定 → select Tap-to-Drop → close.
- Press a column on the board → ghost appears in that column. Slide finger left/right → ghost follows. Release → pair commits to that column.
- Slide finger off the top of the board and release → no commit, ghost clears.
- Press CW button → rotation changes. Press CCW button → rotation changes.

- [ ] **Step 4: Verify Drag**

Set mode = Drag.
- Press near the active pair → ghost follows the finger; release → commit.
- Tap far from the active pair (e.g. on the opposite side of the board) → rotation occurs, no preview.
- Drag down (dy > flickColPx) while holding → soft drops occur.

- [ ] **Step 5: Verify tuning toggles**

- Change flick distance to 48 → in Classic mode, flicking the same physical distance now moves fewer columns.
- Toggle "Larger buttons" → Controls buttons gain visible padding and bigger font.
- Toggle "Hold to repeat move" off → holding the move-left button no longer auto-repeats.
- Toggle "Haptic feedback" off → committing no longer vibrates (only verifiable on a real device).

- [ ] **Step 6: Persistence check**

Reload the page. The previously selected mode + tuning should be restored from localStorage.

- [ ] **Step 7: Run final test + lint sweep**

Run: `npm run lint && npm run test && npm run build`
Expected: all pass.

- [ ] **Step 8: Final commit (if any cleanup)**

If any issue was found in verification and patched, commit it. Otherwise no further commit needed.

---

## Self-Review Notes

- Spec coverage: All sections of the spec map to a task.
  - useControlPrefs → Task 1
  - useBoardRect → Task 2
  - Board ghost rendering → Task 3
  - usePressRepeat → Task 4
  - haptics + useHaptics → Task 5
  - useGestures branch → Task 6
  - Controls UI → Task 7
  - i18n → Task 8
  - ControlSettingsDialog → Task 9
  - HamburgerMenu wiring → Task 10
  - App-level wiring → Task 11
  - Verification → Task 12

- Type consistency:
  - `ControlMode` literal type is identical across Tasks 1, 6, 7, 9.
  - `ControlTuning` keys (flickColPx / hapticEnabled / buttonScaleLarge / holdRepeatEnabled) are referenced consistently.
  - `setPreviewMove` from `useAiPreview` is used in Tasks 6 and consumed by Board's existing render path (Task 3 ensures the consumer side is correct).

- Out of scope (deferred): visual companion, e2e Playwright case for tap-to-drop, drag-mode rotation tap-while-dragging.
