import { createEmptyField, withCell } from '../field';
import { ROWS } from '../constants';
import type { ActivePair, Color, Field, GameState } from '../types';

// 列 col を 13段目 (row 1) まで完全に埋める = 「封印列」 状態。
// 14段目 (row 0) は ghost wall として空けておく — そこに置こうとすると
// lockActive が discard する。
export function sealColumn(field: Field, col: number, color: Color = 'R'): Field {
  let f = field;
  for (let r = 1; r < ROWS; r++) {
    f = withCell(f, r, col, color);
  }
  return f;
}

// 単体テスト向けの GameState ファクトリ。 status='playing' で 0 ターン目の
// クリーンな盤面を作る。 field を省略すると空盤面、 current は必須。
export function makeState(
  current: ActivePair,
  field: Field = createEmptyField(),
): GameState {
  return {
    field,
    current,
    nextQueue: [],
    score: 0,
    chainCount: 0,
    totalChains: 0,
    maxChain: 0,
    status: 'playing',
    rngSeed: 0,
    queueIndex: 0,
  };
}
