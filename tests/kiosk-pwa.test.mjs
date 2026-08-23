import test from 'node:test';
import assert from 'node:assert/strict';
import { extractJson, readText } from './helpers.mjs';

test('стойка устанавливается как отдельное портретное Android PWA', () => {
  const manifest = extractJson('kiosk.webmanifest');
  assert.equal(manifest.start_url, './kiosk.html');
  assert.equal(manifest.display, 'standalone');
  assert.equal(manifest.orientation, 'portrait');
  assert.ok(manifest.icons.some(({ sizes, purpose }) => sizes === '512x512' && purpose.includes('maskable')));
});

test('стойка регистрирует собственный service worker и кэширует оболочку', () => {
  assert.match(readText('kiosk-session-runtime.js'), /serviceWorker\.register\('\.\/kiosk-sw\.js'\)/);
  const worker = readText('kiosk-sw.js');
  assert.match(worker, /kiosk\.html/);
  assert.match(worker, /kiosk-app\.js/);
});
