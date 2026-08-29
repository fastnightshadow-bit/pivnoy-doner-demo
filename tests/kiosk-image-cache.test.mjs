import test from 'node:test';
import assert from 'node:assert/strict';

test('изображения товаров декодируются заранее без повторной загрузки', async () => {
  const { createKioskImageCache } = await import('../kiosk-image-cache.js');
  const requested = [];

  class FakeImage {
    set src(value) {
      this.currentSrc = value;
      requested.push(value);
    }

    decode() {
      return Promise.resolve();
    }
  }

  const cache = createKioskImageCache(FakeImage);
  const products = [
    { image: 'assets/catalog/classic-shawarma.webp' },
    { image: 'assets/catalog/classic-shawarma.webp' },
    { image: 'assets/catalog/doner.webp' },
  ];

  await cache.preloadProducts(products);
  await cache.ensure('assets/catalog/classic-shawarma.webp');

  assert.deepEqual(requested, [
    'assets/catalog/classic-shawarma.webp',
    'assets/catalog/doner.webp',
  ]);
  assert.equal(cache.isReady('assets/catalog/classic-shawarma.webp'), true);
  assert.equal(cache.isReady('assets/catalog/doner.webp'), true);
});

test('ошибка отдельной фотографии не блокирует открытие товара', async () => {
  const { createKioskImageCache } = await import('../kiosk-image-cache.js');

  class BrokenImage {
    set src(value) {
      this.currentSrc = value;
    }

    decode() {
      return Promise.reject(new Error('decode failed'));
    }
  }

  const cache = createKioskImageCache(BrokenImage);
  await assert.doesNotReject(cache.ensure('assets/catalog/missing.webp'));
  assert.equal(cache.isReady('assets/catalog/missing.webp'), false);
});
