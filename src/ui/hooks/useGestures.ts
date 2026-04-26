import { useEffect, useRef } from 'react';
import type { RefObject } from 'react';
import { useGameStore } from '../store';

// 本家ぷよぷよ(モバイル)準拠:
//  - 右フリック / 左フリック → 1 列ずつ右/左移動
//  - 下フリック             → 高速移動(softDrop)
//  - 画面右側タップ          → 右回転
//  - 画面左側タップ          → 左回転
//
// targetRef は「タップ判定の領域」。盤面ではなく画面本体に張ると、画面の左右端まで
// タップで回転できるようになる。ボタン等のインタラクティブ要素のクリックは
// gesture を発火させないように `target.closest` で除外する。
const SWIPE_COL_PX = 32;
const TAP_MAX_MS = 200;
const INTERACTIVE_SELECTOR = 'button, a, input, select, textarea, label, [role="button"]';

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

      // タップ:画面の左半分=左回転、右半分=右回転。中心はビューポート幅で判定
      // (targetRef の rect ではなく window.innerWidth)。これにより画面右端まで
      // 確実に右回転、左端まで左回転として効く。
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
