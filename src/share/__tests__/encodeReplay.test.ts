import { describe, it, expect } from 'vitest';
import { encodeReplay, decodeReplay, replayDataToRecord } from '../encodeReplay';
import type { Move } from '../../game/types';

describe('encodeReplay / decodeReplay', () => {
  it('round-trips a typical score replay', () => {
    const moves: Move[] = [
      { axisCol: 0, rotation: 0 },
      { axisCol: 5, rotation: 3 },
      { axisCol: 2, rotation: 1 },
      { axisCol: 4, rotation: 2 },
    ];
    const enc = encodeReplay({
      version: 1,
      mode: 'score',
      seed: 12345,
      turnLimit: 50,
      moves,
    });
    const dec = decodeReplay(enc);
    expect(dec).not.toBeNull();
    expect(dec!.mode).toBe('score');
    expect(dec!.seed).toBe(12345);
    expect(dec!.turnLimit).toBe(50);
    expect(dec!.moves).toEqual(moves);
  });

  it('handles unlimited (turnLimit=0) and large move counts', () => {
    // 200 手のフル replay でも URL に乗るサイズで往復できる。
    const moves: Move[] = Array.from({ length: 200 }, (_, i) => ({
      axisCol: (i % 6) as Move['axisCol'],
      rotation: ((i * 7) % 4) as Move['rotation'],
    }));
    const enc = encodeReplay({
      version: 1,
      mode: 'score',
      seed: -1,
      turnLimit: 0,
      moves,
    });
    expect(enc.length).toBeLessThan(400); // URL サイズ感の sanity check
    const dec = decodeReplay(enc);
    expect(dec).not.toBeNull();
    expect(dec!.turnLimit).toBe(0);
    expect(dec!.seed).toBe(-1);
    expect(dec!.moves).toEqual(moves);
  });

  it('returns null on garbage input', () => {
    expect(decodeReplay('not valid base64 !!!')).toBeNull();
    expect(decodeReplay('')).toBeNull();
    expect(decodeReplay('AAAA')).toBeNull(); // ヘッダー長不足
  });
});

describe('replayDataToRecord', () => {
  it('synthesizes a MatchRecord with simulated final score', () => {
    // 連鎖を起こすかどうかは入力 seed 依存だが、最低限 score >= 0 で
    // playerScore / aiMoves 等のフィールドが正しく組まれることを確認。
    const rec = replayDataToRecord({
      version: 1,
      mode: 'score',
      seed: 42,
      turnLimit: 10,
      moves: [
        { axisCol: 0, rotation: 0 },
        { axisCol: 1, rotation: 0 },
      ],
    });
    expect(rec.mode).toBe('score');
    expect(rec.seed).toBe(42);
    expect(rec.turnLimit).toBe(10);
    expect(rec.aiMoves).toEqual([]);
    expect(rec.aiScore).toBe(0);
    expect(rec.winner).toBe('player');
    expect(rec.playerScore).toBeGreaterThanOrEqual(0);
    expect(rec.id).toMatch(/^url-replay-/);
  });

  it('handles unlimited (turnLimit=0) without freezing on first move', () => {
    // 過去 simulateRecordSide のバグ: turnLimit=0 を「すぐ at-limit」と判定して
    // 1 手目以降 spawn しないため state.current が null になり止まっていた。
    // 同じ罠を避けているか確認 (replayDataToRecord は内部実装が独立なので別 test)。
    const rec = replayDataToRecord({
      version: 1,
      mode: 'score',
      seed: 7,
      turnLimit: 0,
      moves: [
        { axisCol: 2, rotation: 0 },
        { axisCol: 3, rotation: 0 },
        { axisCol: 4, rotation: 0 },
      ],
    });
    // 3 手分シミュレートが進んだはず (current が ≥ 1 手目で消えなかった)。
    // playerScore の正確な値は seed 依存なので >= 0 のみ確認。
    expect(rec.playerScore).toBeGreaterThanOrEqual(0);
    expect(rec.playerMoves.length).toBe(3);
  });
});
