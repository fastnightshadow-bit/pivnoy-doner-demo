const CACHE_NAME = 'pivnoy-doner-kitchen-shell-v12';
const SHELL_FILES = [
  'kitchen.html',
  'kitchen.css?v=2026082102',
  'kitchen.js?v=2026082102',
  'kitchen-presentation.js',
  'kitchen-model.js?v=2026082102',
  'kitchen-api.js?v=2026082102',
  'kitchen-fixtures.js?v=2026082101',
  'kitchen-settings.js?v=2026082102',
  'owner-menu.js?v=2026082102',
  'owner-menu.js',
  'kitchen-menu.js?v=2026082102',
  'product-config.js',
  'option-quantities.js',
  'staff-live-sync.js?v=2026082102',
  'preparation-time.js',
  'catalog-data.js',
  'kitchen.webmanifest',
  'assets/mobile-home/logo-transparent.webp',
  'assets/kitchen/icon-192.png',
  'assets/kitchen/icon-512.png',
];
const SHELL_ASSETS = SHELL_FILES.map((file) => new URL(file, self.registration.scope).href);
const SHELL_URLS = SHELL_ASSETS.map((asset) => new URL(asset).pathname);
const API_PATH = new URL('api/', self.registration.scope).pathname;

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(SHELL_ASSETS)),
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys();
      const staleKeys = keys
        .filter((key) => key.startsWith('pivnoy-doner-kitchen-shell-'))
        .filter((key) => key !== CACHE_NAME);
      await Promise.all(staleKeys.map((key) => caches.delete(key)));
      await self.clients.claim();
      if (!staleKeys.length) return;
      const clients = await self.clients.matchAll({
        type: 'window',
        includeUncontrolled: true,
      });
      await Promise.all(
        clients
          .filter((client) => client.url.startsWith(self.registration.scope))
          .map((client) => client.navigate(client.url)),
      );
    })(),
  );
});

self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);
  if (event.request.method !== 'GET' || url.pathname.startsWith(API_PATH)) {
    return;
  }
  if (url.origin !== self.location.origin || !SHELL_URLS.includes(url.pathname)) {
    return;
  }
  event.respondWith(
    caches.open(CACHE_NAME).then((cache) =>
      fetch(event.request)
        .then((response) => {
          if (response.ok) cache.put(event.request, response.clone());
          return response;
        })
        .catch(() => caches.match(event.request)),
    ),
  );
});
