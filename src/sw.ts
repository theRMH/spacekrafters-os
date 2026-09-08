/// <reference lib="webworker" />
import { precacheAndRoute } from 'workbox-precaching'
import { registerRoute } from 'workbox-routing'
import { CacheFirst } from 'workbox-strategies'
import { CacheableResponsePlugin } from 'workbox-cacheable-response'
import { ExpirationPlugin } from 'workbox-expiration'

declare let self: ServiceWorkerGlobalScope

precacheAndRoute(self.__WB_MANIFEST)
self.skipWaiting()
self.addEventListener('activate', () => self.clients.claim())

registerRoute(
  ({ url }) => url.origin === 'https://fonts.googleapis.com',
  new CacheFirst({
    cacheName: 'google-fonts-cache',
    plugins: [
      new CacheableResponsePlugin({ statuses: [0, 200] }),
      new ExpirationPlugin({ maxEntries: 10, maxAgeSeconds: 60 * 60 * 24 * 365 }),
    ],
  }),
)
registerRoute(
  ({ url }) => url.origin === 'https://fonts.gstatic.com',
  new CacheFirst({
    cacheName: 'gstatic-fonts-cache',
    plugins: [
      new CacheableResponsePlugin({ statuses: [0, 200] }),
      new ExpirationPlugin({ maxEntries: 10, maxAgeSeconds: 60 * 60 * 24 * 365 }),
    ],
  }),
)

// SPA fallback for unmatched navigations — mirrors the old generateSW
// navigateFallback: 'index.html' (denylisting API-style paths just in case).
registerRoute(
  ({ request, url }) => request.mode === 'navigate' && !url.pathname.startsWith('/api/'),
  async ({ event }) => {
    const cached = await self.caches.match('/index.html')
    if (cached) return cached
    return fetch((event as FetchEvent).request)
  },
)

interface PushPayload {
  title: string
  body: string
  url?: string
}

self.addEventListener('push', event => {
  if (!event.data) return
  const data = event.data.json() as PushPayload
  event.waitUntil(
    self.registration.showNotification(data.title, {
      body: data.body,
      icon: '/icons/notification-bell.png',
      badge: '/icons/notification-bell.png',
      data: { url: data.url ?? '/' },
    }),
  )
})

self.addEventListener('notificationclick', event => {
  event.notification.close()
  const targetUrl = (event.notification.data as { url?: string } | undefined)?.url ?? '/'
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(clientList => {
      for (const client of clientList) {
        if ('focus' in client) {
          // WindowClient.navigate() isn't reliably supported on Android
          // Chrome — message the already-running app instead and let React
          // Router (which is guaranteed to work) do the navigation.
          client.postMessage({ type: 'notification-navigate', url: targetUrl })
          return client.focus()
        }
      }
      return self.clients.openWindow(targetUrl)
    }),
  )
})
