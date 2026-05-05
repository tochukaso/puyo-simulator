import type { RefObject } from 'react';
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useGestures } from '../useGestures';
import { useGameStore } from '../../store';
import { setControlMode } from '../useControlPrefs';
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
});
