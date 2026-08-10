import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), 'utf8');

test('production compose keeps PostgreSQL private and isolates the new stack', async () => {
  const compose = await read('deploy/docker-compose.production.yml');
  assert.match(compose, /pivdoner-web/);
  assert.match(compose, /pivdoner-api/);
  assert.match(compose, /pivdoner-db/);
  assert.match(compose, /healthcheck:/);
  assert.match(compose, /name:\s*pivnoy_doner_caddy/);
  assert.doesNotMatch(compose, /5432\s*:\s*5432/);
  assert.doesNotMatch(compose, /container_name:\s*(?:caddy|shawarma-app|shop-backend|tse-bot)\b/);
});

test('Caddy routes client and staff subdomains to the isolated services', async () => {
  const caddy = await read('deploy/Caddyfile.pivdoner');
  for (const host of [
    'pivdoner.ru',
    'kitchen.pivdoner.ru',
    'courier.pivdoner.ru',
    'owner.pivdoner.ru',
    'stage.pivdoner.ru',
  ]) {
    assert.match(caddy, new RegExp(host.replaceAll('.', '\\.')));
  }
  assert.match(caddy, /reverse_proxy\s+pivdoner-api:3001/);
  assert.match(caddy, /reverse_proxy\s+pivdoner-web:8080/);
});

test('web container maps each host to its own PWA entry point', async () => {
  const nginx = await read('deploy/nginx.conf');
  assert.ok(nginx.includes('~^kitchen\\.pivdoner\\.ru$ /kitchen.html;'));
  assert.ok(nginx.includes('~^courier\\.pivdoner\\.ru$ /courier.html;'));
  assert.ok(nginx.includes('~^owner\\.pivdoner\\.ru$ /owner.html;'));
  assert.match(nginx, /default\s+\/home\.html/);
});

test('deployment template contains placeholders but no production secrets', async () => {
  const env = await read('deploy/.env.example');
  assert.match(env, /POSTGRES_PASSWORD=change-me/);
  assert.match(env, /SESSION_SECRET=change-me/);
  assert.match(env, /PAYMENT_PROVIDER=mock/);
  assert.match(env, /YOOKASSA_SECRET_KEY=$/m);
  assert.doesNotMatch(env, /Preacher768|codex-pivdoner-temp/);
});

test('backup script stops on errors and verifies every archive', async () => {
  const script = await read('deploy/backup.sh');
  assert.match(script, /set -Eeuo pipefail/);
  assert.match(script, /pg_dump/);
  assert.match(script, /SHA256SUMS/);
  assert.match(script, /sha256sum -c/);
  assert.doesNotMatch(script, /rm\s+-rf/);
});
