# Review Consent, Retention, and Stage Rollout Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:test-driven-development` per task, `superpowers:systematic-debugging` for any regression, and `superpowers:verification-before-completion` before claiming readiness.

**Goal:** Make review publication voluntary, enforce the approved retention periods, prepare YooKassa receipt data and owner procedures, then deploy the complete legal/security change only to `stage.pivdoner.ru`.

**Architecture:** Review consent is stored independently from order consent. A database maintenance repository performs count-only dry runs and transactional anonymization. Operational documents separate what code can do from actions the owner must complete. Stage rollout uses the existing isolated Docker Compose stack and leaves the main domain and legacy bot untouched.

**Tech Stack:** Static client, Express, PostgreSQL, Node scripts/tests, Docker Compose, Caddy.

**Depends on:** Both earlier `2026-08-11-*` legal implementation plans.

---

### Task 1: Store optional review-publication consent

**Files:**
- Create: `server/src/db/migrations/003_review_consent_retention.sql`
- Modify: `server/src/repositories/reviews.js`
- Modify: `server/src/services/reviews.js`
- Modify: `server/src/routes/orders.js`
- Modify: `server/tests/migrations.test.mjs`
- Modify: `server/tests/client-orders.test.mjs`

**Interfaces:**
- Review request: `{ rating, authorName, comment, publicationConsent, publicationConsentVersion }`.
- `published` is true only when consent is true and version is current.

- [ ] **Step 1: Write failing migration and API tests**

Assert migration fields:

```sql
publication_consent_at timestamptz
publication_consent_version text
publication_revoked_at timestamptz
```

API cases:

- `publicationConsent: false` creates a review with `published: false` and no consent timestamp/version;
- `publicationConsent: true` with current version creates `published: true` and server timestamp;
- true with stale/missing version -> `409 LEGAL_VERSION_OUTDATED`;
- public `/api/reviews` returns only `published: true` rows.

- [ ] **Step 2: Create migration**

```sql
alter table reviews alter column published set default false;
alter table reviews add column publication_consent_at timestamptz;
alter table reviews add column publication_consent_version text;
alter table reviews add column publication_revoked_at timestamptz;
alter table orders add column closed_at timestamptz;
```

- [ ] **Step 3: Implement repository behavior**

Use server `now()`. Never set `published = true` unless consent is true and version exactly equals `LEGAL_VERSIONS.reviewPublication`. Store the customer-entered name or “Покупатель”; do not copy phone/address into reviews.

- [ ] **Step 4: Add safe unpublish operation**

Add `reviews.unpublish(id, revokedAt)` that atomically sets `published = false`, `publication_revoked_at = $2`, and never deletes proof immediately.

- [ ] **Step 5: Verify and commit**

Run: `npm --prefix server test -- --test-name-pattern="review|migration"`

Expected: PASS.

```bash
git add server/src/db/migrations/003_review_consent_retention.sql server/src/repositories/reviews.js server/src/services/reviews.js server/src/routes/orders.js server/tests/migrations.test.mjs server/tests/client-orders.test.mjs
git commit -m "feat: record review publication consent"
```

---

### Task 2: Add the voluntary publication control to the completed-order UI

**Files:**
- Modify: `order.html`
- Modify: `order.js`
- Modify: `review-state.js`
- Modify: `review-service.js`
- Modify: `client-theme.css`
- Modify: `tests/client-api.test.mjs`
- Create: `tests/review-consent.test.mjs`

- [ ] **Step 1: Write failing state and request tests**

```js
test('review publication consent is optional and defaults to false', () => {
  const review = createReview({ orderId: 'o1', rating: 5, comment: 'Вкусно' });
  assert.equal(review.publicationConsent, false);
  assert.equal(review.published, false);
});

test('client sends current publication version only with checked consent', async () => {
  await api.submitReview('o1', 'token', {
    rating: 5,
    publicationConsent: true,
    publicationConsentVersion: '2026-08-11',
  });
  assert.equal(JSON.parse(calls[0].options.body).publicationConsent, true);
});
```

- [ ] **Step 2: Add unchecked review consent**

Insert below the comment:

```html
<label class="order-review__publication">
  <input type="checkbox" data-review-publication-consent />
  <span>Разрешаю опубликовать моё имя и текст отзыва на сайте. <a href="review-consent.html" target="_blank">Подробнее</a></span>
</label>
```

Update heading copy from “Оценка появится…” to “Вы решаете, публиковать ли отзыв на главной”. The checkbox must remain optional and unchecked.

- [ ] **Step 3: Send consent state and current version**

Always send `publicationConsent` boolean. Send the version from `LEGAL_VERSIONS.reviewPublication`; the server ignores it when consent is false. Update success text:

- checked: “Спасибо — отзыв опубликован на главной”;
- unchecked: “Спасибо — отзыв отправлен ресторану”.

- [ ] **Step 4: Verify and commit**

Run: `node --test tests/review-consent.test.mjs tests/client-api.test.mjs`

Expected: PASS.

```bash
git add order.html order.js review-state.js review-service.js client-theme.css tests/client-api.test.mjs tests/review-consent.test.mjs
git commit -m "feat: make review publication voluntary"
```

---

### Task 3: Mark final order time and implement retention dry runs

**Files:**
- Modify: `server/src/repositories/staff-orders.js`
- Create: `server/src/repositories/retention.js`
- Create: `server/src/services/retention.js`
- Create: `server/src/scripts/retention.js`
- Create: `server/tests/retention.test.mjs`
- Modify: `server/package.json`

**Interfaces:**
- `previewRetention(now) -> counts` does not mutate.
- `applyRetention(now) -> counts` runs in one transaction and logs counts only.
- CLI requires exactly one of `--dry-run` or `--apply`.

- [ ] **Step 1: Write failing retention tests**

Cover exact boundaries:

- delivery fields at 89 days remain; at 90 days are replaced by `{}` and comments by empty strings;
- customer name/phone at 3 years are replaced by empty strings;
- unpublished review at 1 year is deleted;
- public review remains while consent active;
- revoked public review proof remains 3 years, then is deleted;
- expired sessions are deleted;
- staff actor id/name older than 1 year become `null`/“Сотрудник” while status transitions remain;
- `provider_payload` is reduced to `{}` 30 days after a terminal payment state;
- preview returns counts and performs no `update/delete` query.

- [ ] **Step 2: Set `closed_at` on terminal transitions**

In `transitionStatus`, set:

```sql
closed_at = case when $2 in ('completed', 'cancelled') then now() else closed_at end
```

Do not change it on non-terminal updates.

- [ ] **Step 3: Implement parameterized retention SQL**

Use `now - interval '90 days'`, `3 years`, `1 year`, and `30 days`. Require `closed_at is not null`. Anonymization must be idempotent. Do not delete order financial totals or public numbers.

- [ ] **Step 4: Build a guarded CLI**

```json
"retention:dry-run": "node src/scripts/retention.js --dry-run",
"retention:apply": "node src/scripts/retention.js --apply"
```

Reject no flag, both flags, and production apply without `RETENTION_APPLY_CONFIRM=YES`. Output only mode and aggregate counts, never ids, phone, address, comments, names, tokens, or provider payload.

- [ ] **Step 5: Verify and commit**

Run: `npm --prefix server test -- --test-name-pattern="retention|terminal"`

Expected: PASS.

```bash
git add server/src/repositories/staff-orders.js server/src/repositories/retention.js server/src/services/retention.js server/src/scripts/retention.js server/tests/retention.test.mjs server/package.json
git commit -m "feat: enforce personal data retention"
```

---

### Task 4: Schedule safe daily retention in the isolated stack

**Files:**
- Modify: `deploy/docker-compose.production.yml`
- Modify: `deploy/.env.example`
- Modify: `tests/deployment.test.mjs`
- Create: `deploy/retention.md`

- [ ] **Step 1: Write a failing deployment test**

Assert a `retention` service uses the API image/build, internal DB network only, `restart: unless-stopped`, and `RETENTION_APPLY_CONFIRM=YES`. Assert no database port is published.

- [ ] **Step 2: Add a daily one-shot loop**

Give the existing `api` service `image: pivdoner-api:local`, then use that exact image for `retention` with the database dependency. Command:

```yaml
command: ["sh", "-c", "set -eu; while true; do node src/scripts/retention.js --apply; sleep 86400; done"]
```

The service has no Caddy network and no exposed port. `deploy/retention.md` documents dry-run before first activation, log inspection, and how to stop only the retention service.

- [ ] **Step 3: Verify and commit**

Run: `node --test tests/deployment.test.mjs`

Run: `docker compose -f deploy/docker-compose.production.yml config`

Expected: valid compose, PostgreSQL still private.

```bash
git add deploy/docker-compose.production.yml deploy/.env.example deploy/retention.md tests/deployment.test.mjs
git commit -m "ops: schedule safe data retention"
```

---

### Task 5: Prepare correct YooKassa receipt payloads without enabling live payment

**Files:**
- Modify: `server/src/payments/yookassa-provider.js`
- Modify: `server/src/services/payments.js`
- Modify: `server/tests/payments.test.mjs`
- Modify: `deploy/.env.example`

**Interfaces:**
- Provider receives order line items and customer phone.
- Receipt uses `vat_code: 1` (“Без НДС”), `payment_mode: 'full_payment'`, product `payment_subject: 'commodity'`, delivery `payment_subject: 'service'`.
- Live `PAYMENT_PROVIDER=yookassa` remains disabled until owner supplies credentials and confirms KKT.

- [ ] **Step 1: Write failing provider tests**

Assert the request contains:

```js
receipt: {
  customer: { phone: '+79256474577' },
  items: [
    {
      description: 'Наггетсы',
      quantity: '1.00',
      amount: { value: '200.00', currency: 'RUB' },
      vat_code: 1,
      payment_mode: 'full_payment',
      payment_subject: 'commodity',
    },
    {
      description: 'Доставка',
      quantity: '1.00',
      amount: { value: '200.00', currency: 'RUB' },
      vat_code: 1,
      payment_mode: 'full_payment',
      payment_subject: 'service',
    },
  ],
}
```

Ensure item totals plus delivery equal the payment amount. Reject mismatch before contacting YooKassa.

- [ ] **Step 2: Build receipt from server-priced order**

Use `orders.findById`, not browser prices. Normalize Russian phone to digits with leading `+7`. Truncate descriptions to YooKassa limits without removing the product identity. Do not store the authorization header or secret in `provider_payload`.

- [ ] **Step 3: Keep production disabled**

`deploy/.env.example` stays `PAYMENT_PROVIDER=mock`. Document that shop id/secret and KKT confirmation are external launch gates, not code defaults.

- [ ] **Step 4: Verify and commit**

Run: `npm --prefix server test -- --test-name-pattern="YooKassa|receipt|payment"`

Expected: PASS.

```bash
git add server/src/payments/yookassa-provider.js server/src/services/payments.js server/tests/payments.test.mjs deploy/.env.example
git commit -m "feat: prepare fiscal receipt payloads"
```

---

### Task 6: Create the owner compliance package

**Files:**
- Create: `docs/legal/owner-launch-checklist.md`
- Create: `docs/legal/personal-data-map.md`
- Create: `docs/legal/staff-data-rules.md`
- Create: `docs/legal/incident-response.md`
- Create: `docs/legal/data-request-runbook.md`
- Create: `docs/legal/yookassa-kkt-checklist.md`
- Create: `docs/legal/menu-approval-checklist.md`
- Create: `tests/legal-operations.test.mjs`

- [ ] **Step 1: Write a failing completeness test**

Assert all seven files exist and the launch checklist names these blocking gates:

- owner approval of policy/consents/offer;
- Roskomnadzor notification before production collection;
- Russian database location (`RU VDS`, Russia, Korolyov);
- no cross-border analytics at launch;
- staff access matrix and instruction;
- incident/data-subject request process;
- exact menu composition, weight and allergens approved by owner;
- YooKassa shop credentials and KKT/receipt confirmation;
- successful stage acceptance test.

- [ ] **Step 2: Write concise operational documents**

Use the known operator information from `shared/legal.js`. Clearly label code-complete items and owner actions. Do not claim that a Roskomnadzor notification was filed or that documents were legally approved. Do not invent menu weights, BJU, allergens or recipes; `menu-approval-checklist.md` lists every current product id/name and blank owner-signoff checkboxes only.

`data-request-runbook.md` must route requests to `Piv.don@ya.ru`, require identity/order verification, log receipt/deadline/action without copying request contents into general logs, and include review-unpublish and order-anonymization procedures.

- [ ] **Step 3: Verify and commit**

Run: `node --test tests/legal-operations.test.mjs`

Expected: PASS.

```bash
git add docs/legal tests/legal-operations.test.mjs
git commit -m "docs: add owner compliance runbooks"
```

---

### Task 7: Full verification and stage-only rollout

**Files:**
- Verify: all client/server/deploy files.
- Modify only when a reproduced regression requires a fix.

- [ ] **Step 1: Run complete automated suites**

Run:

```bash
npm test
npm --prefix server test
git diff --check
```

Expected: zero failures and no whitespace errors.

- [ ] **Step 2: Run security searches**

```bash
rg -n "console\.(log|error).*?(phone|address|token)|accessTokenHash|access_token_hash" server/src
rg -n "metrika|analytics|pixel|googletag|facebook" --glob "*.html" --glob "*.js"
```

Expected: no personal/token logging, no optional analytics.

- [ ] **Step 3: Verify database migration and retention on a disposable copy**

Create a database backup first. Restore it to a disposable PostgreSQL container, run migrations, run `retention:dry-run`, then apply against seeded expired/non-expired fixtures and verify only eligible rows changed. Never test first against the live stage volume.

- [ ] **Step 4: Browser QA locally**

At 390×844 and 1440×900 verify:

- five legal pages and back links;
- light/dark sauce rows;
- checkout consent starts unchecked and blocks submit;
- offer and policy links open without clearing form fields;
- production order stores id/token locally, token never appears in URL;
- status updates automatically through authenticated polling;
- review publication starts unchecked and changes success copy;
- homepage displays only consented published reviews;
- no footer/control overlap.

- [ ] **Step 5: Deploy only to stage**

On the server:

1. create a timestamped backup of `/opt/pivdoner` and PostgreSQL;
2. set a new random `ORDER_ACCESS_SECRET` in `/opt/pivdoner/deploy/.env` without printing it;
3. upload the verified commit to `/opt/pivdoner`;
4. run `docker compose -f deploy/docker-compose.production.yml build`;
5. run migrations through API startup;
6. start web/api/db while keeping retention stopped;
7. verify health and smoke tests on `https://stage.pivdoner.ru`;
8. run retention dry-run and review aggregate counts;
9. start the retention service only after counts are accepted.

- [ ] **Step 6: Stage acceptance checks**

Verify HTTP 200 and HTTPS for legal pages; create one pickup and one delivery test order; verify kitchen visibility, payment mock state, token-protected status/review endpoints, no personal fields in public response, and 50 concurrent order requests remain idempotent.

- [ ] **Step 7: Stop before production cutover**

Do not edit DNS/Caddy for `pivdoner.ru`, do not stop the legacy bot, and do not enable live YooKassa. Hand the owner `docs/legal/owner-launch-checklist.md`. Production cutover requires explicit confirmation that the documents are approved, Roskomnadzor notification is handled, menu data is approved, YooKassa/KKT is configured, and stage acceptance is signed off.
