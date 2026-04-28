import { useEffect, useState } from 'react';

// UI display preferences. A module-local singleton + listener pattern so
// multiple components (the Header toggles and the Board renderer) share the
// same value. Same approach as aiKind.
const STORAGE_KEY_GHOST = 'puyo.ghost.enabled';
const STORAGE_KEY_CEILING = 'puyo.ceiling.visible';
const STORAGE_KEY_TAP_TO_DROP = 'puyo.tapToDrop.enabled';

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

// タップした列に現在のペアを即落下する。回転は既存の CCW ボタンで事前変更。
// OFF (既定) の時は従来どおり Left / Right / Drop のボタン操作のみ。
let tapToDropEnabled = readBoolPref(STORAGE_KEY_TAP_TO_DROP, false);
const tapToDropListeners = new Set<(v: boolean) => void>();

export function setTapToDropEnabled(v: boolean): void {
  tapToDropEnabled = v;
  writeBoolPref(STORAGE_KEY_TAP_TO_DROP, v);
  for (const h of tapToDropListeners) h(v);
}

export function useTapToDropEnabled(): boolean {
  const [v, setV] = useState(tapToDropEnabled);
  useEffect(() => {
    tapToDropListeners.add(setV);
    return () => {
      tapToDropListeners.delete(setV);
    };
  }, []);
  return v;
}

// 盤面のセルサイズ(px)。Board が ResizeObserver で計算した最新値を
// 公開して、NextQueue など他の UI が「普通のぷよと同じサイズ」で
// 描画できるようにする。useGhostEnabled / useCeilingVisible と同じ流儀。
let boardCellSize = 32;
const cellSizeListeners = new Set<(v: number) => void>();

export function setBoardCellSize(v: number): void {
  if (boardCellSize === v) return;
  boardCellSize = v;
  for (const h of cellSizeListeners) h(v);
}

export function useBoardCellSize(): number {
  const [v, setV] = useState(boardCellSize);
  useEffect(() => {
    cellSizeListeners.add(setV);
    if (v !== boardCellSize) setV(boardCellSize);
    return () => {
      cellSizeListeners.delete(setV);
    };
  }, [v]);
  return v;
}
