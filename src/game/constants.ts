export const ROWS = 14;
export const COLS = 6;
// rows 0 and 1 are above the visible play area (row 0 = "14段目", row 1 =
// "13段目"). Both render semi-transparent so the player can see active pair
// pieces drifting through them but understands they're outside the normal
// scoring zone.
export const VISIBLE_ROW_START = 2;
export const SPAWN_COL = 2; // 0-indexed: the third column from the left
// Pair spawn position. The axis sits at row 1 ("13段目"), the child at row 0
// ("14段目") when rotation=0 — both above the visible play area so the pair
// can travel laterally over tall existing columns (the "回し" technique
// requires room above the highest stack to pivot through).
export const SPAWN_AXIS_ROW = 1;
// AI binaries (wasm-ama / native-ama / ml policy net) were trained on a
// 13-row playfield; we keep their input view at 13 rows by dropping the new
// top row when encoding. The game itself uses ROWS (14).
export const AI_VIEW_ROWS = 13;
export const AI_ROW_OFFSET = ROWS - AI_VIEW_ROWS; // = 1
