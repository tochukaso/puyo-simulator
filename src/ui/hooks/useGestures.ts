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

// pointerup の commit 判定用。tap-to-drop / drag では「列指定」が目的なので、
// 指が盤面の上下にはみ出ても列(=x)が盤面内なら commit するのが直感的。
// 厳密 isInsideBoard だと、ユーザーが指を縦にズラした時に accidental cancel
// になり「同じぷよが残る」ように見えるバグが出やすい。
function isXInsideBoard(x: number): boolean {
  const rect = getBoardRect();
  if (!rect) return false;
  return x >= rect.left && x <= rect.right;
}

// プリセット (classic / tap-to-drop / drag) で挙動を切替えるジェスチャー層。
//   - classic: 既存挙動 (フリック=移動 / 下フリック=softDrop / タップ=回転)
//   - tap-to-drop: 列を押してる間プレビュー表示、離して commit
//   - drag: 現在ぷよ周辺を掴んで横にドラッグ、離して commit。タップは回転
//
// targetRef は「ジェスチャー検出領域」。盤面外もカバーできるよう画面ボディ
// に貼るのが想定。インタラクティブ要素 (button 等) は除外。
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
      if (mode !== 'tap-to-drop' && mode !== 'drag') return;

      const game = useGameStore.getState().game;
      if (!game.current) return;
      // clientXToCol clamps out-of-range coords, so without an explicit
      // bounds check a press far outside the board would still seed a ghost
      // preview at column 0 / COLS-1. Refuse to start preview unless the
      // press actually landed on the board.
      if (!isInsideBoard(e.clientX, e.clientY)) return;
      const col = clientXToCol(e.clientX);
      if (col === null) return;

      // For drag mode, only start tracking if the press began near the active
      // pair's axis column (within ±1). Otherwise treat as a tap rotate
      // candidate (handled in onUp).
      if (mode === 'drag' && Math.abs(col - game.current.axisCol) > 1) return;

      draggingRef.current = true;
      setPreviewMove({ axisCol: col, rotation: game.current.rotation });
    };

    const onMove = (e: PointerEvent) => {
      if (!draggingRef.current) return;
      const game = useGameStore.getState().game;
      if (!game.current) return;
      const col = clientXToCol(e.clientX);
      if (col === null) return;

      const mode = getControlMode();

      // tap-to-drop: 押下中に縦スライドで回転発火。
      //   - 上 (dy < 0) → CW、下 (dy > 0) → CCW
      //   - 縦の動きが横より十分大きい時だけ発火 (誤動作抑制)
      //   - dy が ROT_PX を複数倍跨ぐ場合は跨いだ回数ぶんループ発火
      // 横方向は引き続き列追従に使う。drag は softDrop に下方向を使うので適用外。
      const ROT_PX = 24;
      if (mode === 'tap-to-drop' && pressStart.current) {
        const dy = e.clientY - pressStart.current.y;
        const dx = e.clientX - pressStart.current.x;
        if (
          Math.abs(dy) > ROT_PX &&
          Math.abs(dy) > Math.abs(dx) * 1.5
        ) {
          const steps = Math.floor(Math.abs(dy) / ROT_PX);
          const dir = dy < 0 ? 'rotateCW' : 'rotateCCW';
          pressStart.current = {
            ...pressStart.current,
            y:
              pressStart.current.y +
              (dy < 0 ? -1 : 1) * steps * ROT_PX,
          };
          for (let i = 0; i < steps; i++) {
            useGameStore.getState().dispatch({ type: dir });
          }
        }
      }

      // 列追従プレビュー (rotation は dispatch で更新された最新値を読み直す)。
      const latestRotation =
        useGameStore.getState().game.current?.rotation ??
        game.current.rotation;
      setPreviewMove({ axisCol: col, rotation: latestRotation });

      // For drag mode, also treat downward pull as repeated softDrop dispatches.
      // Coalesced pointer events on mobile can deliver dy spanning multiple
      // thresholds in one move, so dispatch one softDrop per crossed threshold
      // and advance start.y by the consumed multiple (preserving the partial
      // remainder so the next event keeps the pixel budget honest).
      if (mode === 'drag' && pressStart.current) {
        const dy = e.clientY - pressStart.current.y;
        const flickPx = getControlTuning().flickColPx;
        if (dy > flickPx) {
          const rows = Math.floor(dy / flickPx);
          pressStart.current = {
            ...pressStart.current,
            y: pressStart.current.y + rows * flickPx,
          };
          for (let i = 0; i < rows; i++) {
            useGameStore.getState().dispatch({ type: 'softDrop' });
          }
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

      // Only commit when this gesture actually started a preview (=press
      // landed inside the board). Without this guard a press that begins
      // outside the board and slides in would still trigger a commit on
      // release in tap-to-drop mode.
      // 判定は x のみ — y 方向は許容。ユーザーは列を狙って動かしているので、
      // 上下方向のブレで accidental cancel になると「同じぷよが残る」現象が
      // 起きる。盤の左右に大きくはみ出した場合のみキャンセル扱いにする。
      if (wasDragging && (mode === 'tap-to-drop' || mode === 'drag')) {
        const xInside = isXInsideBoard(e.clientX);
        const game = useGameStore.getState().game;
        if (xInside && game.current) {
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
        if (
          dt < TAP_MAX_MS &&
          Math.abs(dx) <= flickPx &&
          Math.abs(dy) <= flickPx
        ) {
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
