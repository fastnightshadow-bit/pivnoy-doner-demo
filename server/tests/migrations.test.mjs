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
