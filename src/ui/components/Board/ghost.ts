import type { Move, Field, ActivePair } from '../../../game/types';
import { ROWS, COLS } from '../../../game/constants';
import { pairCells } from '../../../game/pair';

export interface GhostPos {
  row: number;
  col: number;
  kind: 'axis' | 'child';
}

export function ghostCells(
  field: Field,
  current: ActivePair | null,
  bestMove: Move | null,
): GhostPos[] | null {
  if (!current || !bestMove) return null;

  const placed: ActivePair = {
    ...current,
    axisCol: bestMove.axisCol,
    rotation: bestMove.rotation,
    axisRow: 0,
  };
  const { axisPos, childPos } = pairCells(placed);

  // 各列の「次に積める一番下の空き行」を field から初期化。
  const colTop: number[] = new Array(COLS);
  for (let c = 0; c < COLS; c++) {
    let r = ROWS - 1;
    while (r >= 0 && field.cells[r]![c]! !== null) r--;
    colTop[c] = r;
  }

  // lockActive と同じ落下順(開始 row が大きい = 下にあるピース)で処理。
  // 同じ列に2つ落ちる(rot 0/2)ケースで上のピースが下のピースの上に積まれる。
  const pieces = [
    { kind: 'axis' as const, col: axisPos.col, startRow: axisPos.row },
    { kind: 'child' as const, col: childPos.col, startRow: childPos.row },
  ].sort((a, b) => b.startRow - a.startRow);

  const result: GhostPos[] = [];
  for (const p of pieces) {
    const r = colTop[p.col]!;
    // 列が天井まで埋まっていてピースが入らない場合は lockActive 同様に
    // 静かに破棄する(本家挙動)。残るピースのゴーストはそのまま見せる。
    if (r < 0) continue;
    result.push({ row: r, col: p.col, kind: p.kind });
    colTop[p.col] = r - 1;
  }

  return result.length > 0 ? result : null;
}
