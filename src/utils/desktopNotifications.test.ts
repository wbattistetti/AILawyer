/**
 * Test per le notifiche desktop OCR.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  APP_NOTIFICATION_ICON,
  APP_NOTIFICATION_TITLE,
  ensureNotificationPermission,
  isNotificationApiSupported,
  notifyOcrCompleted,
  notifyOcrFailed,
  showDesktopNotification,
} from './desktopNotifications'

type NotificationStub = {
  permission: NotificationPermission
  requestPermission: ReturnType<typeof vi.fn>
} & ReturnType<typeof vi.fn>

describe('desktopNotifications', () => {
  let NotificationMock: NotificationStub
  let showNotification: ReturnType<typeof vi.fn>

  beforeEach(() => {
    NotificationMock = Object.assign(
      vi.fn(function NotificationCtor(this: unknown, title: string, options?: NotificationOptions) {
        return { title, ...options, onclick: null, close: vi.fn() }
      }),
      {
        permission: 'granted' as NotificationPermission,
        requestPermission: vi.fn().mockResolvedValue('granted' as NotificationPermission),
      }
    )
    vi.stubGlobal('Notification', NotificationMock)

    showNotification = vi.fn().mockResolvedValue(undefined)
    vi.stubGlobal('navigator', {
      serviceWorker: {
        ready: Promise.resolve({ showNotification }),
      },
    })
    vi.stubGlobal('window', {
      location: { href: 'http://localhost:6500/pratica/p1', origin: 'http://localhost:6500' },
      matchMedia: () => ({ matches: false }),
      navigator: {},
      focus: vi.fn(),
    })
  })

  afterEach(() => {
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
  })

  it('rileva API supportata', () => {
    expect(isNotificationApiSupported()).toBe(true)
  })

  it('mostra notifica via service worker con data.url per il focus', async () => {
    const ok = await showDesktopNotification({
      title: 'OCR di «file.pdf» terminato',
      body: APP_NOTIFICATION_TITLE,
      tag: 't1',
    })
    expect(ok).toBe(true)
    expect(showNotification).toHaveBeenCalledWith('OCR di «file.pdf» terminato', {
      body: APP_NOTIFICATION_TITLE,
      tag: 't1',
      icon: APP_NOTIFICATION_ICON,
      data: { url: 'http://localhost:6500/pratica/p1' },
    })
    expect(NotificationMock).not.toHaveBeenCalled()
  })

  it('rifiuta title vuoto', async () => {
    await expect(showDesktopNotification({ title: '   ' })).rejects.toThrow(/title/i)
  })

  it('non mostra se permesso negato', async () => {
    NotificationMock.permission = 'denied'
    expect(await showDesktopNotification({ title: 'x' })).toBe(false)
    expect(showNotification).not.toHaveBeenCalled()
  })

  it('fallback a Notification con onclick se SW non disponibile', async () => {
    vi.stubGlobal('navigator', {})
    const ok = await showDesktopNotification({ title: 'Task fatto', body: 'x' })
    expect(ok).toBe(true)
    expect(NotificationMock).toHaveBeenCalled()
  })

  it('notifyOcrCompleted usa il task come titolo', async () => {
    await notifyOcrCompleted('faldone.pdf')
    expect(showNotification).toHaveBeenCalledWith('OCR di «faldone.pdf» terminato', {
      body: APP_NOTIFICATION_TITLE,
      tag: 'ocr-completed:faldone.pdf',
      icon: APP_NOTIFICATION_ICON,
      data: { url: 'http://localhost:6500/pratica/p1' },
    })
  })

  it('notifyOcrFailed include dettaglio errore', async () => {
    await notifyOcrFailed('faldone.pdf', 'timeout')
    expect(showNotification).toHaveBeenCalledWith('OCR di «faldone.pdf» fallito: timeout', {
      body: APP_NOTIFICATION_TITLE,
      tag: 'ocr-failed:faldone.pdf',
      icon: APP_NOTIFICATION_ICON,
      data: { url: 'http://localhost:6500/pratica/p1' },
    })
  })

  it('in PWA omette AI Lawyer dal body (già nell\'header)', async () => {
    vi.stubGlobal('window', {
      location: { href: 'http://localhost:6500/pratica/p1', origin: 'http://localhost:6500' },
      matchMedia: (q: string) => ({ matches: q.includes('standalone') }),
      navigator: {},
      focus: vi.fn(),
    })
    await notifyOcrCompleted('faldone.pdf')
    expect(showNotification).toHaveBeenCalledWith('OCR di «faldone.pdf» terminato', {
      body: undefined,
      tag: 'ocr-completed:faldone.pdf',
      icon: APP_NOTIFICATION_ICON,
      data: { url: 'http://localhost:6500/pratica/p1' },
    })
  })

  it('ensureNotificationPermission richiede se default', async () => {
    NotificationMock.permission = 'default'
    const result = await ensureNotificationPermission()
    expect(NotificationMock.requestPermission).toHaveBeenCalled()
    expect(result).toBe('granted')
  })
})
