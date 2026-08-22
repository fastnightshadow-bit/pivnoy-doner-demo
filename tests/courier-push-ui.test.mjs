import assert from 'node:assert/strict';
import test from 'node:test';

import { getCourierPushViewModel } from '../courier-push.js';
import { readText } from './helpers.mjs';

test('courier notification card has clear copy for every push state', () => {
  assert.deepEqual(getCourierPushViewModel('subscribed'), {
    title: 'Уведомления включены',
    description: 'Новые оплаченные доставки придут даже при закрытом приложении',
    button: 'Отключить',
    disabled: false,
  });
  assert.equal(getCourierPushViewModel('default').button, 'Включить');
  assert.match(getCourierPushViewModel('denied').description, /настройках браузера/i);
  assert.equal(getCourierPushViewModel('unsupported').disabled, true);
  assert.match(getCourierPushViewModel('error').description, /заказы продолжат обновляться/i);
});

test('courier page integrates explicit push controls without foreground duplicates', () => {
  const html = readText('courier.html');
  const source = readText('courier.js');

  assert.match(source, /createCourierPushManager/);
  assert.match(source, /getCourierPushViewModel/);
  assert.match(source, /pushManager\.enable\(\)/);
  assert.match(source, /pushManager\.disable\(\)/);
  assert.match(source, /createStaffLiveSync/);
  assert.doesNotMatch(source, /registration\?\.showNotification/);
  assert.match(html, /data-courier-notification-title/);
  assert.match(html, /data-courier-notification-description/);
  assert.match(html, /data-state="default"[^>]*data-courier-notifications/);
});

test('courier logout unregisters this browser push endpoint before ending session', () => {
  const source = readText('courier.js');
  const logout = source.match(/refs\.logout\.addEventListener\([\s\S]*?\n\s*\}\);/);
  assert.ok(logout);
  assert.match(logout[0], /pushManager\.disable\(\)/);
  assert.ok(
    logout[0].indexOf('pushManager.disable()') < logout[0].indexOf('api.logout()'),
    'push endpoint should be removed before the authenticated session ends',
  );
});
