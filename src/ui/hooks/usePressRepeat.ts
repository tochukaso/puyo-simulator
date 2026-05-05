import { useEffect, useRef } from 'react';

export interface PressRepeatOptions {
  enabled: boolean;
  initialDelayMs?: number;
  intervalMs?: number;
}

export interface PressRepeatHandlers {
  onPointerDown: () => void;
  onPointerUp: () => void;
  onPointerCancel: () => void;
  onPointerLeave: () => void;
}

// Fires `handler` once on pointerdown, then (if enabled) again after
// `initialDelayMs`, then every `intervalMs` while the pointer is held.
// Stops on pointerup / pointercancel / pointerleave / unmount.
export function usePressRepeat(
  handler: () => void,
  opts: PressRepeatOptions,
): PressRepeatHandlers {
  const { enabled, initialDelayMs = 200, intervalMs = 80 } = opts;
  const handlerRef = useRef(handler);
  const initialTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const intervalTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Always call the latest handler so the caller can close over fresh state
  // without us re-wiring timers.
  handlerRef.current = handler;

  const stop = (): void => {
    if (initialTimerRef.current !== null) {
      clearTimeout(initialTimerRef.current);
      initialTimerRef.current = null;
    }
    if (intervalTimerRef.current !== null) {
      clearInterval(intervalTimerRef.current);
      intervalTimerRef.current = null;
    }
  };

  useEffect(() => stop, []);

  return {
    onPointerDown: () => {
      stop();
      handlerRef.current();
      if (!enabled) return;
      initialTimerRef.current = setTimeout(() => {
        handlerRef.current();
        intervalTimerRef.current = setInterval(() => {
          handlerRef.current();
        }, intervalMs);
      }, initialDelayMs);
    },
    onPointerUp: stop,
    onPointerCancel: stop,
    onPointerLeave: stop,
  };
}
