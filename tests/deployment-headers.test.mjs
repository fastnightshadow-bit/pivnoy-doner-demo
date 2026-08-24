import test from 'node:test';
import assert from 'node:assert/strict';
import { readText } from './helpers.mjs';

test('nginx отдаёт PWA manifest с корректным типом и защищает статические страницы', () => {
  const config = readText('deploy/nginx.conf');

  assert.match(config, /default_type\s+application\/manifest\+json;/);
  assert.match(config, /X-Frame-Options\s+SAMEORIGIN\s+always;/);
  assert.match(config, /Strict-Transport-Security\s+"max-age=31536000; includeSubDomains"\s+always;/);
  assert.match(config, /Content-Security-Policy\s+"[^"]*default-src 'self'/);
  assert.match(config, /Content-Security-Policy\s+"[^"]*script-src 'self'/);
  assert.match(config, /Content-Security-Policy\s+"[^"]*object-src 'none'/);
  assert.match(config, /Content-Security-Policy\s+"[^"]*frame-ancestors 'none'/);
  assert.match(
    config,
    /Permissions-Policy\s+"camera=\(\), microphone=\(\), geolocation=\(\), payment=\(\)"\s+always;/,
  );
});
