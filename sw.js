/**
 * Service worker: app shell cached on install so Freedays opens instantly and
 * works with no connection. Weather is always fetched live — a stale forecast
 * is worse than none.
 */
const VERSION = 'freedays-v1.0.0';
const SHELL = [
  './',
  './index.html',
  './manifest.webmanifest',
  './src/styles.css',
  './src/main.js',
  './src/util.js',
  './src/store.js',
  './src/model.js',
  './src/weather.js',
  './src/insights.js',
  './src/achievements.js',
  './src/notify.js',
  './src/install.js',
  './src/ui.js',
  './src/charts.js',
  './src/sheets.js',
  './src/views/home.js',
  './src/views/calendar.js',
  './src/views/journal.js',
  './src/views/insights.js',
  './src/views/settings.js',
  './src/views/setup.js',
  './assets/icons/icon-192.png',
  './assets/icons/icon-512.png',
  './assets/icons/icon-maskable-512.png',
  './assets/icons/apple-touch-icon.png',
];

self.addEventListener('install', (event) => {
  event.waitUntil((async () => {
    const cache = await caches.open(VERSION);
    // addAll fails the whole install if any single file 404s; be forgiving.
    await Promise.all(SHELL.map((url) => cache.add(url).catch((err) => console.warn('skip', url, err))));
    await self.skipWaiting();
  })());
});

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter((k) => k !== VERSION).map((k) => caches.delete(k)));
    await self.clients.claim();
  })());
});

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);

  // Never cache weather or geocoding.
  if (url.hostname.endsWith('open-meteo.com')) {
    event.respondWith(fetch(request).catch(() => new Response('{}', { headers: { 'Content-Type': 'application/json' } })));
    return;
  }
  if (url.origin !== location.origin) return;

  // Navigations: network first so a deployed update lands, cache as the safety net.
  if (request.mode === 'navigate') {
    event.respondWith((async () => {
      try {
        const fresh = await fetch(request);
        const cache = await caches.open(VERSION);
        cache.put('./index.html', fresh.clone());
        return fresh;
      } catch {
        return (await caches.match('./index.html')) || (await caches.match('./')) || Response.error();
      }
    })());
    return;
  }

  // Everything else: cache first, refresh in the background.
  event.respondWith((async () => {
    const cached = await caches.match(request, { ignoreSearch: true });
    const network = fetch(request).then((res) => {
      if (res.ok) caches.open(VERSION).then((c) => c.put(request, res.clone()));
      return res;
    }).catch(() => cached);
    return cached || network;
  })());
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  event.waitUntil((async () => {
    const all = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    const existing = all.find((c) => c.url.includes(self.registration.scope));
    if (existing) return existing.focus();
    return self.clients.openWindow(event.notification.data?.url || './');
  })());
});
