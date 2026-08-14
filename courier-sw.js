const CACHE_NAME = 'pivnoy-doner-courier-shell-v4';
const SHELL_FILES = [
  'courier.html?demo=1',
  'courier.css?v=2026081407',
  'courier.js?v=2026081407',
  'courier-state.js?v=2026081407',
  'courier-api.js?v=2026081407',
  'staff-live-sync.js?v=2026081407',
  'courier.webmanifest',
  'kitchen-fixtures.js?v=2026081407',
  'preparation-time.js',
  'assets/mobile-home/logo-transparent.webp',
  'assets/courier/icon-192.png',
  'assets/courier/icon-512.png',
];

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE_NAME).then((cache) => cache.addAll(SHELL_FILES)));
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys
          .filter((key) => key.startsWith('pivnoy-doner-courier-shell-') && key !== CACHE_NAME)
          .map((key) => caches.delete(key)),
      ),
    ),
  );
  self.clients.claim();
});

self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return;
  const url = new URL(event.request.url);
  if (url.origin !== self.location.origin || url.pathname.includes('/api/')) return;
  event.respondWith(
    fetch(event.request)
      .then((response) => {
        if (response.ok) {
          caches.open(CACHE_NAME).then((cache) => cache.put(event.request, response.clone()));
        }
        return response;
      })
      .catch(() => caches.match(event.request)),
  );
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  event.waitUntil(clients.openWindow('courier.html?demo=1'));
});
