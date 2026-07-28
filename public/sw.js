/**
 * Service worker AI Lawyer: installabilità PWA + click sulle notifiche
 * per riportare l'app in primo piano (focus finestra o openWindow).
 */
/* eslint-disable no-restricted-globals */

self.addEventListener('install', (event) => {
  self.skipWaiting()
  event.waitUntil(Promise.resolve())
})

self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim())
})

self.addEventListener('fetch', (event) => {
  event.respondWith(fetch(event.request))
})

/**
 * @param {unknown} data
 * @param {string} origin
 * @returns {string}
 */
function resolveNotificationTargetUrl(data, origin) {
  var fallback = origin + '/'
  try {
    fallback = new URL('/', origin).href
  } catch (_) {
    /* keep fallback */
  }

  var raw = data && typeof data === 'object' && 'url' in data ? String(data.url || '').trim() : ''
  if (!raw) return fallback

  try {
    var parsed = new URL(raw, origin)
    if (parsed.origin !== new URL(origin).origin) return fallback
    return parsed.href
  } catch (_) {
    return fallback
  }
}

/**
 * @param {ReadonlyArray<{ url: string, focus: () => Promise<unknown>, navigate?: (url: string) => Promise<unknown> }>} clientList
 * @param {string} targetUrl
 * @param {string} origin
 */
function pickClientToFocus(clientList, targetUrl, origin) {
  var sameOrigin = []
  for (var i = 0; i < clientList.length; i++) {
    try {
      if (new URL(clientList[i].url).origin === new URL(origin).origin) {
        sameOrigin.push(clientList[i])
      }
    } catch (_) {
      /* skip */
    }
  }
  if (sameOrigin.length === 0) return null

  for (var j = 0; j < sameOrigin.length; j++) {
    if (sameOrigin[j].url === targetUrl) return sameOrigin[j]
  }

  try {
    var targetPath = new URL(targetUrl).pathname
    for (var k = 0; k < sameOrigin.length; k++) {
      if (new URL(sameOrigin[k].url).pathname === targetPath) return sameOrigin[k]
    }
  } catch (_) {
    /* ignore */
  }

  return sameOrigin[0]
}

self.addEventListener('notificationclick', (event) => {
  event.notification.close()

  var origin = self.location.origin
  var targetUrl = resolveNotificationTargetUrl(event.notification.data, origin)

  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(function (clientList) {
      var client = pickClientToFocus(clientList, targetUrl, origin)
      if (client) {
        return client.focus().then(function (focused) {
          var win = focused || client
          if (win && typeof win.navigate === 'function' && win.url !== targetUrl) {
            return win.navigate(targetUrl).catch(function () {
              return win
            })
          }
          return win
        })
      }
      if (self.clients.openWindow) {
        return self.clients.openWindow(targetUrl)
      }
      return undefined
    })
  )
})
