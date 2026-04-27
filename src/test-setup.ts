import { beforeEach } from 'vitest';
import '@testing-library/jest-dom/vitest';

// The localStorage shipped with jsdom / built into Node 22+ is missing some
// methods (.clear, .key, length), so for tests we swap in a complete
// Map-based Storage shim on every test. We recreate it in beforeEach to
// guarantee state is reset between tests.
class MemoryStorage implements Storage {
  private store = new Map<string, string>();
  get length() {
    return this.store.size;
  }
  clear() {
    this.store.clear();
  }
  getItem(key: string) {
    return this.store.has(key) ? this.store.get(key)! : null;
  }
  key(index: number) {
    return Array.from(this.store.keys())[index] ?? null;
  }
  removeItem(key: string) {
    this.store.delete(key);
  }
  setItem(key: string, value: string) {
    this.store.set(key, String(value));
  }
}

beforeEach(() => {
  for (const name of ['localStorage', 'sessionStorage'] as const) {
    const storage = new MemoryStorage();
    Object.defineProperty(globalThis, name, {
      configurable: true,
      writable: true,
      value: storage,
    });
    if (typeof window !== 'undefined') {
      Object.defineProperty(window, name, {
        configurable: true,
        writable: true,
        value: storage,
      });
    }
  }
});
