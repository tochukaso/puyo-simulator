import { useEffect, useRef } from 'react';
import type { RefObject } from 'react';
import { useGameStore } from '../store';

// Mirroring the original Puyo Puyo (mobile):
//  - Right flick / left flick → move one column right/left
//  - Down flick               → fast drop (softDrop)
//  - Tap on the right half     → rotate CW
//  - Tap on the left half      → rotate CCW
//
// targetRef defines the "tap-detection area". Attaching it to the screen body
// rather than the board lets taps near the screen edges still trigger rotation.
// Clicks on interactive elements (buttons, etc.) are excluded via
// `target.closest` so they don't trigger gestures.
const SWIPE_COL_PX = 32;
const TAP_MAX_MS = 200;
const INTERACTIVE_SELECTOR =
  'button, a, input, select, textarea, label, [role="button"], [data-no-gesture]';

export function useGestures(targetRef: RefObject<HTMLElement | null>) {
  const pressStart = useRef<{ x: number; y: number; t: number } | null>(null);

  useEffect(() => {
    const el = targetRef.current;
    if (!el) return;

    const isInteractive = (target: EventTarget | null) =>
      target instanceof Element && target.closest(INTERACTIVE_SELECTOR) !== null;

    const onDown = (e: PointerEvent) => {
      if (isInteractive(e.target)) {
        pressStart.current = null;
        return;
      }
      pressStart.current = { x: e.clientX, y: e.clientY, t: Date.now() };
    };

    const onUp = (e: PointerEvent) => {
      const start = pressStart.current;
      pressStart.current = null;
      if (!start) return;
      if (isInteractive(e.target)) return;
      const dx = e.clientX - start.x;
      const dy = e.clientY - start.y;
      const dt = Date.now() - start.t;

      // Flick (horizontal/down). The upward direction is unassigned.
      if (Math.abs(dx) > SWIPE_COL_PX || Math.abs(dy) > SWIPE_COL_PX) {
        if (Math.abs(dx) > Math.abs(dy)) {
          const cols = Math.round(dx / SWIPE_COL_PX);
          const dir = cols > 0 ? 'moveRight' : 'moveLeft';
          for (let i = 0; i < Math.abs(cols); i++) {
            useGameStore.getState().dispatch({ type: dir });
          }
        } else if (dy > 0) {
          // Down flick = "fast move" = softDrop. Drop by the flick distance (in rows).
          const rows = Math.round(dy / SWIPE_COL_PX);
          for (let i = 0; i < Math.max(1, rows); i++) {
            useGameStore.getState().dispatch({ type: 'softDrop' });
          }
        }
        return;
      }

      // Tap: left half of the screen = rotate CCW, right half = rotate CW. The
      // center is computed from the viewport width (window.innerWidth) rather
      // than targetRef's rect, so taps all the way at the right edge still
      // rotate CW and all the way at the left edge rotate CCW.
      if (dt < TAP_MAX_MS) {
        const centerX = window.innerWidth / 2;
        const type = e.clientX < centerX ? 'rotateCCW' : 'rotateCW';
        useGameStore.getState().dispatch({ type });
      }
    };

    el.addEventListener('pointerdown', onDown);
    el.addEventListener('pointerup', onUp);
    el.addEventListener('pointercancel', onUp);
    return () => {
      el.removeEventListener('pointerdown', onDown);
      el.removeEventListener('pointerup', onUp);
      el.removeEventListener('pointercancel', onUp);
    };
  }, [targetRef]);
}
