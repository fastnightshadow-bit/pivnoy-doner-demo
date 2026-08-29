import test from 'node:test';
import assert from 'node:assert/strict';

import { createKioskSessionController } from '../kiosk-session.js';

const harness = () => {
  const timers = [];
  const events = [];
  const controller = createKioskSessionController({
    setTimeoutImpl: (callback, delay) => { timers.push({ callback, delay, cleared: false }); return timers.length - 1; },
    clearTimeoutImpl: (id) => { if (timers[id]) timers[id].cleared = true; },
    onWarn: () => events.push('warn'),
    onReset: () => events.push('reset'),
  });
  return { controller, timers, events };
};

test('пустой заказ предупреждается и сбрасывается через 60 секунд бездействия', () => {
  const { controller, timers } = harness();
  controller.sync({ screen: 'catalog', lines: [] });
  assert.deepEqual(timers.filter(({ cleared }) => !cleared).map(({ delay }) => delay), [50_000, 60_000]);
});

test('корзина сначала предупреждает, затем очищается', () => {
  const { controller, timers } = harness();
  controller.sync({ screen: 'cart', lines: [{ quantity: 1 }] });
  assert.deepEqual(timers.filter(({ cleared }) => !cleared).map(({ delay }) => delay), [50_000, 60_000]);
});

test('экран успеха возвращается в начало через 10 секунд', () => {
  const { controller, timers } = harness();
  controller.sync({ screen: 'success', lines: [{ quantity: 1 }] });
  assert.deepEqual(timers.filter(({ cleared }) => !cleared).map(({ delay }) => delay), [10_000]);
});
