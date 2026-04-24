export const ROWS = 13;
export const COLS = 6;
export const VISIBLE_ROW_START = 1; // row 0 は天井段(半透明)
export const SPAWN_COL = 2; // 0-indexed: 左から3列目
// ツモの spawn 位置。軸は row 1(高さ12、完全表示)、子は rotation=0 のとき row 0
// (高さ13、半透明)に置かれる。両方ともユーザに見える位置。
export const SPAWN_AXIS_ROW = 1;
