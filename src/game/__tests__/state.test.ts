import { describe, it, expect } from 'vitest';
import { createInitialState, spawnNext, commitMove } from '../state';
import { SPAWN_COL, SPAWN_AXIS_ROW, VISIBLE_ROW_START } from '../constants';
import { withCell } from '../field';

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

  it('triggers game-over when the death cell is occupied', () => {
    const s = createInitialState(1);
    // Place a puyo on the 「バツマーク」 cell (top of visible play, SPAWN_COL).
    const blocked = { ...s, field: withCell(s.field, VISIBLE_ROW_START, SPAWN_COL, 'R' as const) };
    const next = spawnNext(blocked);
    expect(next.status).toBe('gameover');
    expect(next.current).toBeNull();
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
