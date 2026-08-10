import test from 'node:test';
import assert from 'node:assert/strict';
import { canTransition } from '../src/domain/status-machine.js';
import { calculateEta } from '../src/domain/eta.js';

test('новый заказ нельзя сразу сделать готовым', () => {
  assert.equal(canTransition('submitted', 'ready', 'kitchen'), false);
  assert.equal(canTransition('submitted', 'accepted', 'kitchen'), true);
  assert.equal(canTransition('accepted', 'cooking', 'kitchen'), true);
  assert.equal(canTransition('cooking', 'ready', 'kitchen'), true);
});

test('курьер меняет только доставочные этапы', () => {
  assert.equal(canTransition('ready', 'courier', 'courier'), true);
  assert.equal(canTransition('courier', 'delivered', 'courier'), true);
  assert.equal(canTransition('accepted', 'cooking', 'courier'), false);
});

test('два повара обрабатывают до шести шаверм параллельно', () => {
  assert.deepEqual(calculateEta({ shawarmaPortions: 6, otherMinutes: 0 }), {
    min: 6,
    max: 8,
  });
  assert.deepEqual(calculateEta({ shawarmaPortions: 7, otherMinutes: 0 }), {
    min: 12,
    max: 15,
  });
});

test('прочие блюда добавляют своё время к очереди', () => {
  assert.deepEqual(calculateEta({ shawarmaPortions: 1, otherMinutes: 4 }), {
    min: 10,
    max: 12,
  });
});
