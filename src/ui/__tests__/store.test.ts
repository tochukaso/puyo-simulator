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
