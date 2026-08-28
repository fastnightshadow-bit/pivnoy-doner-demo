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

test('Docker build context включает конфигурацию security headers', () => {
  const dockerignore = readText('.dockerignore');

  assert.match(dockerignore, /^!deploy\/security-headers\.conf$/m);
});

test('nginx отдаёт SEO-файлы напрямую и не подменяет их главной страницей', () => {
  const config = readText('deploy/nginx.conf');

  assert.match(
    config,
    /map \$host \$robots_entry\s*\{[\s\S]*?pivdoner\\\.ru\$ \/robots\.txt;[\s\S]*?default \/robots-private\.txt;[\s\S]*?\}/,
  );
  assert.match(
    config,
    /location = \/robots\.txt\s*\{[\s\S]*?default_type text\/plain;[\s\S]*?try_files \$robots_entry =404;[\s\S]*?\}/,
  );
  assert.match(
    config,
    /location = \/sitemap\.xml\s*\{[\s\S]*?default_type application\/xml;[\s\S]*?try_files \$uri =404;[\s\S]*?\}/,
  );
});
