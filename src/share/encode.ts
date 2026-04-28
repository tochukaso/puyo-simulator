import type { Cell, Color, Field, Pair } from '../game/types';
import { ROWS, COLS } from '../game/constants';

// 盤面共有用のエンコード / デコード。
// 84 文字固定の URL-safe な文字列を吐く。
//   - フィールド 78 文字: 13 行 × 6 列を上から下、左から右に並べる
//   - 現在ペア 2 文字: axis, child
//   - NEXT 2 文字: axis, child
//   - NEXT2 2 文字: axis, child
// 各セル文字: 'R'|'P'|'B'|'Y' = 4 色, 'G' = おじゃま, '_' = 空。
//
// 短くて目視でも読める利点を取って base64 等は使わない (78+6=84 chars)。
// `?share=...` のクエリで運ぶ前提で、URL 安全な文字だけを使う。

export interface SharedPosition {
  field: Field;
  current: Pair;
  next1: Pair;
  next2: Pair;
}

const VALID_CELL_CHARS = ['R', 'P', 'B', 'Y', 'G', '_'] as const;
const VALID_PAIR_CHARS = ['R', 'P', 'B', 'Y'] as const;
type CellChar = (typeof VALID_CELL_CHARS)[number];
type PairChar = (typeof VALID_PAIR_CHARS)[number];

export const SHARE_PARAM = 'share';
export const SHARE_LENGTH = ROWS * COLS + 2 + 2 + 2; // 78 + 6 = 84

function cellToChar(c: Cell): CellChar {
  if (c === null) return '_';
  if (c === 'G') return 'G';
  return c; // 'R' | 'P' | 'B' | 'Y'
}

function charToCell(ch: string): Cell | undefined {
  switch (ch) {
    case '_':
      return null;
    case 'R':
    case 'P':
    case 'B':
    case 'Y':
    case 'G':
      return ch;
    default:
      return undefined;
  }
}

function colorToChar(c: Color): PairChar {
  return c;
}

function charToColor(ch: string): Color | undefined {
  if (ch === 'R' || ch === 'P' || ch === 'B' || ch === 'Y') return ch;
  return undefined;
}

export function encodeShare(pos: SharedPosition): string {
  let out = '';
  for (let r = 0; r < ROWS; r++) {
    for (let c = 0; c < COLS; c++) {
      out += cellToChar(pos.field.cells[r]![c]!);
    }
  }
  out += colorToChar(pos.current.axis);
  out += colorToChar(pos.current.child);
  out += colorToChar(pos.next1.axis);
  out += colorToChar(pos.next1.child);
  out += colorToChar(pos.next2.axis);
  out += colorToChar(pos.next2.child);
  return out;
}

export function decodeShare(s: string): SharedPosition | null {
  if (s.length !== SHARE_LENGTH) return null;

  const cells: Cell[][] = [];
  for (let r = 0; r < ROWS; r++) {
    const row: Cell[] = [];
    for (let c = 0; c < COLS; c++) {
      const cell = charToCell(s[r * COLS + c]!);
      if (cell === undefined) return null;
      row.push(cell);
    }
    cells.push(row);
  }
  const fieldOff = ROWS * COLS;
  const ax = charToColor(s[fieldOff + 0]!);
  const ac = charToColor(s[fieldOff + 1]!);
  const n1a = charToColor(s[fieldOff + 2]!);
  const n1c = charToColor(s[fieldOff + 3]!);
  const n2a = charToColor(s[fieldOff + 4]!);
  const n2c = charToColor(s[fieldOff + 5]!);
  if (!ax || !ac || !n1a || !n1c || !n2a || !n2c) return null;

  return {
    field: { cells },
    current: { axis: ax, child: ac },
    next1: { axis: n1a, child: n1c },
    next2: { axis: n2a, child: n2c },
  };
}

// 現在の URL に `?share=...` を付けたフル URL を返す。
export function buildShareUrl(encoded: string): string {
  const url = new URL(window.location.href);
  url.searchParams.set(SHARE_PARAM, encoded);
  // hash や他のパラメータは保持。
  return url.toString();
}

// 起動時に URL から share を抽出。なければ null。
export function readShareFromUrl(): string | null {
  if (typeof window === 'undefined') return null;
  const params = new URLSearchParams(window.location.search);
  const v = params.get(SHARE_PARAM);
  if (!v) return null;
  return v;
}

// 一度ロードしたら URL から `?share=...` を消す(リロード時の二重適用を防ぐ)。
export function clearShareFromUrl(): void {
  if (typeof window === 'undefined') return;
  const url = new URL(window.location.href);
  url.searchParams.delete(SHARE_PARAM);
  window.history.replaceState({}, '', url.toString());
}
