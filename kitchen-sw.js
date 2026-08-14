const CACHE_NAME = 'pivnoy-doner-kitchen-shell-v6';
const SHELL_FILES = [
  'kitchen.html?demo=1',
  'kitchen.css?v=2026081404',
  'kitchen.js?v=2026081404',
  'kitchen-presentation.js',
  'kitchen-model.js?v=2026081404',
  'kitchen-api.js?v=2026081404',
  'kitchen-fixtures.js?v=2026081404',
  'kitchen-settings.js?v=2026081404',
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
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys
            .filter((key) => key.startsWith('pivnoy-doner-kitchen-shell-'))
            .filter((key) => key !== CACHE_NAME)
            .map((key) => caches.delete(key)),
        ),
      ),
  );
  self.clients.claim();
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
