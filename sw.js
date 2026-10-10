/* LaundroMaster service worker: offline support + Web Push. */
const VERSION = 'v10';
const CACHE = `lm-static-${VERSION}`;
const SCOPE = self.registration.scope;

function scoped(path) {
  return new URL(path, SCOPE).toString();
}

const CORE = [
  'offline.html',
  'shared/css/tokens.css',
  'shared/css/reset.css',
  'shared/css/layout.css',
  'shared/css/utilities.css',
  'shared/assets/app-icon.png',
  'shared/assets/logo.png',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE)
      .then((cache) => Promise.allSettled(CORE.map((p) => cache.add(p))))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return; // APIs and CDNs go straight to network.

  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request).catch(() => caches.match(request).then((hit) => hit || caches.match('offline.html'))),
    );
    return;
  }

  event.respondWith(
    caches.match(request).then((cached) => {
      const network = fetch(request)
        .then((response) => {
          if (response && response.ok) {
            const copy = response.clone();
            caches.open(CACHE).then((cache) => cache.put(request, copy));
          }
          return response;
        })
        .catch(() => cached || Response.error());
      return cached || network;
    }),
  );
});

self.addEventListener('push', (event) => {
  let data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch {
    data = { title: 'LaundroMaster', body: event.data ? event.data.text() : '' };
  }
  const title = data.title || 'LaundroMaster';
  const options = {
    body: data.body || '',
    icon: 'shared/assets/app-icon.png',
    badge: 'shared/assets/favicon.png',
    tag: data.tag || data.type || undefined,
    renotify: Boolean(data.tag || data.type),
    vibrate: [80, 40, 80],
    data: { url: data.url || '' },
  };
  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const target = event.notification.data && event.notification.data.url;
  if (!target) return;
  const absolute = new URL(target, self.registration.scope).href;
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clients) => {
      const existing = clients.find((c) => c.url === absolute && 'focus' in c);
      if (existing) return existing.focus();
      return self.clients.openWindow(absolute);
    }),
  );
});
