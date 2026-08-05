import test from 'node:test';
import assert from 'node:assert/strict';
import {
  calculatePreparationMinutes,
  countShawarmaUnits,
  createPreparationEta,
} from '../preparation-time.js';

test('два повара готовят до шести шаверм за восьмиминутный цикл', () => {
  assert.equal(
    calculatePreparationMinutes({ incomingUnits: 1, queuedUnits: 0 }),
    8,
  );
  assert.equal(
    calculatePreparationMinutes({ incomingUnits: 6, queuedUnits: 0 }),
    8,
  );
  assert.equal(
    calculatePreparationMinutes({ incomingUnits: 7, queuedUnits: 0 }),
    16,
  );
});

test('занятая очередь переносит заказ на следующий цикл', () => {
  assert.equal(
    calculatePreparationMinutes({ incomingUnits: 1, queuedUnits: 6 }),
    16,
  );
  assert.equal(
    calculatePreparationMinutes({ incomingUnits: 6, queuedUnits: 12 }),
    24,
  );
});

test('шавермы считаются по идентификатору или названию и количеству', () => {
  assert.equal(
    countShawarmaUnits([
      { productId: 'classic-shawarma', name: 'Классическая', quantity: 2 },
      { productId: 'fries', name: 'Картофель фри', quantity: 3 },
      { productId: '', name: 'Шаурма Карри', quantity: 1 },
    ]),
    3,
  );
});

test('пустой заказ получает безопасный минимальный ориентир', () => {
  assert.deepEqual(createPreparationEta([], []), { min: 8, max: 12 });
});

test('ориентир учитывает шавермы в активной очереди', () => {
  const queuedItems = [{ productId: 'classic-shawarma', quantity: 6 }];
  const incomingItems = [{ productId: 'curry-shawarma', quantity: 2 }];
  assert.deepEqual(createPreparationEta(incomingItems, queuedItems), {
    min: 16,
    max: 20,
  });
});
