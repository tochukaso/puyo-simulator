import { describe, it, expect, beforeEach } from 'vitest';
import { useGameStore } from '../store';

describe('useGameStore', () => {
  beforeEach(() => {
    useGameStore.getState().reset(1);
  });

  it('reset でゲームが初期化される', () => {
    const s = useGameStore.getState();
    expect(s.game.status).toBe('playing');
    expect(s.game.current).not.toBeNull();
  });

  it('dispatch(moveLeft) で axisCol が減る', () => {
    const before = useGameStore.getState().game.current!.axisCol;
    useGameStore.getState().dispatch({ type: 'moveLeft' });
    const after = useGameStore.getState().game.current!.axisCol;
    expect(after).toBeLessThan(before);
  });
});

describe('useGameStore undo', () => {
  beforeEach(() => {
    useGameStore.getState().reset(1);
  });

  it('reset 直後は canUndo=false', () => {
    expect(useGameStore.getState().canUndo()).toBe(false);
  });

  it('commit 後に canUndo=true、undo で元に戻る', async () => {
    const before = useGameStore.getState().game;
    const firstTsumo = before.current!.pair;

    const { commit } = useGameStore.getState();
    await commit({ axisCol: before.current!.axisCol, rotation: before.current!.rotation });

    const afterCommit = useGameStore.getState();
    expect(afterCommit.canUndo()).toBe(true);
    // ツモが進んでいる(新しい ActivePair の pair が current でなくなった or 別物)
    expect(afterCommit.history.length).toBe(1);

    useGameStore.getState().undo();
    const afterUndo = useGameStore.getState();
    expect(afterUndo.game.current!.pair).toEqual(firstTsumo);
    expect(afterUndo.history.length).toBe(0);
    expect(afterUndo.canUndo()).toBe(false);
  });

  it('複数回 commit 後に undo(N) で N 手戻る', async () => {
    const { commit } = useGameStore.getState();
    const s0 = useGameStore.getState().game;

    for (let i = 0; i < 3; i++) {
      const st = useGameStore.getState().game;
      await commit({ axisCol: st.current!.axisCol, rotation: st.current!.rotation });
    }

    expect(useGameStore.getState().history.length).toBe(3);

    useGameStore.getState().undo(2);
    // 2 手戻したので history は 1 残る
    expect(useGameStore.getState().history.length).toBe(1);

    useGameStore.getState().undo(1);
    // 完全に初期状態に戻る
    expect(useGameStore.getState().history.length).toBe(0);
    expect(useGameStore.getState().game.current!.pair).toEqual(s0.current!.pair);
  });

  it('undo の steps が履歴数より大きい場合は最古まで戻る', async () => {
    const { commit } = useGameStore.getState();
    const s0 = useGameStore.getState().game;

    for (let i = 0; i < 2; i++) {
      const st = useGameStore.getState().game;
      await commit({ axisCol: st.current!.axisCol, rotation: st.current!.rotation });
    }
    useGameStore.getState().undo(99);
    expect(useGameStore.getState().history.length).toBe(0);
    expect(useGameStore.getState().game.current!.pair).toEqual(s0.current!.pair);
  });

  it('履歴が空のとき undo しても何も起きない', () => {
    const before = useGameStore.getState().game;
    useGameStore.getState().undo();
    expect(useGameStore.getState().game).toBe(before);
  });

  it('履歴は 100 件で打ち切られる', async () => {
    const { commit } = useGameStore.getState();
    // 盤面が埋まって gameover 前に stop するよう、置けなくなったら break
    for (let i = 0; i < 120; i++) {
      const st = useGameStore.getState().game;
      if (!st.current) break;
      await commit({ axisCol: st.current.axisCol, rotation: st.current.rotation });
    }
    expect(useGameStore.getState().history.length).toBeLessThanOrEqual(100);
  });

  it('softDrop で current.axisRow がズレていても commit(AI推奨手)が適用される', async () => {
    const { commit, dispatch } = useGameStore.getState();
    for (let i = 0; i < 5; i++) dispatch({ type: 'softDrop' });
    const st = useGameStore.getState().game;
    expect(st.current!.axisRow).toBeGreaterThan(0);

    // AI 推奨手として別の列・別の回転を指定。以前のバグでは canPlace が
    // current.axisRow 基準で評価されてこのコミットが silently 失敗した。
    await commit({ axisCol: 0, rotation: 1 });
    expect(useGameStore.getState().history.length).toBe(1);
  });

  it('reset で履歴がクリアされる', async () => {
    const { commit } = useGameStore.getState();
    const st = useGameStore.getState().game;
    await commit({ axisCol: st.current!.axisCol, rotation: st.current!.rotation });
    expect(useGameStore.getState().history.length).toBe(1);

    useGameStore.getState().reset(2);
    expect(useGameStore.getState().history.length).toBe(0);
    expect(useGameStore.getState().canUndo()).toBe(false);
  });
});
