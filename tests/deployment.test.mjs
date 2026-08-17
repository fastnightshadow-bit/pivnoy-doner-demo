import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), 'utf8');

const composeService = (compose, name) => {
  const match = compose.match(
    new RegExp(`^  ${name}:\\r?\\n[\\s\\S]*?(?=^  [a-z0-9_-]+:\\r?$|^networks:\\r?$)`, 'im'),
  );
  assert.ok(match, `missing ${name} compose service`);
  return match[0];
};

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

test('retention worker is profile-gated and uses the private API runtime once daily', async () => {
  const compose = await read('deploy/docker-compose.production.yml');
  const env = await read('deploy/.env.example');
  const api = composeService(compose, 'api');
  const db = composeService(compose, 'db');
  const retention = composeService(compose, 'retention');

  assert.match(api, /^    image:\s*pivdoner-api:local$/m);
  assert.match(api, /^    build:$/m);
  assert.match(retention, /^    profiles:\s*\["retention"\]$/m);
  assert.match(retention, /^    image:\s*pivdoner-api:local$/m);
  assert.match(retention, /^    restart:\s*unless-stopped$/m);
  assert.match(retention, /^      RETENTION_APPLY_CONFIRM:\s*"YES"$/m);
  assert.match(retention, /^      DATABASE_URL:\s*postgresql:\/\//m);
  assert.match(retention, /^      db:\r?\n        condition:\s*service_healthy$/m);
  assert.match(retention, /^    networks:\r?\n      - internal$/m);
  assert.match(
    retention,
    /^    command: \["sh", "-c", "set -eu; while true; do node src\/scripts\/retention\.js --apply; sleep 86400; done"\]$/m,
  );
  assert.doesNotMatch(retention, /^    (?:build|expose|ports):/m);
  assert.doesNotMatch(retention, /\bcaddy\b/);
  assert.doesNotMatch(db, /^    ports:/m);
  assert.match(env, /^RETENTION_APPLY_CONFIRM=YES$/m);
});

test('Caddy routes client and staff subdomains to the isolated services', async () => {
  const caddy = await read('deploy/Caddyfile.pivdoner');
  assert.match(caddy, /^pivnoy-doner\.digital\s*\{/m);
  assert.match(caddy, /reverse_proxy\s+app:3001/);
  assert.match(caddy, /reverse_proxy\s+app:3000/);
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
  assert.match(
    caddy,
    /stage\.pivdoner\.ru\s*\{[\s\S]*?reverse_proxy\s+pivdoner-stage-api:3001[\s\S]*?reverse_proxy\s+pivdoner-stage-web:8080[\s\S]*?\}/,
  );
});

test('stage compose has an isolated database and cannot use live YooKassa credentials', async () => {
  const compose = await read('deploy/docker-compose.stage.yml');
  const web = composeService(compose, 'web');
  const api = composeService(compose, 'api');
  const db = composeService(compose, 'db');

  assert.match(web, /^    container_name:\s*pivdoner-stage-web$/m);
  assert.match(api, /^    container_name:\s*pivdoner-stage-api$/m);
  assert.match(db, /^    container_name:\s*pivdoner-stage-db$/m);
  assert.match(api, /^      PAYMENT_PROVIDER:\s*mock$/m);
  assert.match(api, /^      PUBLIC_BASE_URL:\s*https:\/\/stage\.pivdoner\.ru$/m);
  assert.match(compose, /pivdoner_stage_pg_data/);
  assert.doesNotMatch(compose, /YOOKASSA_(?:SHOP_ID|SECRET_KEY)/);
  assert.doesNotMatch(db, /^    ports:/m);
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
  const releaseKey = '2026081402';
  const catalogReleaseKey = '2026081702';
  const checkoutReleaseKey = '2026081702';
  const handoffReleaseKey = '2026081404';
  const styleReleaseKey = '2026081405';
  const homeStyleReleaseKey = '2026081702';
  const homeReleaseKey = '2026081702';
  const themeReleaseKey = '2026081406';
  const kitchenReleaseKey = '2026081702';
  const courierReleaseKey = '2026081408';
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
  const reviewViewSource = await read('review-view.js');
  const kitchenHtml = await read('kitchen.html');
  const courierHtml = await read('courier.html');
  const kitchenSource = await read('kitchen.js');
  const courierSource = await read('courier.js');
  const kitchenApiSource = await read('kitchen-api.js');
  const courierApiSource = await read('courier-api.js');
  const kitchenWorker = await read('kitchen-sw.js');
  const courierWorker = await read('courier-sw.js');

  assert.match(
    nginx,
    /location\s+~\*[^\n]*\\\.\(\?:css\|js\|[^\n]*\)[^{]*\{[^}]*Cache-Control\s+"public, immutable"/s,
  );
  assert.match(
    checkoutHtml,
    new RegExp(`<script\\s+type="module"\\s+src="checkout\\.js\\?v=${checkoutReleaseKey}"><\\/script>`),
  );
  assert.match(checkoutHtml, /href="checkout\.css\?v=20260811"/);
  assert.match(cartHtml, new RegExp(`href="cart\\.css\\?v=${styleReleaseKey}"`));
  assert.match(homeHtml, new RegExp(`href="home\\.css\\?v=${homeStyleReleaseKey}"`));
  assert.match(homeHtml, new RegExp(`src="home\\.js\\?v=${homeReleaseKey}"`));
  assert.match(homeHtml, new RegExp(`href="product-sheet\\.css\\?v=${catalogReleaseKey}"`));
  assert.match(
    orderHtml,
    new RegExp(`<script\\s+type="module"\\s+src="order\\.js\\?v=${handoffReleaseKey}"><\\/script>`),
  );
  for (const html of [cartHtml, checkoutHtml, dishHtml, homeHtml, orderHtml]) {
    assert.match(
      html,
      new RegExp(`href="client-theme\\.css\\?v=${themeReleaseKey}"`),
    );
  }
  assert.match(kitchenHtml, new RegExp(`href="kitchen\\.css\\?v=${kitchenReleaseKey}"`));
  assert.match(kitchenHtml, new RegExp(`src="kitchen\\.js\\?v=${kitchenReleaseKey}"`));
  assert.match(courierHtml, new RegExp(`href="courier\\.css\\?v=${courierReleaseKey}"`));
  assert.match(courierHtml, new RegExp(`src="courier\\.js\\?v=${courierReleaseKey}"`));
  for (const source of [
    kitchenSource,
    courierSource,
    kitchenApiSource,
    courierApiSource,
    kitchenWorker,
    courierWorker,
  ]) {
    assert.doesNotMatch(source, /2026081404/);
  }
  assert.match(
    kitchenSource,
    new RegExp(`staff-live-sync\\.js\\?v=${kitchenReleaseKey}`),
  );
  assert.match(
    courierSource,
    new RegExp(`staff-live-sync\\.js\\?v=${courierReleaseKey}`),
  );
  assert.match(kitchenWorker, /pivnoy-doner-kitchen-shell-v10/);
  assert.match(kitchenWorker, /'kitchen\.html'/);
  assert.doesNotMatch(kitchenWorker, /kitchen\.html\?demo=1/);
  assert.match(courierWorker, /pivnoy-doner-courier-shell-v5/);

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
    `./home-menu.js?v=${catalogReleaseKey}`,
    `./order-state.js?v=${handoffReleaseKey}`,
    `./order-storage.js?v=${releaseKey}`,
    `./product-sheet.js?v=${catalogReleaseKey}`,
    `./review-service.js?v=${releaseKey}`,
    `./review-view.js?v=${releaseKey}`,
    `./client-api.js?v=${releaseKey}`,
  ]);
  assert.deepEqual(getVersionedImports(orderSource), [
    `./order-state.js?v=${handoffReleaseKey}`,
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
  assert.deepEqual(getVersionedImports(reviewViewSource), [
    `./review-state.js?v=${releaseKey}`,
  ]);

  const completeGraph = [
    checkoutSource,
    homeSource,
    orderSource,
    orderDemoSource,
    reviewServiceSource,
    reviewViewSource,
  ].join('\n');
  for (const moduleName of [
    'order-storage',
    'client-api',
    'review-service',
    'review-state',
    'review-view',
    'order-demo',
  ]) {
    const imports = [
      ...completeGraph.matchAll(
        new RegExp(
          `\\./${moduleName}\\.js(?:\\?v=([^'"\\s]+))?`,
          'g',
        ),
      ),
    ];
    assert.ok(imports.length > 0, moduleName);
    assert.equal(
      imports.every((match) => Boolean(match[1])),
      true,
      `${moduleName} has an unversioned import`,
    );
    assert.deepEqual(
      [...new Set(imports.map((match) => match[1]))],
      [releaseKey],
      moduleName,
    );
  }
});

test('service worker scripts bypass the immutable asset cache', async () => {
  const nginx = await read('deploy/nginx.conf');
  const workerLocation = nginx.match(
    /location\s+~\*\s+-sw\\\.js\$\s*\{([\s\S]*?)\}/,
  );
  assert.ok(workerLocation, 'service workers need a dedicated cache rule');
  assert.match(workerLocation[1], /expires\s+-1\s*;/);
  assert.match(
    workerLocation[1],
    /Cache-Control\s+"no-cache, no-store, must-revalidate"/,
  );
  assert.ok(
    nginx.indexOf(workerLocation[0]) < nginx.indexOf('location ~* \\.(?:css|js|'),
    'the service-worker rule must precede the generic immutable JS rule',
  );
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
