/// <reference types="vitest" />
import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';

import { cloudflare } from "@cloudflare/vite-plugin";

export default defineConfig({
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
    },
  }), cloudflare()],
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./src/test-setup.ts'],
    exclude: ['**/node_modules/**', '**/e2e/**'],
  },
});