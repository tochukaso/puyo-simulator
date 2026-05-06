import type { RefObject } from 'react';
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useGestures } from '../useGestures';
import { useGameStore } from '../../store';
import {
  setControlMode,
  setControlTuning,
  DEFAULT_CONTROL_TUNING,
} from '../useControlPrefs';
import { setBoardRectGetter } from '../useBoardRect';
import { setPreviewMove, getPreviewMove } from '../useAiPreview';

function fire(el: HTMLElement, type: string, x: number, y: number) {
  const ev = new PointerEvent(type, {
    clientX: x,
    clientY: y,
    bubbles: true,
    pointerId: 1,
    pointerType: 'touch',
  });
  el.dispatchEvent(ev);
}

// テストで appendChild した div を afterEach で確実に外すための追跡配列。
// 残ると次のテストで stale な listener が残って干渉する可能性がある。
const mountedTargets: HTMLDivElement[] = [];

function mountTarget(): { el: HTMLDivElement; ref: RefObject<HTMLDivElement | null> } {
  const el = document.createElement('div');
  document.body.appendChild(el);
  mountedTargets.push(el);
  return { el, ref: { current: el } };
}

describe('useGestures', () => {
  beforeEach(() => {
    setControlMode('classic');
    // Tuning is a singleton persisted across tests in this process; if another
    // suite mutated flickColPx the threshold-dependent assertions here would
    // flake. Reset to defaults explicitly.
    setControlTuning(DEFAULT_CONTROL_TUNING);
    setPreviewMove(null);
    // Fake a 192px-wide board (32px * 6 cols) at x=[0,192], y=[100,484].
    setBoardRectGetter(() => new DOMRect(0, 100, 192, 384));
    useGameStore.getState().reset(1);
  });
  afterEach(() => {
    setBoardRectGetter(() => null);
    setPreviewMove(null);
    while (mountedTargets.length) {
      mountedTargets.pop()!.remove();
    }
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
    expect(useGameStore.getState().game.current).toBe(startCurrent);
  });

  it('tap-to-drop: pointerdown outside board then release inside does NOT commit', () => {
    setControlMode('tap-to-drop');
    const { el, ref } = mountTarget();
    renderHook(() => useGestures(ref));
    const startCurrent = useGameStore.getState().game.current;
    act(() => {
      fire(el, 'pointerdown', 100, 50);  // y=50 outside (above) board
      fire(el, 'pointermove', 100, 200); // y=200 inside board now
      fire(el, 'pointerup', 100, 200);
    });
    // Press never started a preview (bounds guard), so release should not
    // trigger a commit even though the release coords are inside the board.
    expect(getPreviewMove()).toBeNull();
    expect(useGameStore.getState().game.current).toBe(startCurrent);
  });

  // ---- Drag mode coverage ----
  // Board: 192px / 6 cols = 32px/col. Spawn axisCol=2 → x=[64, 96).
  // ±1 range = cols 1..3 → x=[32, 128). Outside ±1 = cols 0, 4, 5.

  it('drag: pointerdown within ±1 column starts preview', () => {
    setControlMode('drag');
    const { el, ref } = mountTarget();
    renderHook(() => useGestures(ref));
    act(() => {
      // x=80 → col 2 (= axisCol). Within ±1 range, preview starts.
      fire(el, 'pointerdown', 80, 200);
    });
    expect(getPreviewMove()).not.toBeNull();
    expect(getPreviewMove()!.axisCol).toBe(2);
    act(() => {
      fire(el, 'pointerup', 80, 50); // release outside → no commit
    });
    expect(getPreviewMove()).toBeNull();
  });

  it('drag: large pointermove dy dispatches multiple softDrop steps', () => {
    setControlMode('drag');
    // flickColPx default = 32. dy must cross multiple thresholds.
    const { el, ref } = mountTarget();
    renderHook(() => useGestures(ref));
    const startRow = useGameStore.getState().game.current!.axisRow;
    act(() => {
      fire(el, 'pointerdown', 80, 200); // start drag
      fire(el, 'pointermove', 80, 296); // dy=96 → 3 softDrop steps (96/32)
    });
    // Each softDrop advances axisRow by 1 unless blocked. Three soft-drops on
    // an empty board from a high spawn row land it 3 rows lower.
    const newRow = useGameStore.getState().game.current!.axisRow;
    expect(newRow - startRow).toBe(3);
    act(() => {
      fire(el, 'pointerup', 80, 296);
    });
  });

  it('drag: tap outside ±1 column rotates instead of committing', () => {
    setControlMode('drag');
    const { el, ref } = mountTarget();
    renderHook(() => useGestures(ref));
    const startRotation = useGameStore.getState().game.current!.rotation;
    const startAxisCol = useGameStore.getState().game.current!.axisCol;
    // x=20 → col 0. axisCol=2, so |0-2|=2 > 1 → outside ±1, drag refused.
    // Quick tap → tap-rotate. window.innerWidth=1024, x=20 is in left half
    // → CCW rotation. Rotation cycles 0 → 3.
    act(() => {
      fire(el, 'pointerdown', 20, 200);
      fire(el, 'pointerup', 20, 200);
    });
    const cur = useGameStore.getState().game.current!;
    expect(cur.rotation).not.toBe(startRotation);
    expect(cur.axisCol).toBe(startAxisCol); // not committed/moved
    expect(getPreviewMove()).toBeNull();
  });
});
