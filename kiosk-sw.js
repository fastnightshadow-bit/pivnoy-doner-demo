const CACHE = 'pivnoy-doner-kiosk-v1';
const SHELL = [
  './kiosk.html', './kiosk-app.js', './kiosk-state.js', './kiosk-api.js',
  './kiosk-presentation.js', './kiosk-cart-presentation.js', './kiosk-payment-presentation.js',
  './kiosk-session.js', './kiosk-session-runtime.js', './kiosk.css', './kiosk-catalog.css',
  './kiosk-cart.css', './kiosk-payment.css', './catalog-data.js', './cart-state.js',
  './product-config.js', './assets/mobile-home/brand-wordmark.webp',
  './assets/mobile-home/hero-enhanced.webp'
];
self.addEventListener('install', (event) => event.waitUntil(caches.open(CACHE).then((cache) => cache.addAll(SHELL)).then(() => self.skipWaiting())));
self.addEventListener('activate', (event) => event.waitUntil(caches.keys().then((keys) => Promise.all(keys.filter((key) => key !== CACHE).map((key) => caches.delete(key)))).then(() => self.clients.claim())));
self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return;
  const url = new URL(event.request.url);
  if (url.pathname.includes('/api/')) return;
  event.respondWith(fetch(event.request).then((response) => { const copy = response.clone(); caches.open(CACHE).then((cache) => cache.put(event.request, copy)); return response; }).catch(() => caches.match(event.request).then((cached) => cached || caches.match('./kiosk.html'))));
});
