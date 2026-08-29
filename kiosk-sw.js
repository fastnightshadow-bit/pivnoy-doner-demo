const VERSION = '20260829-1';
const CACHE = `pivnoy-doner-kiosk-${VERSION}`;
const SHELL = [
  './kiosk.html',
  `./kiosk-app.js?v=${VERSION}`,
  './kiosk-state.js', './kiosk-api.js', './kiosk-presentation.js',
  './kiosk-image-cache.js',
  './kiosk-cart-presentation.js', './kiosk-payment-presentation.js',
  './kiosk-session.js', `./kiosk-session-runtime.js?v=${VERSION}`,
  `./kiosk.css?v=${VERSION}`, `./kiosk-catalog.css?v=${VERSION}`,
  `./kiosk-cart.css?v=${VERSION}`, `./kiosk-payment.css?v=${VERSION}`,
  `./kiosk-session.css?v=${VERSION}`, `./kiosk-polish.css?v=${VERSION}`,
  `./kiosk-fixes-v3.css?v=${VERSION}`,
  './catalog-data.js', './cart-state.js', './product-config.js',
  './assets/mobile-home/brand-wordmark.webp',
  './assets/mobile-home/hero-enhanced.webp',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE)
      .then((cache) => cache.addAll(SHELL))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((key) => key !== CACHE).map((key) => caches.delete(key))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return;
  const url = new URL(event.request.url);
  if (url.pathname.includes('/api/')) return;

  event.respondWith(
    fetch(event.request)
      .then((response) => {
        const copy = response.clone();
        caches.open(CACHE).then((cache) => cache.put(event.request, copy));
        return response;
      })
      .catch(async () => {
        const cached = await caches.match(event.request);
        if (cached) return cached;
        if (event.request.mode === 'navigate') return caches.match('./kiosk.html');
        return Response.error();
      }),
  );
});
