import test from 'node:test';
import assert from 'node:assert/strict';
import { extractJson, readPngDimensions, readText } from './helpers.mjs';

const clientPages = [
  'home.html',
  'catalog.html',
  'dish.html',
  'cart.html',
  'checkout.html',
  'order.html',
];

test('каждая клиентская страница подключает manifest и фирменные иконки', () => {
  for (const page of clientPages) {
    const html = readText(page);
    assert.match(html, /rel="manifest" href="client\.webmanifest\?v=20260805"/, page);
    assert.match(html, /rel="icon"[^>]+assets\/app\/favicon-32\.png\?v=20260805/, page);
    assert.match(html, /rel="apple-touch-icon"[^>]+assets\/app\/apple-touch-icon\.png\?v=20260805/, page);
  }
});

test('client manifest запускает главную и содержит обычную и maskable иконки', () => {
  const manifest = extractJson('client.webmanifest');
  assert.equal(manifest.name, 'Пивной Донер');
  assert.equal(manifest.short_name, 'Пивной Донер');
  assert.equal(manifest.start_url, './home.html');
  assert.equal(manifest.display, 'standalone');
  assert.deepEqual(
    manifest.icons.map(({ src, sizes, purpose }) => ({ src, sizes, purpose })),
    [
      { src: 'assets/app/icon-192.png', sizes: '192x192', purpose: 'any' },
      { src: 'assets/app/icon-512.png', sizes: '512x512', purpose: 'any' },
      { src: 'assets/app/icon-maskable-512.png', sizes: '512x512', purpose: 'maskable' },
    ],
  );
});

test('фирменные PNG имеют системные квадратные размеры', () => {
  const expected = new Map([
    ['assets/app/favicon-16.png', 16],
    ['assets/app/favicon-32.png', 32],
    ['assets/app/apple-touch-icon.png', 180],
    ['assets/app/icon-192.png', 192],
    ['assets/app/icon-512.png', 512],
    ['assets/app/icon-maskable-512.png', 512],
    ['assets/courier/icon-192.png', 192],
    ['assets/courier/icon-512.png', 512],
  ]);

  for (const [file, size] of expected) {
    assert.deepEqual(readPngDimensions(file), { width: size, height: size }, file);
  }
});

test('демонстрационный портал больше не использует кухонную иконку', () => {
  const html = readText('index.html');
  assert.doesNotMatch(html, /assets\/kitchen\/icon-/);
  assert.match(html, /assets\/app\/apple-touch-icon\.png\?v=20260805/);
  const manifest = extractJson('demo.webmanifest');
  assert.equal(manifest.icons[0].src, 'assets/app/icon-192.png');
});
