import type { Color } from '../../../game/types';

// Puyo body saturation is fine-tuned to be close to the original game.
// The center is brighter via a radial gradient; the edge is darker, and
// the outline is darker still.
export const PUYO_COLORS: Record<Color, string> = {
  R: '#ff5252',
  B: '#4ea4ff',
  Y: '#ffd93d',
  P: '#b66cff',
};

// Gradient center (the bright side). HSL lightness raised by ~+18%.
export const PUYO_LIGHT: Record<Color, string> = {
  R: '#ff8b8b',
  B: '#8ec6ff',
  Y: '#ffe88a',
  P: '#d4a3ff',
};

// Gradient edge / outline (the dark side). HSL lightness reduced by ~-25%.
export const PUYO_DARK: Record<Color, string> = {
  R: '#a01f1f',
  B: '#1f5fa8',
  Y: '#9e7a00',
  P: '#6e2db5',
};

export const BG_COLOR = '#0f172a';
export const GRID_COLOR = '#1e293b';
export const DANGER_COLOR = '#7f1d1d';
