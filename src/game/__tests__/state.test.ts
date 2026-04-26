import { describe, it, expect } from 'vitest';
import { createInitialState, spawnNext, commitMove } from '../state';
import { SPAWN_COL, SPAWN_AXIS_ROW } from '../constants';

describe('createInitialState', () => {
  it('最初のツモが出現位置にいる', () => {
    const s = createInitialState(1);
    expect(s.current).not.toBeNull();
    expect(s.current!.axisCol).toBe(SPAWN_COL);
    expect(s.current!.axisRow).toBe(SPAWN_AXIS_ROW);
    expect(s.nextQueue.length).toBeGreaterThanOrEqual(2);
    expect(s.status).toBe('playing');
  });

  it('同じシードは同じ初期状態', () => {
    const a = createInitialState(42);
    const b = createInitialState(42);
    expect(a.current!.pair).toEqual(b.current!.pair);
    expect(a.nextQueue[0]).toEqual(b.nextQueue[0]);
  });
});

describe('spawnNext', () => {
  it('次のペアが current になる', () => {
    const s = createInitialState(1);
    const next = s.nextQueue[0]!;
    const s2 = spawnNext(s);
    expect(s2.current!.pair).toEqual(next);
  });
});

describe('commitMove', () => {
  it('ムーブ後に current が null でなく status が playing', () => {
    const s = createInitialState(1);
    const s2 = commitMove(s, { axisCol: 0, rotation: 0 });
    expect(s2.status).toBe('playing');
  });

  it('current が null なら state そのまま', () => {
    const s = { ...createInitialState(1), current: null };
    const s2 = commitMove(s, { axisCol: 0, rotation: 0 });
    expect(s2).toBe(s);
  });
});
