import type { ActivePair, Rotation, Field } from './types';
import { canPlace } from './pair';

export type RotateDir = 'cw' | 'ccw';

export function tryRotate(field: Field, active: ActivePair, dir: RotateDir): ActivePair | null {
  const delta = dir === 'cw' ? 1 : 3;
  const next = ((active.rotation + delta) % 4) as Rotation;

  const direct: ActivePair = { ...active, rotation: next };
  if (canPlace(field, direct)) return direct;

  // Floor-kick first: lift the axis 1 row up so the pair can rotate against
  // a tall adjacent column without being shoved sideways. This is what
  // enables the "回し" technique — slotting a child puyo into a tight
  // ceiling-row pocket above a tower. We try this *before* the horizontal
  // wall kick so the player stays in their current column instead of being
  // bumped to a neighbor (which would defeat the intent of the rotation).
  // Capped at axisRow > 0 — going further up has no in-bounds axis position.
  if (active.axisRow > 0) {
    const lifted: ActivePair = { ...direct, axisRow: active.axisRow - 1 };
    if (canPlace(field, lifted)) return lifted;
  }

  for (const dc of [-1, 1]) {
    const shifted: ActivePair = { ...direct, axisCol: active.axisCol + dc };
    if (canPlace(field, shifted)) return shifted;
  }

  const flip = ((active.rotation + 2) % 4) as Rotation;
  const flipped: ActivePair = { ...active, rotation: flip };
  if (canPlace(field, flipped)) return flipped;

  return null;
}
