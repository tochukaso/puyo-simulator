import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { registerSW } from 'virtual:pwa-register';
import './index.css';
import App from './App.tsx';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);

// PWA: 新しい Service Worker が controlling になった瞬間にページを 1 度だけ
// リロードして、メモリ上の旧 JS バンドルから新版へ確実に切り替える。
// workbox の skipWaiting + clientsClaim と合わせて「デプロイしたのに古い画面
// のまま」を防ぐ最後のピース。
if (typeof navigator !== 'undefined' && 'serviceWorker' in navigator) {
  let reloading = false;
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (reloading) return;
    reloading = true;
    window.location.reload();
  });
  registerSW({ immediate: true });
}
