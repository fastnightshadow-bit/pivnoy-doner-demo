const CACHE_NAME = 'pivnoy-doner-courier-shell-v7';
const SHELL_FILES = [
  'courier.html',
  'courier.css?v=2026082202',
  'courier.js?v=2026082202',
  'courier-state.js?v=2026082202',
  'courier-api.js?v=2026082202',
  'courier-push.js?v=2026082202',
  'staff-live-sync.js?v=2026082202',
  'courier.webmanifest',
  'kitchen-fixtures.js?v=2026081408',
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

const COURIER_PAGE = '/courier.html';

const resolveCourierUrl = (value = COURIER_PAGE) => {
  const candidate = new URL(value, self.location.origin);
  if (candidate.origin !== self.location.origin || candidate.pathname !== COURIER_PAGE) {
    return new URL(COURIER_PAGE, self.location.origin).href;
  }
  return candidate.href;
};

self.addEventListener('push', (event) => {
  let payload = {};
  try {
    payload = event.data?.json?.() ?? {};
  } catch {
    payload = {};
  }

  const etaMin = Number(payload.eta?.min);
  const etaMax = Number(payload.eta?.max);
  const etaText = Number.isFinite(etaMin) && Number.isFinite(etaMax)
    ? `${etaMin}–${etaMax} мин`
    : '';
  const body = [etaText, String(payload.address || '').trim()]
    .filter(Boolean)
    .join(' · ');
  const number = String(payload.number || '').trim();
  const orderId = String(payload.orderId || number || 'new');

  event.waitUntil(
    self.registration.showNotification(number ? `Новый заказ #${number}` : 'Новый заказ', {
      body: body || 'Откройте приложение курьера',
      icon: 'assets/courier/icon-192.png',
      badge: 'assets/courier/icon-192.png',
      tag: `courier-order-${orderId}`,
      renotify: false,
      data: { url: resolveCourierUrl(payload.url) },
    }),
  );
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const targetUrl = resolveCourierUrl(event.notification.data?.url);
  event.waitUntil(
    self.clients
      .matchAll({ type: 'window', includeUncontrolled: true })
      .then((windows) => {
        const existing = windows.find((client) => {
          try {
            return new URL(client.url).pathname === COURIER_PAGE;
          } catch {
            return false;
          }
        });
        return existing ? existing.focus() : self.clients.openWindow(targetUrl);
      }),
  );
});
