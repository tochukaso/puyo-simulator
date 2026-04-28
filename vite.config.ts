/// <reference types="vitest" />
import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';
import { execSync } from 'node:child_process';

import { cloudflare } from "@cloudflare/vite-plugin";

// ビルド時点の git short SHA を取得し、ランタイムに埋め込む。
// CI / Cloudflare Workers Builds でも同じコマンドが通る (どちらも .git ありで
// チェックアウトされる)。取得に失敗した場合は 'dev' を入れて build を止めない。
function readGitSha(): string {
  if (process.env.VITE_BUILD_SHA) return process.env.VITE_BUILD_SHA;
  try {
    return execSync('git rev-parse --short HEAD').toString().trim();
  } catch {
    return 'dev';
  }
}
const BUILD_SHA = readGitSha();
const BUILD_TIME = new Date().toISOString();

export default defineConfig({
  define: {
    __BUILD_SHA__: JSON.stringify(BUILD_SHA),
    __BUILD_TIME__: JSON.stringify(BUILD_TIME),
  },
  plugins: [react(), VitePWA({
    registerType: 'autoUpdate',
    manifest: {
      name: 'Puyo Training',
      short_name: 'PuyoTrain',
      description: 'AI-assisted Puyo Puyo training',
      theme_color: '#0f172a',
      background_color: '#0f172a',
      display: 'standalone',
      start_url: '/',
      icons: [
        { src: '/pwa-192.png', sizes: '192x192', type: 'image/png' },
        { src: '/pwa-512.png', sizes: '512x512', type: 'image/png' },
      ],
    },
    workbox: {
      globPatterns: ['**/*.{js,css,html,wasm,bin,json}'],
      maximumFileSizeToCacheInBytes: 16 * 1024 * 1024,
      // 新しい SW を見つけたら waiting を経ずに即時 activate し、開いている
      // タブ全部を新版に強制ハンドオフ。これがないと autoUpdate でも
      // 「リロードしないと反映されない」ケースが起きる。
      skipWaiting: true,
      clientsClaim: true,
      // ナビゲーションは常にネットワーク先頭で取りに行き、index.html が
      // 古いまま固まらないようにする (オフライン時はキャッシュにフォールバック)。
      navigateFallback: '/index.html',
      cleanupOutdatedCaches: true,
    },
  }), cloudflare()],
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./src/test-setup.ts'],
    exclude: ['**/node_modules/**', '**/e2e/**'],
  },
});