/**
 * Risolve l'URL di destinazione al click su una notifica di sistema.
 * Accetta solo URL same-origin rispetto all'origine dell'app.
 */

export type NotificationFocusData = {
  url?: string
}

/**
 * Restituisce un URL assoluto same-origin da aprire/focalizzare.
 * Se data.url manca o è cross-origin, usa origin + '/'.
 */
export function resolveNotificationTargetUrl(
  data: NotificationFocusData | null | undefined,
  origin: string
): string {
  const base = origin.trim()
  if (!base) {
    throw new Error('resolveNotificationTargetUrl requires a non-empty origin')
  }

  let fallback: URL
  try {
    fallback = new URL('/', base)
  } catch {
    throw new Error(`Invalid origin: ${base}`)
  }

  const raw = data?.url?.trim()
  if (!raw) return fallback.href

  try {
    const parsed = new URL(raw, fallback.origin)
    if (parsed.origin !== fallback.origin) return fallback.href
    return parsed.href
  } catch {
    return fallback.href
  }
}

/**
 * Sceglie il client window da focalizzare: preferisce match sull'URL target, poi qualsiasi same-origin.
 */
export function pickClientToFocus<T extends { url: string }>(
  clients: readonly T[],
  targetUrl: string,
  origin: string
): T | null {
  const sameOrigin = clients.filter((c) => {
    try {
      return new URL(c.url).origin === new URL(origin).origin
    } catch {
      return false
    }
  })
  if (sameOrigin.length === 0) return null

  const exact = sameOrigin.find((c) => c.url === targetUrl)
  if (exact) return exact

  const samePath = sameOrigin.find((c) => {
    try {
      return new URL(c.url).pathname === new URL(targetUrl).pathname
    } catch {
      return false
    }
  })
  return samePath ?? sameOrigin[0] ?? null
}
