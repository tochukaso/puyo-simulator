/// <reference types="vitest" />
import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';
import { execSync } from 'node:child_process';

import { cloudflare } from "@cloudflare/vite-plugin";

// ビルド時点のコミット SHA を取得し、ランタイムに埋め込む。
// 優先順:
//   1. VITE_BUILD_SHA (手動上書き)
//   2. Cloudflare Workers Builds の WORKERS_CI_COMMIT_SHA
//   3. Cloudflare Pages の CF_PAGES_COMMIT_SHA
//   4. ローカル git からの取得
// Cloudflare ダッシュボードに出る "v xxxxxxxx" と完全一致させるため
// 先頭 8 文字に揃える。取得に失敗した場合は 'dev' を入れて build を止めない。
function readGitSha(): string {
  const explicit =
    process.env.VITE_BUILD_SHA ||
    process.env.WORKERS_CI_COMMIT_SHA ||
    process.env.CF_PAGES_COMMIT_SHA;
  if (explicit) return explicit.slice(0, 8);
  try {
    return execSync('git rev-parse --short=8 HEAD').toString().trim();
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
      name: 'GTR training',
      short_name: 'GTR',
      description: 'GTR opening trainer with AI assistance',
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