import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const migrationUrl = new URL(
  '../src/db/migrations/001_initial.sql',
  import.meta.url,
);

test('начальная миграция содержит обязательные таблицы', async () => {
  const sql = await readFile(migrationUrl, 'utf8');

  for (const table of [
    'schema_migrations',
    'staff_accounts',
    'sessions',
    'catalog_products',
    'orders',
    'order_items',
    'status_history',
    'payments',
    'reviews',
    'restaurant_settings',
    'event_outbox',
  ]) {
    assert.match(sql, new RegExp(`create table(?: if not exists)? ${table}`, 'i'));
  }
});

test('заказы защищены ограничениями и ключом идемпотентности', async () => {
  const sql = await readFile(migrationUrl, 'utf8');

  assert.match(sql, /idempotency_key text not null unique/i);
  assert.match(sql, /quantity integer not null check \(quantity between 1 and 20\)/i);
  assert.match(sql, /payment_status text not null check/i);
  assert.match(sql, /version integer not null default 1/i);
});

test('order consent and access migration stores proof without raw token', async () => {
  const sql = await readFile(new URL('../src/db/migrations/002_order_consent_access.sql', import.meta.url), 'utf8');
  for (const column of [
    'personal_data_consent_at',
    'personal_data_consent_version',
    'offer_version',
    'access_token_hash',
  ]) assert.match(sql, new RegExp(column, 'i'));
  assert.doesNotMatch(sql, /access_token\s+text/i);
});

test('review consent and retention migration stores publication proof and order closure time', async () => {
  const sql = await readFile(
    new URL(
      '../src/db/migrations/003_review_consent_retention.sql',
      import.meta.url,
    ),
    'utf8',
  ).catch(() => '');

  assert.match(
    sql,
    /alter table reviews alter column published set default false/i,
  );
  for (const column of [
    'publication_consent_at timestamptz',
    'publication_consent_version text',
    'publication_revoked_at timestamptz',
  ]) {
    assert.match(sql, new RegExp(`add column ${column}`, 'i'));
  }
  assert.match(sql, /alter table orders add column closed_at timestamptz/i);
});

test('review retention migration backfills terminal closed_at without overwriting known closure time', async () => {
  const sql = await readFile(
    new URL(
      '../src/db/migrations/003_review_consent_retention.sql',
      import.meta.url,
    ),
    'utf8',
  );
  const backfill =
    sql.match(/update\s+orders[\s\S]*?;/i)?.[0] ?? '';

  assert.match(
    backfill,
    /set\s+closed_at\s*=\s*coalesce\(\s*updated_at\s*,\s*created_at\s*\)/i,
  );
  assert.match(backfill, /where\s+closed_at\s+is\s+null/i);
  assert.match(
    backfill,
    /status\s+in\s*\(\s*'completed'\s*,\s*'cancelled'\s*\)/i,
  );
  assert.ok(
    sql.indexOf('add column closed_at') < sql.indexOf(backfill),
    'closed_at must exist before the backfill runs',
  );
});

test('review retention migration unpublishes legacy reviews without consent proof', async () => {
  const sql = await readFile(
    new URL(
      '../src/db/migrations/003_review_consent_retention.sql',
      import.meta.url,
    ),
    'utf8',
  );
  const reconciliation =
    sql.match(/update\s+reviews[\s\S]*?;/i)?.[0] ?? '';

  assert.match(reconciliation, /set\s+published\s*=\s*false/i);
  assert.match(reconciliation, /where\s+published\s*=\s*true/i);
  assert.match(
    reconciliation,
    /publication_consent_at\s+is\s+null/i,
  );
  assert.doesNotMatch(
    reconciliation.match(/set[\s\S]*?where/i)?.[0] ?? '',
    /publication_(?:consent|revoked)_(?:at|version)\s*=/i,
  );
  assert.ok(
    sql.indexOf('add column publication_consent_at') <
      sql.indexOf(reconciliation),
    'publication consent columns must exist before reconciliation',
  );
});

test('kitchen operations migration stores meat and sauce availability separately', async () => {
  const sql = await readFile(
    new URL('../src/db/migrations/004_kitchen_operations.sql', import.meta.url),
    'utf8',
  ).catch(() => '');

  assert.match(sql, /create table(?: if not exists)? catalog_option_availability/i);
  assert.match(sql, /option_kind text not null/i);
  assert.match(sql, /option_id text not null/i);
  assert.match(sql, /available boolean not null default true/i);
  assert.match(sql, /primary key\s*\(\s*option_kind\s*,\s*option_id\s*\)/i);
});

test('kitchen operations migration stores one idempotent refund operation per order', async () => {
  const sql = await readFile(
    new URL('../src/db/migrations/004_kitchen_operations.sql', import.meta.url),
    'utf8',
  );

  assert.match(sql, /create table(?: if not exists)? refund_operations/i);
  assert.match(sql, /order_id uuid primary key references orders\(id\)/i);
  assert.match(sql, /payment_id uuid not null references payments\(id\)/i);
  assert.match(sql, /idempotency_key text not null unique/i);
  assert.match(sql, /status text not null check\s*\(status in \('pending', 'succeeded', 'failed'\)\)/i);
  assert.match(sql, /requested_by uuid references staff_accounts\(id\)/i);
});
