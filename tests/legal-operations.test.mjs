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

const BLOCKING_GATE_PATTERNS = [
  /владелец.*утвердил.*политик.*согласи.*оферт/i,
  /уведомлени.*Роскомнадзор.*до.*производственн.*сбор/i,
  /RU VDS.*Росси.*Корол[её]в/i,
  /трансграничн.*аналитик.*не подключ/i,
  /матриц.*доступ.*инструктаж.*сотрудник/i,
  /инцидент.*обращени.*субъект.*персональн/i,
  /точн.*состав.*масс.*аллерген.*владел/i,
  /ЮKassa.*реквизит.*магазин.*ККТ.*чек/i,
  /stage\.pivdoner\.ru.*при[её]мочн.*успеш/i,
];

const hasAllUncheckedLaunchGates = (checklist) => {
  const lines = checklist.split(/\r?\n/);
  return BLOCKING_GATE_PATTERNS.every((pattern) => {
    const matchingLines = lines.filter((line) => pattern.test(line));
    return (
      matchingLines.length === 1 &&
      /^- \[ \] /.test(matchingLines[0])
    );
  });
};

const escapeRegex = (value) =>
  value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

const MENU_INTRO_LINES = [
  '# Подтверждение обязательных сведений о меню',
  'Список сформирован из текущего `catalog-data.js`. Он намеренно не содержит неподтверждённых рецептур, массы или аллергенов. Владелец отмечает пункт только после сверки технологической документации и обновления сайта точными сведениями.',
];

const MENU_SIGNOFF_LINES = [
  '- [ ] Точный состав подтверждён владельцем',
  '- [ ] Масса или размер порции подтверждены владельцем',
  '- [ ] Аллергены подтверждены владельцем',
];

const hasOnlyBlankMenuSignoffs = (checklist) => {
  const allowedLines = new Set([
    ...MENU_INTRO_LINES,
    ...MENU_SIGNOFF_LINES,
    ...PRODUCTS.map((product) => `## ${product.id} — ${product.name}`),
  ]);
  const nonEmptyLines = checklist
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
  if (nonEmptyLines.some((line) => !allowedLines.has(line))) return false;
  if (nonEmptyLines.length !== MENU_INTRO_LINES.length + PRODUCTS.length * 4) {
    return false;
  }

  for (const product of PRODUCTS) {
    const heading = `## ${product.id} — ${product.name}`;
    if ((checklist.match(new RegExp(escapeRegex(heading), 'g')) ?? []).length !== 1) {
      return false;
    }
    const section = checklist.split(heading)[1]?.split(/\r?\n## /)[0] ?? '';
    const sectionLines = section
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter(Boolean);
    if (JSON.stringify(sectionLines) !== JSON.stringify(MENU_SIGNOFF_LINES)) {
      return false;
    }
  }
  return (checklist.match(/^## /gm) ?? []).length === PRODUCTS.length;
};

test('owner compliance package contains all seven operational documents', async () => {
  const documents = await Promise.all(LEGAL_DOCS.map(readLegalDoc));
  assert.equal(documents.length, 7);
  documents.forEach((document, index) => {
    assert.ok(document.trim(), `${LEGAL_DOCS[index]} must not be empty`);
  });
});

test('launch checklist keeps every production launch gate blocking and unsigned', async () => {
  const checklist = await readLegalDoc('owner-launch-checklist.md');
  assert.equal(hasAllUncheckedLaunchGates(checklist), true);
  assert.match(checklist, /код.*готов/is);
  assert.match(checklist, /действи.*владельц/is);
  assert.match(checklist, /не означает.*юридическ.*утвержден/is);
  assert.match(checklist, /не подано.*Роскомнадзор/is);
  assert.match(checklist, /ЮKassa.*не включ/is);
});

test('a checked stage gate cannot borrow an unchecked box from another line', async () => {
  const checklist = await readLegalDoc('owner-launch-checklist.md');
  const mutated = checklist.replace(
    '- [ ] На `https://stage.pivdoner.ru`',
    '- [x] На `https://stage.pivdoner.ru`',
  );

  assert.notEqual(mutated, checklist);
  assert.equal(hasAllUncheckedLaunchGates(mutated), false);
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
    /pivnoy-doner-reviews-v1/i,
    /демо.*localStorage.*orderId.*оценк.*имя.*комментар.*автоматическ.*очист/is,
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
  assert.equal(hasOnlyBlankMenuSignoffs(checklist), true);
});

test('menu checklist rejects invented weight and allergen facts', async () => {
  const checklist = await readLegalDoc('menu-approval-checklist.md');
  const heading = '## classic-shawarma — Классическая шаурма';

  for (const inventedFact of ['Вес: 420 г', 'Аллергены: молоко']) {
    const mutated = checklist.replace(heading, `${heading}\n\n${inventedFact}`);
    assert.equal(hasOnlyBlankMenuSignoffs(mutated), false, inventedFact);
  }
});
