import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { getNextKitchenAction } from '../kitchen-model.js';
import { createOrderCardMarkup, createOrderDetailsMarkup } from '../kitchen.js';
import { getOrderPresentation, getOrderProgress } from '../order-state.js';

test('кухня не передаёт доставку курьеру вместо самого курьера', () => {
  assert.equal(
    getNextKitchenAction({ status: 'ready', fulfillment: 'delivery' }),
    null,
  );
  assert.deepEqual(
    getNextKitchenAction({ status: 'ready', fulfillment: 'pickup' }),
    { status: 'issued', label: 'Выдан клиенту' },
  );
});

test('готовая доставка на кухне явно ожидает курьера без кнопки передачи', () => {
  const order = {
    id: 'delivery-1',
    number: '0460',
    status: 'ready',
    fulfillment: 'delivery',
    createdAt: '2026-08-05T10:00:00.000Z',
    paymentStatus: 'succeeded',
    total: 500,
    customer: { name: 'Илья', phone: '+7 999 111-22-33' },
    urgency: { tone: 'normal', label: 'Готов' },
    items: [{ name: 'Шаурма', quantity: 1 }],
  };

  const card = createOrderCardMarkup(order);
  const details = createOrderDetailsMarkup(order);
  assert.match(card, /Ожидает курьера/);
  assert.match(details, /Заказ готов и ожидает курьера/);
  assert.doesNotMatch(`${card}${details}`, /data-next-status="handed_to_courier"/);
});

test('клиент видит передачу курьеру и доставку без лишнего этапа', () => {
  assert.equal(
    getOrderProgress({ status: 'ready', fulfillment: 'delivery' }).labels.at(-1),
    'Готовится',
  );
  assert.equal(
    getOrderPresentation({ status: 'ready', fulfillment: 'delivery' }).title,
    'Готовим ваш заказ',
  );
  assert.equal(
    getOrderProgress({ status: 'courier', fulfillment: 'delivery' }).labels.at(-1),
    'Передан курьеру',
  );
  assert.equal(
    getOrderPresentation({ status: 'courier', fulfillment: 'delivery' }).title,
    'Заказ передан курьеру',
  );
  assert.equal(
    getOrderPresentation({ status: 'completed', fulfillment: 'delivery' }).title,
    'Заказ доставлен',
  );
});

test('карточка курьера содержит одну контекстную кнопку с версией заказа', async () => {
  const previousDocument = globalThis.document;
  globalThis.document = {
    readyState: 'loading',
    addEventListener() {},
  };
  const { createCourierOrderMarkup } = await import(`../courier.js?test=${Date.now()}`);
  globalThis.document = previousDocument;

  const markup = createCourierOrderMarkup({
    id: 'delivery-1',
    number: '0460',
    status: 'ready',
    version: 7,
    promisedAt: '2026-08-05T10:20:00.000Z',
    phone: '+7 (999) 111-22-33',
    address: { street: 'Волоколамское шоссе, 71/22 к2' },
  });

  assert.match(markup, /data-courier-action/);
  assert.match(markup, /data-next-status="courier"/);
  assert.match(markup, /data-order-version="7"/);
  assert.match(markup, />Принять заказ</);
});

test('курьерские immutable-ресурсы используют одну новую версию', async () => {
  const [html, source, apiSource, worker] = await Promise.all([
    readFile(new URL('../courier.html', import.meta.url), 'utf8'),
    readFile(new URL('../courier.js', import.meta.url), 'utf8'),
    readFile(new URL('../courier-api.js', import.meta.url), 'utf8'),
    readFile(new URL('../courier-sw.js', import.meta.url), 'utf8'),
  ]);
  const version = '2026081408';
  assert.match(html, new RegExp(`courier\\.css\\?v=${version}`));
  assert.match(html, new RegExp(`courier\\.js\\?v=${version}`));
  assert.match(source, new RegExp(`courier-api\\.js\\?v=${version}`));
  assert.match(source, new RegExp(`courier-state\\.js\\?v=${version}`));
  assert.match(apiSource, new RegExp(`kitchen-fixtures\\.js\\?v=${version}`));
  assert.match(apiSource, new RegExp(`courier-state\\.js\\?v=${version}`));
  assert.match(worker, /pivnoy-doner-courier-shell-v5/);
  assert.match(worker, new RegExp(`courier\\.js\\?v=${version}`));
  assert.match(worker, new RegExp(`kitchen-fixtures\\.js\\?v=${version}`));
  assert.match(worker, /preparation-time\.js/);
});

test('клиент и кухня получают новую механику статусов без старого immutable-кэша', async () => {
  const [
    homeHtml,
    homeSource,
    orderHtml,
    orderSource,
    kitchenHtml,
    kitchenSource,
    kitchenApiSource,
    kitchenWorker,
  ] = await Promise.all([
    readFile(new URL('../home.html', import.meta.url), 'utf8'),
    readFile(new URL('../home.js', import.meta.url), 'utf8'),
    readFile(new URL('../order.html', import.meta.url), 'utf8'),
    readFile(new URL('../order.js', import.meta.url), 'utf8'),
    readFile(new URL('../kitchen.html', import.meta.url), 'utf8'),
    readFile(new URL('../kitchen.js', import.meta.url), 'utf8'),
    readFile(new URL('../kitchen-api.js', import.meta.url), 'utf8'),
    readFile(new URL('../kitchen-sw.js', import.meta.url), 'utf8'),
  ]);
  const version = '2026081410';
  assert.match(homeHtml, /home\.js\?v=2026081404/);
  assert.match(homeSource, /order-state\.js\?v=2026081404/);
  assert.match(orderHtml, /order\.js\?v=2026081404/);
  assert.match(orderSource, /order-state\.js\?v=2026081404/);
  assert.match(kitchenHtml, new RegExp(`kitchen\\.css\\?v=${version}`));
  assert.match(kitchenHtml, new RegExp(`kitchen\\.js\\?v=${version}`));
  assert.match(kitchenSource, new RegExp(`kitchen-api\\.js\\?v=${version}`));
  assert.match(kitchenSource, new RegExp(`kitchen-model\\.js\\?v=${version}`));
  assert.match(kitchenSource, new RegExp(`kitchen-sw\\.js\\?v=${version}`));
  assert.match(kitchenApiSource, new RegExp(`kitchen-model\\.js\\?v=${version}`));
  assert.match(kitchenWorker, /pivnoy-doner-kitchen-shell-v9/);
  assert.match(kitchenWorker, new RegExp(`kitchen\\.js\\?v=${version}`));
  assert.match(kitchenWorker, new RegExp(`kitchen-model\\.js\\?v=${version}`));
});

test('после действия курьера список обязательно обновляется после текущего запроса', async () => {
  const source = await readFile(new URL('../courier.js', import.meta.url), 'utf8');
  assert.match(source, /let loadPromise = null/);
  assert.match(source, /if \(loadPromise\) return loadPromise/);
  assert.match(source, /if \(loadPromise\) await loadPromise;\s*await loadOrders\(\)/);
});
