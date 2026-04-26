import { beforeEach } from 'vitest';
import '@testing-library/jest-dom/vitest';

// jsdom 同梱の localStorage が一部メソッド(.clear, .key)を欠くケースが
// あるため、テスト用に Map ベースの完全な Storage シムを毎テスト差し替える。
beforeEach(() => {
  const map = new Map<string, string>();
  const storage: Storage = {
    get length() {
      return map.size;
    },
    key(i: number) {
      return Array.from(map.keys())[i] ?? null;
    },
    getItem(k: string) {
      return map.get(k) ?? null;
    },
    setItem(k: string, v: string) {
      map.set(k, String(v));
    },
    removeItem(k: string) {
      map.delete(k);
    },
    clear() {
      map.clear();
    },
  };
  Object.defineProperty(globalThis, 'localStorage', {
    value: storage,
    writable: true,
    configurable: true,
  });
  Object.defineProperty(globalThis, 'sessionStorage', {
    value: storage,
    writable: true,
    configurable: true,
  });
});
