import { describe, it, expect } from 'vitest';
import spec from '../../shared/specs/game_spec.json';
import type { GameSpec, GameSpecCase } from '../../shared/specs/types';
import { createInitialState, commitMove } from '../state';
import type { GameState } from '../types';

function applyCase(c: GameSpecCase): GameState {
  let s = createInitialState(c.seed);
  for (const m of c.moves) {
    s = commitMove(s, { axisCol: m.axisCol, rotation: m.rotation });
    if (s.status === 'gameover') break;
  }
  return s;
}

describe('game_spec.json', () => {
  const cases = (spec as GameSpec).cases;
  for (const c of cases) {
    it(c.name, () => {
      const s = applyCase(c);
      if (c.expected.gameover !== undefined) {
        expect(s.status === 'gameover').toBe(c.expected.gameover);
      }
      if (c.expected.score !== undefined) {
        expect(s.score).toBe(c.expected.score);
      }
    });
  }
});
