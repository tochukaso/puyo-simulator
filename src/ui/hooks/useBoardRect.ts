// Lets useGestures convert pointer clientX into a board column without
// having to walk the React tree to find the canvas. Board registers a
// getter that returns its current bounding rect; consumers call
// getBoardRect() at gesture time. We intentionally don't expose a React
// hook here — gestures run outside the render cycle.

let getter: () => DOMRect | null = () => null;

export function setBoardRectGetter(g: () => DOMRect | null): void {
  getter = g;
}

export function getBoardRect(): DOMRect | null {
  return getter();
}
