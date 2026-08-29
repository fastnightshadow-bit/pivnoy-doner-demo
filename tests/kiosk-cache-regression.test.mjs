import test from 'node:test';
import assert from 'node:assert/strict';

import { readText } from './helpers.mjs';

test('PWA обновляет кэш вместе с финальными исправлениями стойки', () => {
  const sw = readText('kiosk-sw.js');
  const runtime = readText('kiosk-session-runtime.js');
  assert.match(sw, /const VERSION = '20260823-8'/);
  assert.match(sw, /const CACHE = `pivnoy-doner-kiosk-\$\{VERSION\}`/);
  assert.match(sw, /kiosk-fixes-v3\.css/);
  assert.match(runtime, /const KIOSK_BUILD = '20260823-8'/);
  assert.match(runtime, /register\(`\.\/kiosk-sw\.js\?v=\$\{KIOSK_BUILD\}`/);
});
