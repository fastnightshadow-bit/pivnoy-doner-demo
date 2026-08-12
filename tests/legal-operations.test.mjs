import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { LEGAL_OPERATOR } from '../shared/legal.js';
import { PRODUCTS } from '../catalog-data.js';

const LEGAL_DOCS = [
  'owner-launch-checklist.md',
  'personal-data-map.md',
  'staff-data-rules.md',
  'incident-response.md',
  'data-request-runbook.md',
  'yookassa-kkt-checklist.md',
  'menu-approval-checklist.md',
];

const readLegalDoc = (name) =>
  readFile(new URL(`../docs/legal/${name}`, import.meta.url), 'utf8');

test('owner compliance package contains all seven operational documents', async () => {
  const documents = await Promise.all(LEGAL_DOCS.map(readLegalDoc));
  assert.equal(documents.length, 7);
  documents.forEach((document, index) => {
    assert.ok(document.trim(), `${LEGAL_DOCS[index]} must not be empty`);
  });
});

test('launch checklist keeps every production launch gate blocking and unsigned', async () => {
  const checklist = await readLegalDoc('owner-launch-checklist.md');
  const blockingGates = [
    /\[ \].*владелец.*утвердил.*политик.*согласи.*оферт/is,
    /\[ \].*уведомлени.*Роскомнадзор.*до.*производственн.*сбор/is,
    /\[ \].*RU VDS.*Росси.*Корол[её]в/is,
    /\[ \].*трансграничн.*аналитик.*не подключ/is,
    /\[ \].*матриц.*доступ.*инструктаж.*сотрудник/is,
    /\[ \].*инцидент.*обращени.*субъект.*персональн/is,
    /\[ \].*точн.*состав.*масс.*аллерген.*владел/is,
    /\[ \].*ЮKassa.*реквизит.*магазин.*ККТ.*чек/is,
    /\[ \].*stage\.pivdoner\.ru.*при[её]мочн.*успеш/is,
  ];

  for (const gate of blockingGates) assert.match(checklist, gate);
  assert.match(checklist, /код.*готов/is);
  assert.match(checklist, /действи.*владельц/is);
  assert.match(checklist, /не означает.*юридическ.*утвержден/is);
  assert.match(checklist, /не подано.*Роскомнадзор/is);
  assert.match(checklist, /ЮKassa.*не включ/is);
});

test('operational package uses the canonical operator identity', async () => {
  const [launch, dataMap, requests] = await Promise.all([
    readLegalDoc('owner-launch-checklist.md'),
    readLegalDoc('personal-data-map.md'),
    readLegalDoc('data-request-runbook.md'),
  ]);
  const combined = `${launch}\n${dataMap}\n${requests}`;

  for (const value of Object.values(LEGAL_OPERATOR)) {
    assert.match(combined, new RegExp(value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i'));
  }
});

test('data map covers actual stores, access paths and automated retention', async () => {
  const dataMap = await readLegalDoc('personal-data-map.md');

  for (const pattern of [
    /PostgreSQL/i,
    /localStorage/i,
    /sessionStorage/i,
    /pivdoner_session/i,
    /х[эе]ш.*SHA-256/is,
    /owner.*kitchen.*courier/is,
    /90 дней/i,
    /3 лет/i,
    /1 год/i,
    /30 дней/i,
    /публичн.*отзыв.*до.*отзыв.*согласи/is,
  ]) {
    assert.match(dataMap, pattern);
  }
});

test('staff rules minimize role use and forbid unsafe handling', async () => {
  const rules = await readLegalDoc('staff-data-rules.md');

  for (const pattern of [
    /владелец.*полный доступ/is,
    /кухн.*продавец.*операцион/is,
    /курьер.*адрес.*телефон.*ETA/is,
    /не изменя.*цен/is,
    /PIN.*не передав/is,
    /не дел.*скриншот/is,
    /не пересыл/is,
  ]) {
    assert.match(rules, pattern);
  }
});

test('data request runbook verifies, minimizes logs and gives both removal procedures', async () => {
  const runbook = await readLegalDoc('data-request-runbook.md');

  for (const pattern of [
    /Piv\.don@ya\.ru/,
    /провер.*личност.*номер.*заказ/is,
    /зарегистрир.*дат.*получени.*срок.*действ/is,
    /не копир.*содержани.*обращени.*общ.*лог/is,
    /снять.*отзыв.*публикац/is,
    /published\s*=\s*false/i,
    /обезлич.*заказ/is,
    /--dry-run/i,
    /--apply/i,
  ]) {
    assert.match(runbook, pattern);
  }
});

test('YooKassa checklist leaves live payment blocked on owner and KKT actions', async () => {
  const checklist = await readLegalDoc('yookassa-kkt-checklist.md');

  for (const pattern of [
    /PAYMENT_PROVIDER=mock/,
    /\[ \].*YOOKASSA_SHOP_ID/is,
    /\[ \].*YOOKASSA_SECRET_KEY/is,
    /\[ \].*ККТ/is,
    /\[ \].*электронн.*чек/is,
    /Без НДС/i,
    /vat_code:\s*1/i,
    /live.*заблокирован/is,
  ]) {
    assert.match(checklist, pattern);
  }
});

test('menu checklist mirrors every current product and leaves owner facts blank', async () => {
  const checklist = await readLegalDoc('menu-approval-checklist.md');

  for (const product of PRODUCTS) {
    const heading = `## ${product.id} — ${product.name}`;
    assert.match(checklist, new RegExp(heading.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
    const section = checklist.split(heading)[1]?.split('\n## ')[0] ?? '';
    assert.match(section, /\[ \] Точный состав подтвержд[её]н владельцем/i);
    assert.match(section, /\[ \] Масса или размер порции подтвержден[аы] владельцем/i);
    assert.match(section, /\[ \] Аллергены подтверждены владельцем/i);
    assert.doesNotMatch(section, /\[x\]/i);
  }

  assert.equal((checklist.match(/^## /gm) ?? []).length, PRODUCTS.length);
  assert.doesNotMatch(checklist, /\bБЖУ\b/i);
});
