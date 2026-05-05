import { describe, it, expect, beforeEach } from 'vitest';
import { useGameStore } from '../store';

describe('useGameStore', () => {
  beforeEach(() => {
    useGameStore.getState().reset(1);
  });

  it('reset initializes the game', () => {
    const s = useGameStore.getState();
    expect(s.game.status).toBe('playing');
    expect(s.game.current).not.toBeNull();
  });

  it('dispatch(moveLeft) decreases axisCol', () => {
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

  it('canUndo=false right after reset', () => {
    expect(useGameStore.getState().canUndo()).toBe(false);
  });

  it('canUndo=true after commit, and undo restores the state', async () => {
    const before = useGameStore.getState().game;
    const firstTsumo = before.current!.pair;

    const { commit } = useGameStore.getState();
    await commit({ axisCol: before.current!.axisCol, rotation: before.current!.rotation });

    const afterCommit = useGameStore.getState();
    expect(afterCommit.canUndo()).toBe(true);
    // The pair has advanced (the new ActivePair's pair is no longer the same as before).
    expect(afterCommit.history.length).toBe(1);

    useGameStore.getState().undo();
    const afterUndo = useGameStore.getState();
    expect(afterUndo.game.current!.pair).toEqual(firstTsumo);
    expect(afterUndo.history.length).toBe(0);
    expect(afterUndo.canUndo()).toBe(false);
  });

  it('after multiple commits, undo(N) rewinds N moves', async () => {
    const { commit } = useGameStore.getState();
    const s0 = useGameStore.getState().game;

    for (let i = 0; i < 3; i++) {
      const st = useGameStore.getState().game;
      await commit({ axisCol: st.current!.axisCol, rotation: st.current!.rotation });
    }

    expect(useGameStore.getState().history.length).toBe(3);

    useGameStore.getState().undo(2);
    // We rewound 2 moves, so 1 history entry should remain.
    expect(useGameStore.getState().history.length).toBe(1);

    useGameStore.getState().undo(1);
    // We're fully back to the initial state.
    expect(useGameStore.getState().history.length).toBe(0);
    expect(useGameStore.getState().game.current!.pair).toEqual(s0.current!.pair);
  });

  it('when undo steps exceeds the history length, rewinds to the oldest entry', async () => {
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

  it('undo does nothing when the history is empty', () => {
    const before = useGameStore.getState().game;
    useGameStore.getState().undo();
    expect(useGameStore.getState().game).toBe(before);
  });

  it('history is capped at 100 entries', async () => {
    const { commit } = useGameStore.getState();
    // Stop before the board fills up and triggers game over: break when no piece can be placed.
    for (let i = 0; i < 120; i++) {
      const st = useGameStore.getState().game;
      if (!st.current) break;
      await commit({ axisCol: st.current.axisCol, rotation: st.current.rotation });
    }
    expect(useGameStore.getState().history.length).toBeLessThanOrEqual(100);
  });

  it('commit (AI-recommended move) applies even when current.axisRow has shifted from softDrop', async () => {
    const { commit, dispatch } = useGameStore.getState();
    for (let i = 0; i < 5; i++) dispatch({ type: 'softDrop' });
    const st = useGameStore.getState().game;
    expect(st.current!.axisRow).toBeGreaterThan(0);

    // Specify a different column and rotation as the AI's recommended move. A
    // previous bug evaluated canPlace against current.axisRow, causing this
    // commit to silently fail.
    await commit({ axisCol: 0, rotation: 1 });
    expect(useGameStore.getState().history.length).toBe(1);
  });

  it('maxChain is 0 in the initial state', () => {
    expect(useGameStore.getState().game.maxChain).toBe(0);
  });

  it('reset clears the history', async () => {
    const { commit } = useGameStore.getState();
    const st = useGameStore.getState().game;
    await commit({ axisCol: st.current!.axisCol, rotation: st.current!.rotation });
    expect(useGameStore.getState().history.length).toBe(1);

    useGameStore.getState().reset(2);
    expect(useGameStore.getState().history.length).toBe(0);
    expect(useGameStore.getState().canUndo()).toBe(false);
  });
});

describe('useGameStore undo (match mode)', () => {
  beforeEach(() => {
    // useMatchDriver は React hook なので vitest 単体では発火せず ama は
    // 自動進行しない。プレイヤー側だけの巻き戻しを検査する分には十分。
    useGameStore.getState().startMatch({ seed: 1, turnLimit: 30 });
  });

  it('canUndo=false right after startMatch (no moves yet)', () => {
    expect(useGameStore.getState().canUndo()).toBe(false);
  });

  it('player-only undo rewinds matchTurnsPlayed and score, keeps ama untouched', async () => {
    const before = useGameStore.getState();
    const initialScore = before.game.score;
    const firstTsumo = before.game.current!.pair;
    const aiBefore = before.aiGame;

    const { commit } = useGameStore.getState();
    await commit({
      axisCol: before.game.current!.axisCol,
      rotation: before.game.current!.rotation,
    });

    const afterCommit = useGameStore.getState();
    expect(afterCommit.matchTurnsPlayed).toBe(1);
    expect(afterCommit.matchPlayerMoves.length).toBe(1);
    expect(afterCommit.playerHistory.length).toBe(1);
    expect(afterCommit.canUndo()).toBe(true);

    useGameStore.getState().undo();
    const afterUndo = useGameStore.getState();
    expect(afterUndo.matchTurnsPlayed).toBe(0);
    expect(afterUndo.matchPlayerMoves.length).toBe(0);
    expect(afterUndo.playerHistory.length).toBe(0);
    expect(afterUndo.game.current!.pair).toEqual(firstTsumo);
    expect(afterUndo.game.score).toBe(initialScore);
    // ama 側は触っていないはず (テストでは手も打っていないので reference 同一)。
    expect(afterUndo.aiGame).toBe(aiBefore);
    expect(afterUndo.canUndo()).toBe(false);
  });

  it('undo(N) rewinds N moves on the player side', async () => {
    const { commit } = useGameStore.getState();
    for (let i = 0; i < 3; i++) {
      const st = useGameStore.getState().game;
      await commit({
        axisCol: st.current!.axisCol,
        rotation: st.current!.rotation,
      });
    }
    expect(useGameStore.getState().matchTurnsPlayed).toBe(3);

    useGameStore.getState().undo(2);
    expect(useGameStore.getState().matchTurnsPlayed).toBe(1);
    expect(useGameStore.getState().matchPlayerMoves.length).toBe(1);

    useGameStore.getState().undo(99); // overshoot clamps
    expect(useGameStore.getState().matchTurnsPlayed).toBe(0);
    expect(useGameStore.getState().matchPlayerMoves.length).toBe(0);
  });

  it('undo is blocked once matchEnded is true', async () => {
    const { commit } = useGameStore.getState();
    const st = useGameStore.getState().game;
    await commit({
      axisCol: st.current!.axisCol,
      rotation: st.current!.rotation,
    });
    // matchEnded を強制的に立てる (本来は finalizeMatchIfDone が立てるが、
    // テストでは ama が動かないのでそこまで到達しない。直接 set で立てて
    // 検査する)。
    useGameStore.setState({ matchEnded: true });
    expect(useGameStore.getState().canUndo()).toBe(false);
    const before = useGameStore.getState().game;
    useGameStore.getState().undo();
    expect(useGameStore.getState().game).toBe(before);
  });
});
