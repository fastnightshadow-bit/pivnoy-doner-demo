# Legal Pages and Checkout Consent Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:test-driven-development` while implementing each task and `superpowers:verification-before-completion` before the final handoff.

**Goal:** Publish the approved legal information, make personal-data consent explicit in checkout, and preserve the approved light/dark UI without switching the production domain.

**Architecture:** Keep the client as static HTML/CSS/ES modules. Put document versions in one browser/server-compatible module under `shared/`. Legal pages remain readable without JavaScript. Checkout validates the separate unchecked consent locally and sends versioned proof fields to the API; server persistence is implemented in the next plan.

**Tech Stack:** Static HTML, CSS, ES modules, Node.js test runner.

**Approved source:** `docs/superpowers/specs/2026-08-11-legal-compliance-design.md`.

**Deployment boundary:** Do not edit `deploy/Caddyfile.pivdoner` and do not switch `pivdoner.ru`. This plan is committed locally and deployed only together with the next two plans to `stage.pivdoner.ru`.

---

### Task 1: Finalize the dark-theme sauce contrast regression

**Files:**
- Modify: `client-theme.css`
- Modify: `home.html`
- Modify: `cart.html`
- Modify: `checkout.html`
- Modify: `order.html`
- Test: `tests/baseline.test.mjs`

- [ ] **Step 1: Preserve the existing failing-then-passing regression test**

The test must assert that a sauce quantity row in dark theme uses theme variables rather than a white surface:

```js
test('dark product sauce rows use readable theme variables', () => {
  const css = readText('client-theme.css');
  assert.match(css, /html\[data-theme='dark'\]\s+\.product-sheet__sauce/);
  assert.match(css, /\.product-sheet__sauce[\s\S]*?color:\s*var\(--client-text\)/);
  assert.match(css, /\.product-sheet__sauce[\s\S]*?background:\s*var\(--control-surface\)/);
});
```

- [ ] **Step 2: Keep the verified CSS correction**

```css
html[data-theme='dark'] .product-sheet__sauce {
  color: var(--client-text);
  background: var(--control-surface);
  border-color: var(--control-border);
}
```

- [ ] **Step 3: Bust the immutable stylesheet cache**

Replace `client-theme.css?v=20260805` with `client-theme.css?v=20260811` in all four client HTML files listed above.

- [ ] **Step 4: Verify and commit**

Run: `node --test tests/baseline.test.mjs`

Expected: all baseline tests PASS.

```bash
git add client-theme.css home.html cart.html checkout.html order.html tests/baseline.test.mjs
git commit -m "fix: restore dark sauce contrast"
```

---

### Task 2: Add canonical legal versions and public-document tests

**Files:**
- Create: `shared/legal.js`
- Create: `tests/legal-pages.test.mjs`
- Verify: `server/Dockerfile`
- Verify: `server/Dockerfile.dockerignore`
- Test: `tests/deployment.test.mjs`

**Interfaces:**
- Produces: `LEGAL_VERSIONS.personalDataConsent`, `LEGAL_VERSIONS.offer`, `LEGAL_VERSIONS.reviewPublication`.
- Produces: `LEGAL_OPERATOR` with the approved seller details.

- [ ] **Step 1: Write failing tests for versions and public files**

```js
test('legal versions are explicit and shared with the server image', async () => {
  const { LEGAL_VERSIONS } = await import('../shared/legal.js');
  assert.deepEqual(LEGAL_VERSIONS, {
    personalDataConsent: '2026-08-11',
    offer: '2026-08-11',
    reviewPublication: '2026-08-11',
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
```

- [ ] **Step 2: Run tests and confirm failure**

Run: `node --test tests/legal-pages.test.mjs tests/deployment.test.mjs`

Expected: FAIL because the module and pages do not exist.

- [ ] **Step 3: Create the canonical module**

```js
export const LEGAL_VERSIONS = Object.freeze({
  personalDataConsent: '2026-08-11',
  offer: '2026-08-11',
  reviewPublication: '2026-08-11',
});

export const LEGAL_OPERATOR = Object.freeze({
  name: 'Индивидуальный предприниматель Цивилёв Павел Иннокентьевич',
  inn: '470310402026',
  ogrnip: '325508100421400',
  registrationAddress: 'Московская область, г. Реутов, Юбилейный проспект, д. 33, кв. 368',
  restaurantAddress: 'г. Москва, Волоколамское шоссе, д. 71/22, к. 2, помещение 2Н',
  phone: '+7 925 647-45-77',
  email: 'Piv.don@ya.ru',
  website: 'https://pivdoner.ru',
});
```

The existing server Docker image already copies `shared/`; keep a deployment test that prevents this from regressing.

- [ ] **Step 4: Run the focused test**

Run: `node --test tests/legal-pages.test.mjs tests/deployment.test.mjs`

Expected: version assertions pass; page assertions still fail until Task 3.

---

### Task 3: Build five static legal pages

**Files:**
- Create: `legal.css`
- Create: `privacy.html`
- Create: `consent.html`
- Create: `review-consent.html`
- Create: `offer.html`
- Create: `seller.html`
- Modify: `tests/legal-pages.test.mjs`

- [ ] **Step 1: Extend tests with required sections**

Assert the following page-specific content:

```js
const requirements = {
  'privacy.html': [/персональн/i, /localStorage/i, /90 дней/i, /3 лет/i, /Роскомнадзор/i],
  'consent.html': [/согласие/i, /телефон/i, /адрес/i, /отозвать/i],
  'review-consent.html': [/распространен/i, /имя/i, /текст отзыва/i, /отозвать/i],
  'offer.html': [/публичн.*оферт/i, /200\s*₽/, /2\s*000\s*₽/, /300\s*₽/, /11:30/, /22:30/, /возврат/i],
  'seller.html': [/325508100421400/, /Волоколамское шоссе/i, /Без НДС/i],
};
```

Also assert every page has `<meta name="viewport">`, a link back to `home.html`, and `legal.css?v=20260811`.

- [ ] **Step 2: Create accessible document markup**

Each page must use the same structure and be useful with JavaScript disabled:

```html
<body class="legal-page">
  <header class="legal-header">
    <a href="home.html" aria-label="Вернуться на главную">←</a>
    <img src="assets/mobile-home/logo-transparent.webp" alt="Пивной Донер" />
  </header>
  <main class="legal-document">
    <p class="legal-document__version">Редакция от 11 августа 2026 года</p>
    <h1>…</h1>
    <nav aria-label="Содержание">…</nav>
    <section id="…">…</section>
  </main>
</body>
```

Content must implement the approved specification exactly:

- `privacy.html`: operator, purposes and categories, legal grounds, recipients (YooKassa/KKT/hosting only as required), Russian database, localStorage and necessary staff cookie, security measures, retention, data-subject requests, no analytics/advertising cookies at launch.
- `consent.html`: phone, optional name, delivery fields, order data and comments; actions (collection, recording, storage, clarification, use, transfer to payment/fiscal/delivery processors, blocking, deletion); purposes, retention and withdrawal route.
- `review-consent.html`: optional name and review text, public website placement, voluntary unchecked consent, withdrawal by `Piv.don@ya.ru`.
- `offer.html`: seller identity, contract acceptance, ordering, payment through YooKassa, pickup/delivery conditions, 200 ₽ delivery, free from 2,000 ₽, delivery minimum 300 ₽, 11:30–22:30, cancellation/refund and contacts. State that actual preparation/delivery time is an estimate.
- `seller.html`: full identity, INN, OGRNIP, both addresses, phone, email, website, YooKassa, “Без НДС”, restaurant working/contact information.

- [ ] **Step 3: Style for phone and desktop**

Use `Inter`, warm white/light gray surfaces, `max-width: 840px`, 16 px mobile padding, 24–32 px desktop padding, 1.55–1.7 body line-height, visible focus rings, and no decorative animations. Respect dark theme through `prefers-color-scheme` only on these standalone documents.

- [ ] **Step 4: Verify**

Run: `node --test tests/legal-pages.test.mjs`

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add shared/legal.js legal.css privacy.html consent.html review-consent.html offer.html seller.html tests/legal-pages.test.mjs tests/deployment.test.mjs
git commit -m "feat: add public legal documents"
```

---

### Task 4: Add a common legal footer to client pages

**Files:**
- Modify: `home.html`
- Modify: `cart.html`
- Modify: `checkout.html`
- Modify: `order.html`
- Modify: `client-theme.css`
- Modify: `tests/legal-pages.test.mjs`

- [ ] **Step 1: Write a failing footer test**

```js
for (const page of ['home.html', 'cart.html', 'checkout.html', 'order.html']) {
  test(`${page} links all required legal documents`, async () => {
    const html = await read(page);
    for (const href of ['privacy.html', 'consent.html', 'offer.html', 'seller.html']) {
      assert.match(html, new RegExp(`href=["']${href}["']`));
    }
  });
}
```

- [ ] **Step 2: Run and confirm failure**

Run: `node --test tests/legal-pages.test.mjs`

Expected: FAIL for the four current client pages.

- [ ] **Step 3: Add compact footer markup**

Use the existing `.client-footer` on `home.html` and add the same `nav` to other client pages before the fixed mobile navigation/bar. Links:

```html
<nav class="client-footer__legal" aria-label="Правовая информация">
  <a href="seller.html">Продавец</a>
  <a href="offer.html">Оферта</a>
  <a href="privacy.html">Политика данных</a>
  <a href="consent.html">Согласие</a>
</nav>
```

Do not add a generic cookie popup: the approved launch build has no analytics, ad pixels, or optional third-party trackers.

- [ ] **Step 4: Style and verify**

The footer must not overlap the fixed checkout/order controls. Add bottom padding equal to the fixed bar plus safe-area inset.

Run: `node --test tests/legal-pages.test.mjs tests/baseline.test.mjs`

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add home.html cart.html checkout.html order.html client-theme.css tests/legal-pages.test.mjs
git commit -m "feat: expose legal links in client app"
```

---

### Task 5: Require separate personal-data consent in checkout

**Files:**
- Modify: `checkout.html`
- Modify: `checkout-state.js`
- Modify: `checkout.js`
- Modify: `client-theme.css`
- Modify: `tests/delivery-policy.test.mjs`
- Create: `tests/checkout-consent.test.mjs`

**Interfaces:**
- `validateCheckout(data)` returns `errors.personalDataConsent` when not checked.
- `createCheckoutOrderPayload(input)` sends consent and offer versions from `shared/legal.js`.

- [ ] **Step 1: Write failing validation and payload tests**

```js
test('checkout rejects an unchecked personal-data consent', () => {
  const errors = validateCheckout({
    fulfillment: 'pickup',
    phone: '+7 (999) 123-45-67',
    itemsTotal: 700,
    personalDataConsent: false,
  });
  assert.equal(errors.personalDataConsent, 'Подтвердите согласие на обработку данных');
});

test('order payload contains current legal versions', () => {
  const payload = createCheckoutOrderPayload({
    lines: [{ productId: 'nuggets', quantity: 1 }],
    phone: '+7 (999) 123-45-67',
    personalDataConsent: true,
  });
  assert.equal(payload.personalDataConsent, true);
  assert.equal(payload.personalDataConsentVersion, '2026-08-11');
  assert.equal(payload.offerVersion, '2026-08-11');
});
```

- [ ] **Step 2: Run and confirm failure**

Run: `node --test tests/checkout-consent.test.mjs tests/delivery-policy.test.mjs`

Expected: FAIL because consent is absent.

- [ ] **Step 3: Add the unchecked checkbox and separate offer copy**

Place immediately above `.checkout-bar`:

```html
<div class="checkout-legal" data-field="personalDataConsent">
  <label class="checkout-consent">
    <input type="checkbox" name="personalDataConsent" data-personal-data-consent />
    <span>Я даю <a href="consent.html" target="_blank">согласие на обработку персональных данных</a> для оформления и исполнения заказа и ознакомлен(а) с <a href="privacy.html" target="_blank">политикой</a>.</span>
  </label>
  <p class="field-error" role="alert" data-error-for="personalDataConsent"></p>
  <p class="checkout-offer-copy">Нажимая «Оплатить», вы принимаете условия <a href="offer.html" target="_blank">публичной оферты</a>.</p>
</div>
```

Do not pre-check the checkbox and do not merge it with offer acceptance.

- [ ] **Step 4: Wire validation without clearing the form**

Import `LEGAL_VERSIONS`. Add the checkbox to `getCheckoutData()`, `setFieldError`, and focus order. On submit, focus/scroll to it if unchecked. Include:

```js
personalDataConsent: personalDataConsentInput.checked,
personalDataConsentVersion: LEGAL_VERSIONS.personalDataConsent,
offerVersion: LEGAL_VERSIONS.offer,
```

Do not write consent state to localStorage and do not prefill it on a retry.

- [ ] **Step 5: Verify behavior and accessibility**

Run: `node --test tests/checkout-consent.test.mjs tests/delivery-policy.test.mjs tests/baseline.test.mjs`

Expected: PASS.

Manually verify at 390×844 and 1440×900 that links remain clickable, the fixed bar does not cover the checkbox, and the error is announced without losing name/phone/address.

- [ ] **Step 6: Commit**

```bash
git add checkout.html checkout-state.js checkout.js client-theme.css tests/checkout-consent.test.mjs tests/delivery-policy.test.mjs
git commit -m "feat: require checkout data consent"
```

---

### Task 6: Plan-level verification

- [ ] Run: `npm test`
- [ ] Run: `npm --prefix server test`
- [ ] Run: `git diff --check`
- [ ] Confirm `rg -n "20260805" home.html cart.html checkout.html order.html` returns no stale client-theme version.
- [ ] Confirm no analytics script, ad pixel, or cookie banner was added.
- [ ] Do not deploy yet; continue with `2026-08-11-order-consent-access-security.md`.
