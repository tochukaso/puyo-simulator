import { describe, it, expect } from 'vitest';
import { dropDistance, lockActive } from '../landing';
import { createEmptyField, withCell, getCell } from '../field';
import type { ActivePair } from '../types';

describe('dropDistance', () => {
  it('空盤面・rotation=0 (縦) では最下段まで落ちる', () => {
    const f = createEmptyField();
    const a: ActivePair = {
      pair: { axis: 'R', child: 'B' }, axisRow: 0, axisCol: 2, rotation: 0,
    };
    expect(dropDistance(f, a)).toBe(12);
  });

  it('下にぷよがあればその上で止まる', () => {
    let f = createEmptyField();
    f = withCell(f, 12, 2, 'Y');
    const a: ActivePair = {
      pair: { axis: 'R', child: 'B' }, axisRow: 0, axisCol: 2, rotation: 0,
    };
    expect(dropDistance(f, a)).toBe(11);
  });
});

describe('lockActive (ちぎり)', () => {
  it('rotation=1 で異なる高さの列に落とすと、軸と子が独立に落ちる', () => {
    let f = createEmptyField();
    f = withCell(f, 12, 3, 'Y');
    const a: ActivePair = {
      pair: { axis: 'R', child: 'B' }, axisRow: 11, axisCol: 2, rotation: 1,
    };
    const locked = lockActive(f, a);
    expect(getCell(locked, 12, 2)).toBe('R');
    expect(getCell(locked, 11, 3)).toBe('B');
  });
});
