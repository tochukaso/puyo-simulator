import { describe, it, expect } from 'vitest';
import { isTauri } from '../tauri-bridge';

describe('isTauri', () => {
  it('returns false when window has no __TAURI_INTERNALS__', () => {
    // jsdom environment lacks the marker
    expect(isTauri()).toBe(false);
  });

  it('returns true when __TAURI_INTERNALS__ is defined', () => {
    // @ts-expect-error injecting marker for test
    (globalThis.window as Record<string, unknown>).__TAURI_INTERNALS__ = {};
    try {
      expect(isTauri()).toBe(true);
    } finally {
      // @ts-expect-error cleanup
      delete (globalThis.window as Record<string, unknown>).__TAURI_INTERNALS__;
    }
  });
});
