import { useEffect, useState } from 'react';

// UI display preferences. A module-local singleton + listener pattern so
// multiple components (the Header toggles and the Board renderer) share the
// same value. Same approach as aiKind.
const STORAGE_KEY_GHOST = 'puyo.ghost.enabled';
const STORAGE_KEY_CEILING = 'puyo.ceiling.visible';

function readBoolPref(key: string, fallback: boolean): boolean {
  try {
    const v = localStorage.getItem(key);
    return v === null ? fallback : v === 'true';
  } catch {
    // Fall back when localStorage is unimplemented (e.g. jsdom in tests).
    return fallback;
  }
}

function writeBoolPref(key: string, v: boolean): void {
  try {
    localStorage.setItem(key, String(v));
  } catch {
    // Skip persistence when localStorage is unsupported.
  }
}

let ghostEnabled = readBoolPref(STORAGE_KEY_GHOST, true);
const ghostListeners = new Set<(v: boolean) => void>();

export function setGhostEnabled(v: boolean): void {
  ghostEnabled = v;
  writeBoolPref(STORAGE_KEY_GHOST, v);
  for (const h of ghostListeners) h(v);
}

export function useGhostEnabled(): boolean {
  const [v, setV] = useState(ghostEnabled);
  useEffect(() => {
    ghostListeners.add(setV);
    return () => {
      ghostListeners.delete(setV);
    };
  }, []);
  return v;
}

// Visibility of the ceiling row (row 0). In the original Puyo Puyo this row
// is normally hidden, so the default is ON, but a mode that hides it and
// shows only the 12 visible rows is also selectable.
let ceilingVisible = readBoolPref(STORAGE_KEY_CEILING, true);
const ceilingListeners = new Set<(v: boolean) => void>();

export function setCeilingVisible(v: boolean): void {
  ceilingVisible = v;
  writeBoolPref(STORAGE_KEY_CEILING, v);
  for (const h of ceilingListeners) h(v);
}

export function useCeilingVisible(): boolean {
  const [v, setV] = useState(ceilingVisible);
  useEffect(() => {
    ceilingListeners.add(setV);
    return () => {
      ceilingListeners.delete(setV);
    };
  }, []);
  return v;
}
