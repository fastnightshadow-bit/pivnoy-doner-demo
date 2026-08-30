import test from 'node:test';
import assert from 'node:assert/strict';
import { renderKioskActivation } from '../kiosk-activation-presentation.js';

test('неподключённый планшет показывает понятную форму одноразового кода', () => {
  const markup = renderKioskActivation();
  assert.match(markup, /Подключение киоска/);
  assert.match(markup, /data-kiosk-activation-form/);
  assert.match(markup, /data-kiosk-activation-code/);
  assert.match(markup, /data-kiosk-device-name/);
  assert.match(markup, /6-значный код/);
});

test('ошибка активации не раскрывает технические детали', () => {
  const markup = renderKioskActivation({
    error: 'Код не подошёл или уже использован',
    pending: false,
  });
  assert.match(markup, /Код не подошёл или уже использован/);
  assert.doesNotMatch(markup, /token|cookie|hash/i);
});
