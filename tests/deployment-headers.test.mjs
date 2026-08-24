import test from 'node:test';
import assert from 'node:assert/strict';
import { readText } from './helpers.mjs';

test('nginx отдаёт PWA manifest с корректным типом и защищает статические страницы', () => {
  const config = readText('deploy/nginx.conf');
  const headers = readText('deploy/security-headers.conf');

  assert.match(config, /default_type\s+application\/manifest\+json;/);
  assert.ok((config.match(/include \/etc\/nginx\/security-headers\.conf;/g) ?? []).length >= 5);
  assert.match(headers, /X-Frame-Options\s+DENY\s+always;/);
  assert.match(headers, /Strict-Transport-Security\s+"max-age=31536000; includeSubDomains"\s+always;/);
  assert.match(headers, /Content-Security-Policy\s+"[^"]*default-src 'self'/);
  assert.match(headers, /Content-Security-Policy\s+"[^"]*script-src 'self'/);
  assert.match(headers, /Content-Security-Policy\s+"[^"]*object-src 'none'/);
  assert.match(headers, /Content-Security-Policy\s+"[^"]*frame-ancestors 'none'/);
  assert.match(
    headers,
    /Permissions-Policy\s+"camera=\(\), microphone=\(\), geolocation=\(\), payment=\(\)"\s+always;/,
  );
});
