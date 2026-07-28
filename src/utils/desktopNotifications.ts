/**
 * Notifiche di sistema (taskbar / Centro notifiche) per task lunghi in background.
 * Preferisce ServiceWorkerRegistration.showNotification così il click
 * (notificationclick nel SW) può riportare AI Lawyer in primo piano.
 */

import { resolveNotificationTargetUrl } from './notificationFocus'

export const APP_NOTIFICATION_TITLE = 'AI Lawyer'
export const APP_NOTIFICATION_ICON = '/icons/icon-192.png'

export type DesktopNotificationOptions = {
  /** Riga principale del toast (sotto l'header di sistema) */
  title: string
  /** Riga secondaria opzionale */
  body?: string
  /** Raggruppa/sostituisce notifiche dello stesso tag */
  tag?: string
  /** URL da focalizzare/aprire al click (default: pagina corrente) */
  url?: string
}

/** True se l'ambiente espone l'API Notification. */
export function isNotificationApiSupported(): boolean {
  return typeof Notification !== 'undefined'
}

/** True se l'app gira come PWA installata (header toast = nome manifest). */
export function isRunningAsInstalledPwa(): boolean {
  if (typeof window === 'undefined') return false
  const standaloneMq = window.matchMedia?.('(display-mode: standalone)')?.matches === true
  const fullscreenMq = window.matchMedia?.('(display-mode: fullscreen)')?.matches === true
  const iosStandalone = (window.navigator as Navigator & { standalone?: boolean }).standalone === true
  return standaloneMq || fullscreenMq || iosStandalone
}

/**
 * Richiede il permesso notifiche se ancora non deciso.
 * Va chiamato in seguito a un'azione utente (es. avvio OCR).
 */
export async function ensureNotificationPermission(): Promise<NotificationPermission | 'unsupported'> {
  if (!isNotificationApiSupported()) return 'unsupported'
  if (Notification.permission === 'granted' || Notification.permission === 'denied') {
    return Notification.permission
  }
  try {
    return await Notification.requestPermission()
  } catch {
    return Notification.permission
  }
}

function currentPageUrl(): string {
  if (typeof window === 'undefined') return '/'
  return window.location.href
}

/**
 * Mostra un popup di sistema. Restituisce false se non supportato/negato o in errore.
 * Usa il service worker quando disponibile (click → focus/open).
 */
export async function showDesktopNotification(options: DesktopNotificationOptions): Promise<boolean> {
  if (!isNotificationApiSupported()) return false
  if (Notification.permission !== 'granted') return false

  const title = options.title.trim()
  if (!title) {
    throw new Error('Desktop notification title must be non-empty')
  }

  const body = options.body?.trim() || undefined
  const origin = typeof window !== 'undefined' ? window.location.origin : 'http://localhost'
  const url = resolveNotificationTargetUrl({ url: options.url ?? currentPageUrl() }, origin)

  const notificationOptions: NotificationOptions = {
    body,
    tag: options.tag,
    icon: APP_NOTIFICATION_ICON,
    data: { url },
  }

  if (typeof navigator !== 'undefined' && 'serviceWorker' in navigator) {
    try {
      const reg = await navigator.serviceWorker.ready
      await reg.showNotification(title, notificationOptions)
      return true
    } catch {
      // fallback sotto
    }
  }

  try {
    const n = new Notification(title, notificationOptions)
    n.onclick = () => {
      try {
        window.focus()
      } catch {
        /* ignore */
      }
      n.close()
    }
    return true
  } catch {
    return false
  }
}

function ocrNotificationBody(): string | undefined {
  // In tab browser l'header resta "localhost": mettiamo AI Lawyer nel body.
  // In PWA l'header è già "AI Lawyer": evitiamo il doppione.
  return isRunningAsInstalledPwa() ? undefined : APP_NOTIFICATION_TITLE
}

/** Notifica di OCR completato. */
export async function notifyOcrCompleted(filename: string, url?: string): Promise<boolean> {
  const name = filename.trim()
  if (!name) {
    throw new Error('notifyOcrCompleted requires a non-empty filename')
  }
  return showDesktopNotification({
    title: `OCR di «${name}» terminato`,
    body: ocrNotificationBody(),
    tag: `ocr-completed:${name}`,
    url,
  })
}

/** Notifica di OCR fallito. */
export async function notifyOcrFailed(
  filename: string,
  error?: string | null,
  url?: string
): Promise<boolean> {
  const name = filename.trim()
  if (!name) {
    throw new Error('notifyOcrFailed requires a non-empty filename')
  }
  const detail = error?.trim()
  return showDesktopNotification({
    title: detail
      ? `OCR di «${name}» fallito: ${detail}`
      : `OCR di «${name}» fallito`,
    body: ocrNotificationBody(),
    tag: `ocr-failed:${name}`,
    url,
  })
}
