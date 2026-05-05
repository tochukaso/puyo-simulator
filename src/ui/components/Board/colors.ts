import type { Color } from '../../../game/types';

// 'G' = 配色つきセル + おじゃま (灰色)。レンダリング上は他の色と同じ
// ラジアルグラデーション + 縁を使う。
type DrawableCell = Color | 'G';

// Puyo body saturation is fine-tuned to be close to the original game.
// The center is brighter via a radial gradient; the edge is darker, and
// the outline is darker still.
export const PUYO_COLORS: Record<DrawableCell, string> = {
  R: '#ff5252',
  B: '#4ea4ff',
  Y: '#ffd93d',
  P: '#b66cff',
  G: '#94a3b8',
};

// Gradient center (the bright side). HSL lightness raised by ~+18%.
export const PUYO_LIGHT: Record<DrawableCell, string> = {
  R: '#ff8b8b',
  B: '#8ec6ff',
  Y: '#ffe88a',
  P: '#d4a3ff',
  G: '#cbd5e1',
};

// Gradient edge / outline (the dark side). HSL lightness reduced by ~-25%.
export const PUYO_DARK: Record<DrawableCell, string> = {
  R: '#a01f1f',
  B: '#1f5fa8',
  Y: '#9e7a00',
  P: '#6e2db5',
  G: '#475569',
};

export const BG_COLOR = '#0f172a';
// 「14段目」「13段目」の背景色。プレイ可能な領域 (BG_COLOR) と差をつけて
// 「ここはペアの回し用で本来見えない領域」だと視覚的に伝える。スレート系で
// やや明るめ・青寄りなのでぷよの色 (R/B/Y/P/G) とは衝突しにくい。
export const ABOVE_FIELD_BG_COLOR = '#1a2236';
export const GRID_COLOR = '#1e293b';
export const DANGER_COLOR = '#7f1d1d';
