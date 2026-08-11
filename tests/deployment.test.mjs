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

test('API image includes the shared server-side catalog', async () => {
  const compose = await read('deploy/docker-compose.production.yml');
  const dockerfile = await read('server/Dockerfile');
  const ignore = await read('server/Dockerfile.dockerignore');
  assert.match(
    compose,
    /api:\s*[\s\S]*?build:\s*[\s\S]*?context:\s*\.\.[\s\S]*?dockerfile:\s*server\/Dockerfile/,
  );
  assert.match(dockerfile, /COPY\s+shared\s+\/app\/shared/);
  assert.match(
    dockerfile,
    /COPY\s+catalog-data\.js\s+product-config\.js\s+option-quantities\.js\s+\/app\//,
  );
  assert.match(ignore, /!shared\/\*\*/);
  assert.match(ignore, /!server\/src\/\*\*/);
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

test('stage Caddy rollout preserves the legacy site and exposes only the test host', async () => {
  const caddy = await read('deploy/Caddyfile.stage');
  assert.match(caddy, /^pivnoy-doner\.digital\s*\{/m);
  assert.match(caddy, /^stage\.pivdoner\.ru\s*\{/m);
  assert.doesNotMatch(caddy, /^pivdoner\.ru(?:,|\s)/m);
  assert.doesNotMatch(caddy, /^(?:kitchen|courier|owner)\.pivdoner\.ru\s*\{/m);
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

test('client pages version their changed immutable assets', async () => {
  const releaseKey = '2026081203';
  const nginx = await read('deploy/nginx.conf');
  const cartHtml = await read('cart.html');
  const checkoutHtml = await read('checkout.html');
  const dishHtml = await read('dish.html');
  const homeHtml = await read('home.html');
  const orderHtml = await read('order.html');
  const checkoutSource = await read('checkout.js');
  const homeSource = await read('home.js');
  const orderSource = await read('order.js');
  const orderDemoSource = await read('order-demo.js');
  const reviewServiceSource = await read('review-service.js');

  assert.match(
    nginx,
    /location\s+~\*[^\n]*\\\.\(\?:css\|js\|[^\n]*\)[^{]*\{[^}]*Cache-Control\s+"public, immutable"/s,
  );
  assert.match(
    checkoutHtml,
    new RegExp(`<script\\s+type="module"\\s+src="checkout\\.js\\?v=${releaseKey}"><\\/script>`),
  );
  assert.match(checkoutHtml, /href="checkout\.css\?v=20260811"/);
  assert.match(
    homeHtml,
    new RegExp(`<script\\s+type="module"\\s+src="home\\.js\\?v=${releaseKey}"><\\/script>`),
  );
  assert.match(
    orderHtml,
    new RegExp(`<script\\s+type="module"\\s+src="order\\.js\\?v=${releaseKey}"><\\/script>`),
  );
  for (const html of [cartHtml, checkoutHtml, dishHtml, homeHtml, orderHtml]) {
    assert.match(
      html,
      new RegExp(`href="client-theme\\.css\\?v=${releaseKey}"`),
    );
  }

  const getVersionedImports = (source) => [
    ...source.matchAll(/\bfrom\s+['"]([^'"]+\?v=[^'"]+)['"]/g),
  ].map((match) => match[1]);
  assert.deepEqual(
    getVersionedImports(checkoutSource),
    [
      './checkout-state.js?v=20260811',
      `./order-storage.js?v=${releaseKey}`,
      `./client-api.js?v=${releaseKey}`,
      './shared/legal.js?v=20260811',
    ],
  );
  assert.deepEqual(getVersionedImports(homeSource), [
    `./order-storage.js?v=${releaseKey}`,
    `./review-service.js?v=${releaseKey}`,
    `./client-api.js?v=${releaseKey}`,
  ]);
  assert.deepEqual(getVersionedImports(orderSource), [
    `./order-storage.js?v=${releaseKey}`,
    `./review-service.js?v=${releaseKey}`,
    `./review-state.js?v=${releaseKey}`,
    `./order-demo.js?v=${releaseKey}`,
    `./client-api.js?v=${releaseKey}`,
  ]);
  assert.deepEqual(getVersionedImports(orderDemoSource), [
    `./order-storage.js?v=${releaseKey}`,
  ]);
  assert.deepEqual(getVersionedImports(reviewServiceSource), [
    `./review-state.js?v=${releaseKey}`,
    './shared/legal.js?v=20260811',
  ]);

  const completeGraph = [
    checkoutSource,
    homeSource,
    orderSource,
    orderDemoSource,
    reviewServiceSource,
  ].join('\n');
  for (const moduleName of [
    'order-storage',
    'client-api',
    'review-service',
    'review-state',
    'order-demo',
  ]) {
    const imports = [
      ...completeGraph.matchAll(
        new RegExp(`\\./${moduleName}\\.js\\?v=([^'"\\s]+)`, 'g'),
      ),
    ];
    assert.ok(imports.length > 0, moduleName);
    assert.deepEqual(
      [...new Set(imports.map((match) => match[1]))],
      [releaseKey],
      moduleName,
    );
  }
});

test('deployment template contains placeholders but no production secrets', async () => {
  const env = await read('deploy/.env.example');
  assert.match(env, /POSTGRES_PASSWORD=change-me/);
  assert.match(env, /SESSION_SECRET=change-me/);
  assert.match(env, /ORDER_ACCESS_SECRET=change-me-order-access/);
  assert.match(
    env,
    /ORDER_ACCESS_SECRET must be at least 32 characters and differ from SESSION_SECRET/,
  );
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
