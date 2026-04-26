export const ROWS = 13;
export const COLS = 6;
export const VISIBLE_ROW_START = 1; // row 0 is the ceiling row (semi-transparent)
export const SPAWN_COL = 2; // 0-indexed: the third column from the left
// Pair spawn position. The axis sits at row 1 (height 12, fully visible);
// the child sits at row 0 (height 13, semi-transparent) when rotation=0.
// Both are at positions the user can see.
export const SPAWN_AXIS_ROW = 1;
