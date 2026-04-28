// vite.config.ts の `define` で埋め込まれるビルドメタ情報。
// SPA バンドルの中から git short SHA / ビルド時刻を読めるようにし、
// 「実機で見えているのは何版か」をヘッダから即時確認できるようにする。
declare const __BUILD_SHA__: string;
declare const __BUILD_TIME__: string;

// vite-plugin-pwa の registerSW 仮想モジュール用の型。
/// <reference types="vite-plugin-pwa/client" />
