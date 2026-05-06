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

  it('tap-to-drop: release with x outside the board clears preview without committing', () => {
    setControlMode('tap-to-drop');
    const { el, ref } = mountTarget();
    renderHook(() => useGestures(ref));
    const startCurrent = useGameStore.getState().game.current;
    act(() => {
      fire(el, 'pointerdown', 100, 200); // press inside (col 3)
      fire(el, 'pointermove', 250, 200); // x=250 is outside (board ends at x=192)
      fire(el, 'pointerup', 250, 200);
    });
    expect(getPreviewMove()).toBeNull();
    expect(useGameStore.getState().game.current).toBe(startCurrent);
  });

  it('tap-to-drop: release with y outside but x inside still commits (列指定優先)', () => {
    setControlMode('tap-to-drop');
    const { el, ref } = mountTarget();
    renderHook(() => useGestures(ref));
    act(() => {
      fire(el, 'pointerdown', 100, 200); // press inside (col 3)
      fire(el, 'pointerup', 100, 50);    // y=50 above board, but x still inside
    });
    // 指のブレで y がはみ出ても列(x)が盤内なら commit する。
    // commit が成功したら preview はクリアされる。
    expect(getPreviewMove()).toBeNull();
  });

  it('tap-to-drop: rightmost-column tap with horizontal pair clamps axisCol to 4', () => {
    setControlMode('tap-to-drop');
    const { el, ref } = mountTarget();
    renderHook(() => useGestures(ref));
    useGameStore.setState((st) => ({
      game: { ...st.game, current: { ...st.game.current!, rotation: 1 } },
    }));
    act(() => {
      fire(el, 'pointerdown', 180, 200); // x=180 → col 5
    });
    expect(getPreviewMove()!.axisCol).toBe(4);
    act(() => {
      fire(el, 'pointercancel', 180, 200);
    });
  });

  it('tap-to-drop: vertical slide while pressed rotates the active pair', () => {
    setControlMode('tap-to-drop');
    const { el, ref } = mountTarget();
    renderHook(() => useGestures(ref));
    const startRotation = useGameStore.getState().game.current!.rotation;
    act(() => {
      fire(el, 'pointerdown', 100, 200);
      // 縦に -50px (上方向) → ROT_PX=24 を 2 ステップ跨ぐ → CW を 2 回。
      fire(el, 'pointermove', 100, 150);
    });
    const rotated = useGameStore.getState().game.current!.rotation;
    expect(rotated).not.toBe(startRotation);
    // CW 2 回。0 → 1 → 2。
    expect((rotated - startRotation + 4) % 4).toBe(2);
    // プレビューは新しい rotation で更新される。
    const preview = getPreviewMove();
    expect(preview!.rotation).toBe(rotated);
    act(() => {
      fire(el, 'pointercancel', 100, 150);
    });
  });

  it('tap-to-drop: small vertical motion (< ROT_PX) does NOT rotate', () => {
    setControlMode('tap-to-drop');
    const { el, ref } = mountTarget();
    renderHook(() => useGestures(ref));
    const startRotation = useGameStore.getState().game.current!.rotation;
    act(() => {
      fire(el, 'pointerdown', 100, 200);
      // dy = -20 < ROT_PX (24), 横移動はあるが回転は発火しない
      fire(el, 'pointermove', 164, 180);
    });
    expect(useGameStore.getState().game.current!.rotation).toBe(startRotation);
    expect(getPreviewMove()!.axisCol).toBe(5);
    act(() => {
      fire(el, 'pointercancel', 164, 180);
    });
  });

  it('tap-to-drop: diagonal vertical-and-horizontal slide rotates AND updates column', () => {
    setControlMode('tap-to-drop');
    const { el, ref } = mountTarget();
    renderHook(() => useGestures(ref));
    const startRotation = useGameStore.getState().game.current!.rotation;
    act(() => {
      fire(el, 'pointerdown', 100, 200);
      // dx=32 (列追従、x=132 → col 4), dy=-30 (1 ステップ回転発火)
      fire(el, 'pointermove', 132, 170);
    });
    // 旧仕様 (dx 支配軸チェック) では回転しなかった。新仕様では回る。
    expect(useGameStore.getState().game.current!.rotation).not.toBe(startRotation);
    // 列追従もしている (col 4 = x=132/32)。
    // rotation=1 なら clamp で 4 まで OK なので 4 が見える。
    expect(getPreviewMove()!.axisCol).toBe(4);
    act(() => {
      fire(el, 'pointercancel', 132, 170);
    });
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

  it('drag: rotation dispatch (= CW button press) updates preview rotation while dragging', () => {
    setControlMode('drag');
    const { el, ref } = mountTarget();
    renderHook(() => useGestures(ref));
    act(() => {
      fire(el, 'pointerdown', 80, 200); // start drag near axisCol=2
    });
    expect(getPreviewMove()).not.toBeNull();
    const startPreviewRot = getPreviewMove()!.rotation;
    // 外部 dispatch (= CW ボタンクリック相当) で active pair を回す。
    act(() => {
      useGameStore.getState().dispatch({ type: 'rotateCW' });
    });
    const newPreviewRot = getPreviewMove()!.rotation;
    expect(newPreviewRot).not.toBe(startPreviewRot);
    expect(newPreviewRot).toBe(useGameStore.getState().game.current!.rotation);
    act(() => {
      fire(el, 'pointercancel', 80, 200);
    });
  });

  it('drag: pointing at rightmost column with horizontal pair clamps to COLS-2', () => {
    setControlMode('drag');
    const { el, ref } = mountTarget();
    renderHook(() => useGestures(ref));
    // 横向きにする (rotation=1: child is to the right of axis).
    useGameStore.setState((st) => ({
      game: { ...st.game, current: { ...st.game.current!, rotation: 1 } },
    }));
    act(() => {
      // press near axisCol=2 first to enter drag mode (within ±1).
      fire(el, 'pointerdown', 80, 200);
      // drag finger to the rightmost column (x=180 → col 5).
      fire(el, 'pointermove', 180, 200);
    });
    // rotation=1 では axisCol は最大 4 (child が col=5 に行く)。col=5 ではない。
    expect(getPreviewMove()!.axisCol).toBe(4);
    expect(getPreviewMove()!.rotation).toBe(1);
    act(() => {
      fire(el, 'pointercancel', 180, 200);
    });
  });

  it('drag: pointing at leftmost column with rotation=3 clamps axisCol to 1', () => {
    setControlMode('drag');
    const { el, ref } = mountTarget();
    renderHook(() => useGestures(ref));
    // rotation=3: child is to the left of axis. axisCol must be >= 1.
    useGameStore.setState((st) => ({
      game: { ...st.game, current: { ...st.game.current!, rotation: 3 } },
    }));
    act(() => {
      fire(el, 'pointerdown', 80, 200); // start drag near axisCol=2
      fire(el, 'pointermove', 5, 200);  // drag to leftmost (col 0)
    });
    expect(getPreviewMove()!.axisCol).toBe(1);
    expect(getPreviewMove()!.rotation).toBe(3);
    act(() => {
      fire(el, 'pointercancel', 5, 200);
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
