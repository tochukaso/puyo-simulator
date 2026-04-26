import type { ActivePair, Rotation, Field } from './types';
import { canPlace } from './pair';

export type RotateDir = 'cw' | 'ccw';

export function tryRotate(field: Field, active: ActivePair, dir: RotateDir): ActivePair | null {
  const delta = dir === 'cw' ? 1 : 3;
  const next = ((active.rotation + delta) % 4) as Rotation;

  const direct: ActivePair = { ...active, rotation: next };
  if (canPlace(field, direct)) return direct;

  for (const dc of [-1, 1]) {
    const shifted: ActivePair = { ...direct, axisCol: active.axisCol + dc };
    if (canPlace(field, shifted)) return shifted;
  }

  const flip = ((active.rotation + 2) % 4) as Rotation;
  const flipped: ActivePair = { ...active, rotation: flip };
  if (canPlace(field, flipped)) return flipped;

  return null;
}
