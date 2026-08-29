import test from 'node:test';
import assert from 'node:assert/strict';

import { readText } from './helpers.mjs';

test('PWA стойки запрашивает свежий service worker без HTTP-кэша', () => {
  const runtime = readText('kiosk-session-runtime.js');
  assert.match(runtime, /updateViaCache:\s*'none'/);
  assert.match(runtime, /registration\.update\(\)/);
});

test('PWA стойки один раз перезагружает экран после смены контроллера', () => {
  const runtime = readText('kiosk-session-runtime.js');
  assert.match(runtime, /controllerchange/);
  assert.match(runtime, /kiosk-sw-reloaded/);
});
