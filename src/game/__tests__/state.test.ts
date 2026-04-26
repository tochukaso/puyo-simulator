import { describe, it, expect } from 'vitest';
import { createInitialState, spawnNext, commitMove } from '../state';
import { SPAWN_COL, SPAWN_AXIS_ROW } from '../constants';

describe('createInitialState', () => {
  it('the first pair appears at the spawn position', () => {
    const s = createInitialState(1);
    expect(s.current).not.toBeNull();
    expect(s.current!.axisCol).toBe(SPAWN_COL);
    expect(s.current!.axisRow).toBe(SPAWN_AXIS_ROW);
    expect(s.nextQueue.length).toBeGreaterThanOrEqual(2);
    expect(s.status).toBe('playing');
  });

  it('the same seed yields the same initial state', () => {
    const a = createInitialState(42);
    const b = createInitialState(42);
    expect(a.current!.pair).toEqual(b.current!.pair);
    expect(a.nextQueue[0]).toEqual(b.nextQueue[0]);
  });
});

describe('spawnNext', () => {
  it('the next pair becomes current', () => {
    const s = createInitialState(1);
    const next = s.nextQueue[0]!;
    const s2 = spawnNext(s);
    expect(s2.current!.pair).toEqual(next);
  });
});

describe('commitMove', () => {
  it('after a move, current is non-null and status is playing', () => {
    const s = createInitialState(1);
    const s2 = commitMove(s, { axisCol: 0, rotation: 0 });
    expect(s2.status).toBe('playing');
  });

  it('returns the state unchanged when current is null', () => {
    const s = { ...createInitialState(1), current: null };
    const s2 = commitMove(s, { axisCol: 0, rotation: 0 });
    expect(s2).toBe(s);
  });
});
