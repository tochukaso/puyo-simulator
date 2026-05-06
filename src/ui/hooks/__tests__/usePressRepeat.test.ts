import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook } from '@testing-library/react';
import { usePressRepeat } from '../usePressRepeat';

describe('usePressRepeat', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('fires once on pointerdown', () => {
    const handler = vi.fn();
    const { result } = renderHook(() => usePressRepeat(handler, { enabled: true }));
    result.current.onPointerDown();
    expect(handler).toHaveBeenCalledTimes(1);
  });

  it('fires repeatedly while held when enabled=true', () => {
    const handler = vi.fn();
    const { result } = renderHook(() =>
      usePressRepeat(handler, { enabled: true, initialDelayMs: 200, intervalMs: 80 }),
    );
    result.current.onPointerDown();
    expect(handler).toHaveBeenCalledTimes(1);
    vi.advanceTimersByTime(199);
    expect(handler).toHaveBeenCalledTimes(1);
    vi.advanceTimersByTime(1);
    expect(handler).toHaveBeenCalledTimes(2);
    vi.advanceTimersByTime(80);
    expect(handler).toHaveBeenCalledTimes(3);
    vi.advanceTimersByTime(80);
    expect(handler).toHaveBeenCalledTimes(4);
    result.current.onPointerUp();
    vi.advanceTimersByTime(500);
    expect(handler).toHaveBeenCalledTimes(4);
  });

  it('does not repeat when enabled=false (single fire only)', () => {
    const handler = vi.fn();
    const { result } = renderHook(() =>
      usePressRepeat(handler, { enabled: false, initialDelayMs: 200, intervalMs: 80 }),
    );
    result.current.onPointerDown();
    vi.advanceTimersByTime(2000);
    expect(handler).toHaveBeenCalledTimes(1);
  });

  it('stops on pointerleave', () => {
    const handler = vi.fn();
    const { result } = renderHook(() =>
      usePressRepeat(handler, { enabled: true, initialDelayMs: 100, intervalMs: 50 }),
    );
    result.current.onPointerDown(); // call #1
    vi.advanceTimersByTime(100); // initial delay reached → call #2, interval armed
    expect(handler).toHaveBeenCalledTimes(2);
    result.current.onPointerLeave();
    vi.advanceTimersByTime(500);
    expect(handler).toHaveBeenCalledTimes(2);
  });

  it('stops on pointercancel', () => {
    const handler = vi.fn();
    const { result } = renderHook(() =>
      usePressRepeat(handler, { enabled: true, initialDelayMs: 100, intervalMs: 50 }),
    );
    result.current.onPointerDown(); // call #1
    vi.advanceTimersByTime(100); // call #2
    result.current.onPointerCancel();
    vi.advanceTimersByTime(500);
    expect(handler).toHaveBeenCalledTimes(2);
  });
});
