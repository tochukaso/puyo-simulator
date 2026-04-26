import { describe, it, expect } from 'vitest';
import { moveToActionIndex, actionIndexToMove, ACTION_COUNT } from '../action';
import spec from '../../shared/specs/action_spec.json';
import type { Rotation } from '../types';

describe('action_spec.json', () => {
  it('action_count matches ACTION_COUNT', () => {
    expect(spec.action_count).toBe(ACTION_COUNT);
  });

  it('each entry round-trips between index and move', () => {
    for (const e of spec.entries) {
      const move = { axisCol: e.axisCol, rotation: e.rotation as Rotation };
      expect(moveToActionIndex(move)).toBe(e.index);
      expect(actionIndexToMove(e.index)).toEqual(move);
    }
  });
});
