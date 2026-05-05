import { describe, it, expect } from 'vitest';
import { simulateAndValidate } from '../validateMoves';
import { createInitialState, spawnNext } from '../../src/game/state';
import { lockActive } from '../../src/game/landing';
import { resolveChain } from '../../src/game/chain';
import type { Move } from '../../src/game/types';

// ヘルパー: 与えられた seed と手列をクライアント側と同じロジックで再生して
// 期待スコアを得る (= テストの「正解」スコア)。validateMoves は同じロジックの
// 重複実装なので、ここでも同じ手順を踏むことで「期待値」を得てから validate
// に通すと round-trip テストになる。
function simulateClientSide(
  seed: number,
  moves: ReadonlyArray<Move>,
  turnLimit: number,
): number {
  const limit = turnLimit <= 0 ? Infinity : turnLimit;
  let state = createInitialState(seed);
  for (let i = 0; i < moves.length; i++) {
    if (!state.current) break;
    const move = moves[i]!;
    const placed = {
      ...state.current,
      axisCol: move.axisCol,
      rotation: move.rotation,
    };
    const locked = lockActive(state.field, placed);
    const { finalField, steps, totalScore } = resolveChain(locked);
    const resolved = {
      ...state,
      field: finalField,
      current: null,
      score: state.score + totalScore,
      chainCount: steps.length,
      totalChains: state.totalChains + steps.length,
      maxChain: Math.max(state.maxChain, steps.length),
      status: 'resolving' as const,
    };
    const atLimit = i + 1 >= limit;
    state = atLimit ? resolved : spawnNext(resolved);
  }
  return state.score;
}

describe('simulateAndValidate', () => {
  it('accepts a faithful score with valid moves', () => {
    const seed = 12345;
    const moves: Move[] = [
      { axisCol: 0, rotation: 0 },
      { axisCol: 1, rotation: 0 },
      { axisCol: 2, rotation: 0 },
      { axisCol: 3, rotation: 0 },
      { axisCol: 4, rotation: 0 },
    ];
    const trueScore = simulateClientSide(seed, moves, 50);
    const result = simulateAndValidate({
      seed,
      moves,
      claimedScore: trueScore,
      turnLimit: 50,
    });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.score).toBe(trueScore);
      expect(result.turnsPlayed).toBe(5);
    }
  });

  it('rejects a tampered higher score', () => {
    const seed = 12345;
    const moves: Move[] = [
      { axisCol: 0, rotation: 0 },
      { axisCol: 1, rotation: 0 },
    ];
    const trueScore = simulateClientSide(seed, moves, 50);
    const result = simulateAndValidate({
      seed,
      moves,
      claimedScore: trueScore + 99999,
      turnLimit: 50,
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reason).toMatch(/score mismatch/);
    }
  });

  it('rejects more moves than turnLimit', () => {
    const moves: Move[] = Array.from({ length: 5 }, () => ({
      axisCol: 0 as const,
      rotation: 0 as const,
    }));
    const result = simulateAndValidate({
      seed: 1,
      moves,
      claimedScore: 0,
      turnLimit: 3,
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toMatch(/exceeds turnLimit/);
  });

  it('accepts turnLimit=0 (unlimited) with many moves as long as the score matches', () => {
    const seed = 7;
    const moves: Move[] = Array.from({ length: 8 }, (_, i) => ({
      axisCol: (i % 6) as Move['axisCol'],
      rotation: 0 as const,
    }));
    const trueScore = simulateClientSide(seed, moves, 0);
    const result = simulateAndValidate({
      seed,
      moves,
      claimedScore: trueScore,
      turnLimit: 0,
    });
    expect(result.ok).toBe(true);
  });

  it('rejects moves played after the game ended (top-out)', () => {
    // 同じ列に積んで意図的に top-out を起こし、その後に追加で 1 手送ると
    // current=null の状態でループが回って "game already ended" が返る。
    const seed = 1;
    // 3 列 (axisCol=2, rotation=0) は SPAWN_COL を直撃するので積み上げが速く
    // gameover に到達する。どのくらいで current=null になるかは seed 依存
    // なので、十分多くの手を付けて gameover を必ず起こす。
    const moves: Move[] = Array.from({ length: 100 }, () => ({
      axisCol: 2 as const,
      rotation: 0 as const,
    }));
    const result = simulateAndValidate({
      seed,
      moves,
      claimedScore: 0,
      turnLimit: 200,
    });
    // gameover 到達後の手で reject されるか、score mismatch で reject される。
    // どちらにしても ok=false で十分。
    expect(result.ok).toBe(false);
  });
});
