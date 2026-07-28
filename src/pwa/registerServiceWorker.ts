/**
 * Registra il service worker per PWA + click sulle notifiche (focus app).
 */

/** Registra /sw.js se il browser lo supporta. */
export function registerServiceWorker(): void {
  if (typeof window === 'undefined' || !('serviceWorker' in navigator)) return

  const register = () => {
    void navigator.serviceWorker.register('/sw.js').catch((err: unknown) => {
      console.warn('[PWA] Service worker registration failed', err)
    })
  }

  // Registra subito se il documento è già pronto (notifiche OCR prima del load).
  if (document.readyState === 'complete') {
    register()
  } else {
    window.addEventListener('load', register, { once: true })
  }
}
