import type { Color } from '../../../game/types';

// ぷよ本体は本家寄りの彩度に微調整。中心はラジアルグラデーションで明るく、
// 縁は暗く、アウトラインはさらに暗く落とす。
export const PUYO_COLORS: Record<Color, string> = {
  R: '#ff5252',
  B: '#4ea4ff',
  Y: '#ffd93d',
  P: '#b66cff',
};

// グラデの中心(明るい側)。HSL の lightness を +18% 程度上げた値。
export const PUYO_LIGHT: Record<Color, string> = {
  R: '#ff8b8b',
  B: '#8ec6ff',
  Y: '#ffe88a',
  P: '#d4a3ff',
};

// グラデの縁 / アウトライン(暗い側)。lightness を -25% 程度下げた値。
export const PUYO_DARK: Record<Color, string> = {
  R: '#a01f1f',
  B: '#1f5fa8',
  Y: '#9e7a00',
  P: '#6e2db5',
};

export const BG_COLOR = '#0f172a';
export const GRID_COLOR = '#1e293b';
export const DANGER_COLOR = '#7f1d1d';
