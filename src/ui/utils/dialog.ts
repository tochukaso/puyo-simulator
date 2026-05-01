// Cross-environment confirm() wrapper.
//
// Tauri 2's WKWebView silently disables window.confirm/alert/prompt as a
// security default. The Tauri team's recommended replacement is the
// dialog plugin, which surfaces native OS confirms. In the PWA we keep
// using window.confirm so we don't ship the plugin's runtime there.
//
// Returns true if the user accepted, false if cancelled. Treat as a
// drop-in replacement for `confirm(message)` but with `await`.

function isTauri(): boolean {
  if (typeof window === 'undefined') return false;
  return '__TAURI_INTERNALS__' in window;
}

export async function confirmDialog(message: string): Promise<boolean> {
  if (isTauri()) {
    try {
      const { confirm } = await import('@tauri-apps/plugin-dialog');
      return await confirm(message);
    } catch (error) {
      // Plugin import / native bridge failure shouldn't make Reset / Resign /
      // Edit-clear silently uncallable. Fall back to whatever WebView's
      // window.confirm does (in current Tauri 2 builds, that's a silent false,
      // but explicit fallback at least keeps the call site predictable).
      console.error('[dialog] native confirm unavailable:', error);
    }
  }
  return typeof window !== 'undefined' && typeof window.confirm === 'function'
    ? window.confirm(message)
    : false;
}
