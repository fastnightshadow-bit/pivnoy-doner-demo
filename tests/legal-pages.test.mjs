import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), 'utf8');

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

for (const page of ['privacy.html', 'consent.html', 'review-consent.html', 'offer.html', 'seller.html']) {
  test(`${page} contains operator identity and contact`, async () => {
    const html = await read(page);
    assert.match(html, /Цивил[её]в Павел Иннокентьевич/i);
    assert.match(html, /470310402026/);
    assert.match(html, /Piv\.don@ya\.ru/i);
  });
}
