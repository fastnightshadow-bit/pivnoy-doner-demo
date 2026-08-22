import test from 'node:test';
import assert from 'node:assert/strict';
import { readText } from './helpers.mjs';

test('nginx отдаёт PWA manifest с корректным типом и защищает статические страницы', () => {
  const config = readText('deploy/nginx.conf');

  assert.match(config, /application\/manifest\+json\s+webmanifest;/);
  assert.match(config, /X-Frame-Options\s+SAMEORIGIN\s+always;/);
  assert.match(config, /Strict-Transport-Security\s+"max-age=31536000; includeSubDomains"\s+always;/);
});