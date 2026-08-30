import test from 'node:test';
import assert from 'node:assert/strict';
import { extractJson, readText } from './helpers.mjs';

test('стойка устанавливается как отдельное Android PWA для любой ориентации', () => {
  const manifest = extractJson('kiosk.webmanifest');
  assert.equal(manifest.start_url, './kiosk.html');
  assert.equal(manifest.display, 'standalone');
  assert.equal(manifest.orientation, 'any');
  assert.ok(manifest.icons.some(({ sizes, purpose }) => sizes === '512x512' && purpose.includes('maskable')));
});

test('стойка регистрирует версионированный service worker и кэширует оболочку', () => {
  const runtime = readText('kiosk-session-runtime.js');
  assert.match(runtime, /const KIOSK_BUILD = '20260830-2'/);
  assert.ok(runtime.includes(".register(`./kiosk-sw.js?v=${KIOSK_BUILD}`, { updateViaCache: 'none' })"));
  const worker = readText('kiosk-sw.js');
  assert.match(worker, /kiosk\.html/);
  assert.match(worker, /kiosk-app\.js/);
});
