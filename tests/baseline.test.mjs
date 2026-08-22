import test from 'node:test';
import assert from 'node:assert/strict';
import { readText } from './helpers.mjs';

const requiredPages = [
  'home.html',
  'catalog.html',
  'dish.html',
  'cart.html',
  'checkout.html',
  'order.html',
  'kitchen.html',
  'courier.html',
  'kiosk.html',
];

test('свежая демонстрационная версия содержит все основные страницы', () => {
  for (const page of requiredPages) {
    assert.match(readText(page), /<!doctype html>/i, page);
  }
});
