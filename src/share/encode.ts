import type { Cell, Color, Field, Pair } from '../game/types';
import { ROWS, COLS, AI_VIEW_ROWS, AI_ROW_OFFSET } from '../game/constants';

// 盤面共有用のエンコード / デコード。
// 84 文字固定の URL-safe な文字列を吐く。
//   - フィールド 78 文字: 13 行 × 6 列 (= AI_VIEW_ROWS) を上から下、左から右に並べる
//   - 現在ペア 2 文字: axis, child
//   - NEXT 2 文字: axis, child
//   - NEXT2 2 文字: axis, child
// 各セル文字: 'R'|'P'|'B'|'Y' = 4 色, 'G' = おじゃま, '_' = 空。
//
// game の field は 14 行 (新規追加された 14段目を含む) だが、URL は旧 13 行表現を
// 維持して既存の共有リンクと長さ互換にする。エンコード時に最上行 (新しい 14段目)
// を捨て、デコード時には空行を 1 行追加して 14 行に膨らませる。14段目に puyo が
// ある状態は実プレイではほぼ発生しないため許容する。
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
export const SHARE_LENGTH = AI_VIEW_ROWS * COLS + 2 + 2 + 2; // 78 + 6 = 84

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
  // Skip the top AI_ROW_OFFSET rows so the URL stays length-compatible with
  // pre-14-row clients.
  for (let r = 0; r < AI_VIEW_ROWS; r++) {
    for (let c = 0; c < COLS; c++) {
      out += cellToChar(pos.field.cells[r + AI_ROW_OFFSET]![c]!);
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
  // Re-introduce the AI_ROW_OFFSET empty rows on top (the 14段目 is always
  // empty in shared positions).
  for (let r = 0; r < AI_ROW_OFFSET; r++) {
    cells.push(new Array<Cell>(COLS).fill(null));
  }
  for (let r = 0; r < AI_VIEW_ROWS; r++) {
    const row: Cell[] = [];
    for (let c = 0; c < COLS; c++) {
      const cell = charToCell(s[r * COLS + c]!);
      if (cell === undefined) return null;
      row.push(cell);
    }
    cells.push(row);
  }
  if (cells.length !== ROWS) return null;
  const fieldOff = AI_VIEW_ROWS * COLS;
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
