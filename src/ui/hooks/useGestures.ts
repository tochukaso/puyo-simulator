import { useEffect, useRef } from 'react';
import type { RefObject } from 'react';
import { useGameStore } from '../store';

// 本家ぷよぷよ(モバイル)準拠:
//  - 右フリック / 左フリック → 1 列ずつ右/左移動
//  - 下フリック             → 高速移動(softDrop)
//  - 画面右側タップ          → 右回転
//  - 画面左側タップ          → 左回転
const SWIPE_COL_PX = 32;
const TAP_MAX_MS = 200;

export function useGestures(targetRef: RefObject<HTMLElement | null>) {
  const pressStart = useRef<{ x: number; y: number; t: number } | null>(null);

  useEffect(() => {
    const el = targetRef.current;
    if (!el) return;

    const onDown = (e: PointerEvent) => {
      e.preventDefault();
      pressStart.current = { x: e.clientX, y: e.clientY, t: Date.now() };
    };

    const onUp = (e: PointerEvent) => {
      e.preventDefault();
      const start = pressStart.current;
      pressStart.current = null;
      if (!start) return;
      const dx = e.clientX - start.x;
      const dy = e.clientY - start.y;
      const dt = Date.now() - start.t;

      // フリック(横/下)。上方向は未割当。
      if (Math.abs(dx) > SWIPE_COL_PX || Math.abs(dy) > SWIPE_COL_PX) {
        if (Math.abs(dx) > Math.abs(dy)) {
          const cols = Math.round(dx / SWIPE_COL_PX);
          const dir = cols > 0 ? 'moveRight' : 'moveLeft';
          for (let i = 0; i < Math.abs(cols); i++) {
            useGameStore.getState().dispatch({ type: dir });
          }
        } else if (dy > 0) {
          // 下フリックは「高速移動」=softDrop。フリック量(行数)ぶんだけ落とす。
          const rows = Math.round(dy / SWIPE_COL_PX);
          for (let i = 0; i < Math.max(1, rows); i++) {
            useGameStore.getState().dispatch({ type: 'softDrop' });
          }
        }
        return;
      }

      // タップ:左半分=左回転、右半分=右回転。
      if (dt < TAP_MAX_MS) {
        const rect = el.getBoundingClientRect();
        const centerX = rect.left + rect.width / 2;
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
