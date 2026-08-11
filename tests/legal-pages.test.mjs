import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), 'utf8');

for (const page of ['home.html', 'cart.html', 'checkout.html', 'order.html']) {
  test(`${page} links all required legal documents`, async () => {
    const html = await read(page);
    for (const href of ['privacy.html', 'consent.html', 'offer.html', 'seller.html']) {
      assert.match(html, new RegExp(`href=["']${href}["']`));
    }
  });
}

test('legal footer keeps fixed-bar clearance until the desktop breakpoint', async () => {
  const css = await read('client-theme.css');
  const breakpoint = css.match(
    /@media \(min-width: (\d+)px\) \{\s*\.client-footer > \.client-footer__legal,\s*\.client-footer__legal \{\s*padding-bottom: 24px;\s*\}\s*\}/,
  );

  assert.equal(breakpoint?.[1], '1024');
});

test('legal versions and operator details are canonical and shared with the server image', async () => {
  const { LEGAL_OPERATOR, LEGAL_VERSIONS } = await import('../shared/legal.js');

  assert.deepEqual(LEGAL_VERSIONS, {
    personalDataConsent: '2026-08-11',
    offer: '2026-08-11',
    reviewPublication: '2026-08-11',
  });
  assert.deepEqual(LEGAL_OPERATOR, {
    name: 'Индивидуальный предприниматель Цивилёв Павел Иннокентьевич',
    inn: '470310402026',
    ogrnip: '325508100421400',
    registrationAddress: 'Московская область, г. Реутов, Юбилейный проспект, д. 33, кв. 368',
    restaurantAddress: 'г. Москва, Волоколамское шоссе, д. 71/22, к. 2, помещение 2Н',
    phone: '+7 925 647-45-77',
    email: 'Piv.don@ya.ru',
    website: 'https://pivdoner.ru',
  });

  const dockerfile = await read('server/Dockerfile');
  assert.match(dockerfile, /COPY\s+shared\s+\/app\/shared/);
});

const requirements = {
  'privacy.html': [/персональн/i, /localStorage/i, /90 дней/i, /3 лет/i, /Роскомнадзор/i],
  'consent.html': [/согласие/i, /телефон/i, /адрес/i, /отозвать/i],
  'review-consent.html': [/распространен/i, /имя/i, /текст отзыва/i, /отозвать/i],
  'offer.html': [/публичн.*оферт/i, /200\s*₽/, /2\s*000\s*₽/, /300\s*₽/, /11:30/, /22:30/, /возврат/i],
  'seller.html': [/325508100421400/, /Волоколамское шоссе/i, /Без НДС/i],
};

for (const [page, expectedContent] of Object.entries(requirements)) {
  test(`${page} contains operator identity and contact`, async () => {
    const html = await read(page);
    assert.match(html, /Цивил[её]в Павел Иннокентьевич/i);
    assert.match(html, /470310402026/);
    assert.match(html, /Piv\.don@ya\.ru/i);
  });

  test(`${page} is a responsive standalone document with navigation`, async () => {
    const html = await read(page);
    assert.match(html, /<meta\s+name=["']viewport["']/i);
    assert.match(html, /href=["']home\.html["']/i);
    assert.match(html, /href=["']legal\.css\?v=20260811["']/i);
  });

  test(`${page} contains its required public information`, async () => {
    const html = await read(page);

    for (const pattern of expectedContent) {
      assert.match(html, pattern);
    }
  });
}
