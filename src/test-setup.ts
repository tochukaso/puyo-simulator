import { beforeEach } from 'vitest';
import '@testing-library/jest-dom/vitest';

// jsdom 同梱 / Node 22+ 内蔵の localStorage は一部メソッド (.clear, .key, length) を
// 欠くため、テスト用に Map ベースの完全な Storage シムを毎テスト差し替える。
// beforeEach で再生成してテスト間の状態リセットを保証する。
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
