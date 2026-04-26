import '@testing-library/jest-dom/vitest';

// Node 22+ exposes a partial native `localStorage` on globalThis that shadows
// jsdom's Storage (missing `.clear()`, `.key()`, `length`). Replace it with a
// minimal in-memory Storage implementation so tests behave like a browser.
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

for (const name of ['localStorage', 'sessionStorage'] as const) {
  const storage = new MemoryStorage();
  Object.defineProperty(globalThis, name, { configurable: true, value: storage });
  if (typeof window !== 'undefined') {
    Object.defineProperty(window, name, { configurable: true, value: storage });
  }
}
