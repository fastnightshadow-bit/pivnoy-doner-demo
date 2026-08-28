import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { readText } from './helpers.mjs';

const trackedPublicPages = [
  'home.html',
  'catalog.html',
  'dish.html',
  'cart.html',
  'seller.html',
  'offer.html',
  'privacy.html',
  'consent.html',
  'review-consent.html',
];

test('только публичные клиентские страницы подключают управление Метрикой', () => {
  for (const page of trackedPublicPages) {
    const html = readText(page);
    assert.match(html, /href="analytics-consent\.css\?v=20260828"/, page);
    assert.match(html, /src="metrika\.js\?v=20260828"/, page);
  }

  for (const page of ['checkout.html', 'order.html', 'index.html', 'kitchen.html', 'courier.html', 'owner.html']) {
    assert.doesNotMatch(readText(page), /metrika\.js|analytics-consent\.css/, page);
  }
});

test('Метрика не запускается без согласия и отключает Вебвизор', async () => {
  const moduleUrl = new URL('../metrika.js', import.meta.url);
  assert.equal(existsSync(moduleUrl), true, 'metrika.js must exist');
  if (!existsSync(moduleUrl)) return;

  const {
    CONSENT_STORAGE_KEY,
    METRIKA_COUNTER_ID,
    createAnalyticsController,
    getSafeStorage,
    isProductionHost,
  } = await import(moduleUrl);
  const saved = new Map();
  const appended = [];
  const storage = {
    getItem: (key) => saved.get(key) ?? null,
    setItem: (key, value) => saved.set(key, value),
  };
  const windowRef = {};
  const documentRef = {
    createElement: () => Object.defineProperty({}, 'dataset', {
      value: {},
      writable: false,
    }),
    head: { append: (node) => appended.push(node) },
  };
  const controller = createAnalyticsController({ windowRef, documentRef, storage });

  assert.equal(METRIKA_COUNTER_ID, 111695901);
  assert.equal(controller.initialize(), null);
  assert.equal(appended.length, 0);
  assert.equal(windowRef.disableYaCounter111695901, true);

  controller.accept();
  assert.equal(saved.get(CONSENT_STORAGE_KEY), 'granted');
  assert.equal(windowRef.disableYaCounter111695901, false);
  assert.equal(appended.length, 1);
  assert.equal(appended[0].src, 'https://mc.yandex.ru/metrika/tag.js?id=111695901');
  assert.equal(appended[0].async, true);

  const initCall = [...windowRef.ym.a[0]];
  assert.equal(initCall[0], 111695901);
  assert.equal(initCall[1], 'init');
  assert.equal(initCall[2].webvisor, false);
  assert.equal(initCall[2].clickmap, false);
  assert.equal(initCall[2].trackLinks, true);

  controller.decline();
  assert.equal(saved.get(CONSENT_STORAGE_KEY), 'denied');
  assert.equal(windowRef.disableYaCounter111695901, true);
  assert.equal([...windowRef.ym.a.at(-1)][1], 'destruct');

  controller.accept();
  assert.equal(appended.length, 1, 'the external tag must not be downloaded twice');
  assert.equal([...windowRef.ym.a.at(-1)][1], 'init');

  const blockedWindow = {};
  Object.defineProperty(blockedWindow, 'localStorage', {
    get() { throw new DOMException('Blocked', 'SecurityError'); },
  });
  assert.equal(getSafeStorage(blockedWindow), null);
  assert.equal(isProductionHost({ hostname: 'pivdoner.ru' }), true);
  assert.equal(isProductionHost({ hostname: 'www.pivdoner.ru' }), true);
  assert.equal(isProductionHost({ hostname: 'stage.pivdoner.ru' }), false);
  assert.equal(isProductionHost({ hostname: 'kitchen.pivdoner.ru' }), false);
  assert.equal(isProductionHost({ hostname: 'localhost' }), false);
});

test('политика раскрывает аналитику и позволяет изменить выбор', () => {
  const privacy = readText('privacy.html');

  assert.match(privacy, /Яндекс Метрик/i);
  assert.match(privacy, /111695901/);
  assert.match(privacy, /соглас/i);
  assert.match(privacy, /data-analytics-settings/);
  assert.match(privacy, /страницах оформления заказа и статуса[^.]*не подключается/i);
  assert.doesNotMatch(privacy, /не использует Яндекс Метрику/i);
});

test('CSP разрешает только необходимые адреса Метрики', () => {
  const headers = readText('deploy/security-headers.conf');
  const regionalOrigins = [
    'https://mc.yandex.ru',
    'https://mc.yandex.az',
    'https://mc.yandex.by',
    'https://mc.yandex.co.il',
    'https://mc.yandex.com',
    'https://mc.yandex.com.am',
    'https://mc.yandex.com.ge',
    'https://mc.yandex.com.tr',
    'https://mc.yandex.ee',
    'https://mc.yandex.fr',
    'https://mc.yandex.kg',
    'https://mc.yandex.kz',
    'https://mc.yandex.lt',
    'https://mc.yandex.lv',
    'https://mc.yandex.md',
    'https://mc.yandex.tj',
    'https://mc.yandex.tm',
    'https://mc.yandex.uz',
  ];

  assert.match(headers, /script-src 'self' https:\/\/mc\.yandex\.ru https:\/\/yastatic\.net;/);
  for (const origin of regionalOrigins) {
    assert.ok(headers.includes(origin), origin);
    assert.ok(headers.includes(origin.replace('https:', 'wss:')), `${origin} websocket`);
  }
  assert.match(headers, /frame-ancestors 'none'/);
  assert.doesNotMatch(headers, /(?:child|frame)-src\s+[^;]*mc\.yandex/);
  assert.match(headers, /Referrer-Policy origin always;/);
  assert.doesNotMatch(headers, /Referrer-Policy strict-origin-when-cross-origin/);
});
