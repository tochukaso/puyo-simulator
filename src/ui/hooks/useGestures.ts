import { useEffect, useRef } from 'react';
import type { RefObject } from 'react';
import { useGameStore } from '../store';

const SWIPE_COL_PX = 32;
const SWIPE_DOWN_PX = 60;
const LONG_PRESS_MS = 500;
const TAP_MAX_MS = 200;
const DOUBLE_TAP_MS = 300;

export function useGestures(targetRef: RefObject<HTMLElement | null>) {
  const lastTapAt = useRef(0);
  const pressStart = useRef<{ x: number; y: number; t: number } | null>(null);
  const longPressTimer = useRef<number | null>(null);

  useEffect(() => {
    const el = targetRef.current;
    if (!el) return;

    const onDown = (e: PointerEvent) => {
      e.preventDefault();
      pressStart.current = { x: e.clientX, y: e.clientY, t: Date.now() };
      longPressTimer.current = window.setTimeout(() => {
        useGameStore.getState().dispatch({ type: 'softDrop' });
      }, LONG_PRESS_MS);
    };

    const onUp = (e: PointerEvent) => {
      e.preventDefault();
      const start = pressStart.current;
      pressStart.current = null;
      if (longPressTimer.current) {
        clearTimeout(longPressTimer.current);
        longPressTimer.current = null;
      }
      if (!start) return;
      const dx = e.clientX - start.x;
      const dy = e.clientY - start.y;
      const dt = Date.now() - start.t;

      if (Math.abs(dx) > SWIPE_COL_PX || Math.abs(dy) > SWIPE_COL_PX) {
        if (Math.abs(dx) > Math.abs(dy)) {
          const cols = Math.round(dx / SWIPE_COL_PX);
          const dir = cols > 0 ? 'moveRight' : 'moveLeft';
          for (let i = 0; i < Math.abs(cols); i++) {
            useGameStore.getState().dispatch({ type: dir as 'moveLeft' | 'moveRight' });
          }
        } else if (dy > SWIPE_DOWN_PX) {
          const { game, commit } = useGameStore.getState();
          if (game.current) commit({ axisCol: game.current.axisCol, rotation: game.current.rotation });
        } else if (dy < -SWIPE_COL_PX) {
          // 上スワイプは候補展開(Phase 4 で使用)
        }
        return;
      }

      if (dt < TAP_MAX_MS) {
        const now = Date.now();
        if (now - lastTapAt.current < DOUBLE_TAP_MS) {
          useGameStore.getState().dispatch({ type: 'rotateCCW' });
          lastTapAt.current = 0;
        } else {
          useGameStore.getState().dispatch({ type: 'rotateCW' });
          lastTapAt.current = now;
        }
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
