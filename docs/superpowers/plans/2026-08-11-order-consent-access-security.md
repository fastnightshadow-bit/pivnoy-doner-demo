# Order Consent and Access Security Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:test-driven-development` for every task and `superpowers:verification-before-completion` before handoff.

**Goal:** Persist versioned consent proof and prevent anyone from reading an order, retrying payment, subscribing to status, or posting a review with only an order UUID.

**Architecture:** The client receives an opaque order access token on creation and stores it locally with the order id. The API stores only a SHA-256 hash. A stable HMAC-derived token is used so an idempotent retry returns the same secret without storing the raw token. Public order responses go through a strict serializer; staff repositories remain authenticated and unchanged. Public automatic updates use authenticated polling because native `EventSource` cannot send an Authorization header without leaking the token in a URL.

**Tech Stack:** Node.js crypto, Express, PostgreSQL migration, ES modules, Node test runner.

**Depends on:** `2026-08-11-legal-pages-checkout-consent.md`.

---

### Task 1: Add consent and access fields to PostgreSQL

**Files:**
- Create: `server/src/db/migrations/002_order_consent_access.sql`
- Modify: `server/tests/migrations.test.mjs`

- [ ] **Step 1: Write a failing migration test**

```js
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
```

- [ ] **Step 2: Run and confirm failure**

Run: `npm --prefix server test -- --test-name-pattern="consent and access migration"`

Expected: FAIL with `ENOENT`.

- [ ] **Step 3: Create an online-safe migration**

```sql
alter table orders add column personal_data_consent_at timestamptz;
alter table orders add column personal_data_consent_version text;
alter table orders add column offer_version text;
alter table orders add column access_token_hash char(64);

create index orders_access_token_hash_idx
  on orders (access_token_hash)
  where access_token_hash is not null;
```

Do not add a raw-token column. Existing stage orders remain readable only to staff after the access check is enabled; no backfill token is fabricated.

- [ ] **Step 4: Verify and commit**

Run: `npm --prefix server test -- --test-name-pattern="migration"`

Expected: PASS.

```bash
git add server/src/db/migrations/002_order_consent_access.sql server/tests/migrations.test.mjs
git commit -m "feat: store order consent proof"
```

---

### Task 2: Create version and token domain services

**Files:**
- Create: `server/src/domain/order-access.js`
- Modify: `server/src/config.js`
- Modify: `deploy/.env.example`
- Modify: `server/tests/orders.test.mjs`
- Modify: `tests/deployment.test.mjs`

**Interfaces:**
- `deriveOrderAccessToken({ orderId, idempotencyKey, secret }) -> string`
- `hashOrderAccessToken(token) -> 64-character hex`
- `verifyOrderAccessToken(token, expectedHash) -> boolean`
- Config: `ORDER_ACCESS_SECRET`, minimum 32 characters in production.

- [ ] **Step 1: Write failing deterministic/security tests**

```js
test('order access token is opaque, stable for retries and stored as a hash', () => {
  const input = { orderId: '0d7d410c-a81f-4d32-b719-547b72598a6d', idempotencyKey: 'checkout-123', secret: 'x'.repeat(32) };
  const first = deriveOrderAccessToken(input);
  const second = deriveOrderAccessToken(input);
  assert.equal(first, second);
  assert.match(first, /^[A-Za-z0-9_-]{43}$/);
  assert.equal(hashOrderAccessToken(first).length, 64);
  assert.equal(verifyOrderAccessToken(first, hashOrderAccessToken(first)), true);
  assert.equal(verifyOrderAccessToken('wrong', hashOrderAccessToken(first)), false);
});
```

- [ ] **Step 2: Implement with HMAC-SHA256 and timing-safe comparison**

```js
export const deriveOrderAccessToken = ({ orderId, idempotencyKey, secret }) =>
  createHmac('sha256', secret)
    .update(`${orderId}\0${idempotencyKey}`)
    .digest('base64url');
```

Hash the opaque token with SHA-256 for storage. Compare fixed-length hash buffers with `timingSafeEqual`. Never log the token.

- [ ] **Step 3: Validate configuration**

Add `ORDER_ACCESS_SECRET` to `server/src/config.js` and `deploy/.env.example`. In production, startup must fail if it is absent or shorter than 32 characters. It must differ from `SESSION_SECRET` in the real `.env`.

- [ ] **Step 4: Verify and commit**

Run: `npm --prefix server test -- --test-name-pattern="access token"`

Run: `node --test tests/deployment.test.mjs`

Expected: PASS and no real secret in Git.

```bash
git add server/src/domain/order-access.js server/src/config.js deploy/.env.example server/tests/orders.test.mjs tests/deployment.test.mjs
git commit -m "feat: add opaque order access tokens"
```

---

### Task 3: Validate and persist current consent versions

**Files:**
- Modify: `server/src/routes/orders.js`
- Modify: `server/src/services/orders.js`
- Modify: `server/src/repositories/orders.js`
- Modify: `server/src/http.js`
- Modify: `server/tests/orders.test.mjs`
- Modify: `server/tests/client-orders.test.mjs`

**Interfaces:**
- POST `/api/orders` requires `personalDataConsent === true`.
- Versions must equal `LEGAL_VERSIONS` from `/app/shared/legal.js`.
- Creation response returns `accessToken`; database row never does.

- [ ] **Step 1: Write failing API tests**

Cover all cases:

```js
test('order without consent is rejected', async () => {
  const response = await createOrder({ personalDataConsent: false });
  assert.equal(response.status, 400);
  assert.equal(response.body.error, 'PERSONAL_DATA_CONSENT_REQUIRED');
});

test('stale legal versions are rejected', async () => {
  const response = await createOrder({
    personalDataConsent: true,
    personalDataConsentVersion: '2026-01-01',
    offerVersion: '2026-01-01',
  });
  assert.equal(response.status, 409);
  assert.equal(response.body.error, 'LEGAL_VERSION_OUTDATED');
});
```

Also assert successful persistence uses the injected server `now()` value, and repeated `Idempotency-Key` returns the same order id and same `accessToken` without creating a second row.

- [ ] **Step 2: Extend schema and service**

`orderSchema` must require:

```js
personalDataConsent: z.literal(true),
personalDataConsentVersion: z.string().min(1).max(40),
offerVersion: z.string().min(1).max(40),
```

Compare versions before pricing. In `createOrderService`, derive the token from order id/idempotency key, store only its hash, and persist:

```js
personalDataConsentAt: createdAt,
personalDataConsentVersion: input.personalDataConsentVersion,
offerVersion: input.offerVersion,
accessTokenHash: hashOrderAccessToken(accessToken),
```

Return `{ order, created, accessToken }` from the service. For an idempotent hit, re-derive the same token from the existing order id and the same idempotency key.

- [ ] **Step 3: Extend repository SQL and mapping**

Insert the four migration fields. `mapOrder` may expose consent metadata only to internal service/repository consumers; the public serializer in Task 4 must omit them.

- [ ] **Step 4: Verify and commit**

Run: `npm --prefix server test -- --test-name-pattern="consent|legal versions|Idempotency"`

Expected: PASS.

```bash
git add server/src/routes/orders.js server/src/services/orders.js server/src/repositories/orders.js server/src/http.js server/tests/orders.test.mjs server/tests/client-orders.test.mjs
git commit -m "feat: validate versioned checkout consent"
```

---

### Task 4: Protect public order reads and redact personal data

**Files:**
- Create: `server/src/domain/public-order.js`
- Modify: `server/src/routes/orders.js`
- Modify: `server/src/routes/payments.js`
- Modify: `server/src/services/payments.js`
- Modify: `server/src/routes/events.js`
- Modify: `server/src/app.js`
- Modify: `server/tests/client-orders.test.mjs`
- Modify: `server/tests/payments.test.mjs`
- Modify: `server/tests/realtime.test.mjs`

**Interfaces:**
- Public auth: `Authorization: Bearer <order-access-token>`.
- `toPublicClientOrder(order)` returns status/number/totals/items/ETA/fulfillment/payment state only.
- It omits phone, customer name, exact address, intercom, comments, consent fields, token hash and staff history.

- [ ] **Step 1: Write failing authorization/redaction tests**

Test `GET /api/orders/:id`:

- no Authorization -> `401 ORDER_ACCESS_REQUIRED`;
- wrong token -> `403 ORDER_ACCESS_DENIED`;
- correct token -> 200;
- JSON has no `phone`, `customerName`, `address`, `courierComment`, `personalDataConsentAt`, `accessTokenHash`, or `history`.

Test `POST /api/payments` with the same three access cases so a UUID alone cannot initiate another payment. Also assert that the order-creation response is produced by the strict serializer plus `accessToken` and therefore does not expose consent timestamps or `accessTokenHash`.

- [ ] **Step 2: Add access verification to the order service**

Add `getPublic(id, token)` and `verifyAccess(id, token)` methods. Fetch the order, distinguish missing order from bad credentials without logging token values, and use `toPublicClientOrder` only after successful verification.

- [ ] **Step 3: Add strict serializer**

```js
export const toPublicClientOrder = (order) => ({
  id: order.id,
  number: order.number,
  status: order.status,
  paymentStatus: order.paymentStatus,
  fulfillment: order.fulfillment,
  itemsTotal: order.itemsTotal,
  deliveryTotal: order.deliveryTotal,
  discountTotal: order.discountTotal,
  total: order.total,
  eta: order.eta,
  createdAt: order.createdAt,
  items: order.items,
});
```

Do not use object spread in this serializer.

- [ ] **Step 4: Protect payment retry**

Read the Bearer token in `routes/payments.js` and call `paymentService.create(orderId, idempotencyKey, accessToken)`. The payment service must verify access before looking up/creating a payment.

The internal payment creation performed immediately after `POST /api/orders` passes `result.accessToken` directly to the payment service; it never places that token in the payment body, provider metadata, or return URL.

- [ ] **Step 5: Close the unauthenticated public SSE endpoint**

Keep `GET /api/events?scope=staff` for authenticated staff only. Requests without `scope=staff` return `404 NOT_FOUND`; clients use the authenticated polling in Task 5. Add a regression test proving an order UUID alone cannot open an event stream.

- [ ] **Step 6: Verify and commit**

Run: `npm --prefix server test -- --test-name-pattern="public order|access|payment retry"`

Expected: PASS.

```bash
git add server/src/domain/public-order.js server/src/routes/orders.js server/src/routes/payments.js server/src/services/payments.js server/src/routes/events.js server/src/app.js server/tests/client-orders.test.mjs server/tests/payments.test.mjs server/tests/realtime.test.mjs
git commit -m "fix: protect public order access"
```

---

### Task 5: Store client credentials and use authenticated polling

**Files:**
- Modify: `order-storage.js`
- Modify: `client-api.js`
- Modify: `checkout.js`
- Modify: `order.js`
- Modify: `tests/client-api.test.mjs`
- Create: `tests/order-access-storage.test.mjs`

**Interfaces:**
- Storage key: `pivnoy-doner-active-order-access-v1` containing `{ id, token }`.
- `clientApi.getOrder(id, token)` and `createPayment(orderId, key, token)` send Bearer auth.
- `subscribeToOrder(id, token, handlers)` polls an authenticated GET every 3 seconds and refreshes immediately when the document becomes visible.

- [ ] **Step 1: Write failing client tests**

```js
test('client order request sends the private access token in a header', async () => {
  await api.getOrder('order/1', 'secret-token');
  assert.equal(calls[0].options.headers.Authorization, 'Bearer secret-token');
  assert.doesNotMatch(calls[0].url, /secret-token/);
});

test('active order credentials survive reload without entering the URL', () => {
  saveActiveOrderAccess(storage, { id: 'order-1', token: 'secret-token' });
  assert.deepEqual(loadActiveOrderAccess(storage), { id: 'order-1', token: 'secret-token' });
});
```

- [ ] **Step 2: Implement one credentials record**

Never place the token in a URL, history state, DOM dataset, analytics, or console. Keep legacy `loadActiveOrderId` reading only for demo mode; production reads `{ id, token }`.

- [ ] **Step 3: Save token before payment redirect**

After `createOrder`, require both `order.id` and `order.accessToken`, persist them, then follow `payment.confirmationUrl`. If storage fails, show a blocking error and do not redirect because the customer would lose access to the order.

- [ ] **Step 4: Replace public SSE with authenticated polling**

Keep staff SSE unchanged. Implement polling with `setTimeout` after each completed request to avoid overlapping calls. Stop on unsubscribe, pause while hidden, immediately refresh on `visibilitychange`, and send errors to `handlers.onError` without clearing the last visible order.

- [ ] **Step 5: Verify and commit**

Run: `node --test tests/client-api.test.mjs tests/order-access-storage.test.mjs`

Expected: PASS and no token in any asserted URL.

```bash
git add order-storage.js client-api.js checkout.js order.js tests/client-api.test.mjs tests/order-access-storage.test.mjs
git commit -m "feat: secure client order credentials"
```

---

### Task 6: Protect review endpoints with the same order token

**Files:**
- Modify: `server/src/routes/orders.js`
- Modify: `server/src/services/reviews.js`
- Modify: `client-api.js`
- Modify: `review-service.js`
- Modify: `server/tests/client-orders.test.mjs`
- Modify: `tests/client-api.test.mjs`

- [ ] **Step 1: Write failing tests**

For `GET/POST /api/orders/:id/review`, assert no token -> 401, wrong token -> 403, correct token -> existing behavior. Client tests assert the token is in Authorization and absent from URL/body.

- [ ] **Step 2: Verify order access before review lookup/submission**

Inject `orderService` into the review route and call `verifyAccess` before the reviews repository. Keep the completed-order rule in place.

- [ ] **Step 3: Pass stored credentials from order UI**

`review-service.submit` and `findByOrderId` receive the access token from `order.js`. Do not infer it from the DOM.

- [ ] **Step 4: Verify and commit**

Run: `npm --prefix server test -- --test-name-pattern="review|access"`

Run: `node --test tests/client-api.test.mjs`

Expected: PASS.

```bash
git add server/src/routes/orders.js server/src/services/reviews.js client-api.js review-service.js server/tests/client-orders.test.mjs tests/client-api.test.mjs
git commit -m "fix: authorize order reviews"
```

---

### Task 7: Plan-level verification

- [ ] Run: `npm test`
- [ ] Run: `npm --prefix server test`
- [ ] Run: `git diff --check`
- [ ] Search: `rg -n "accessToken|access_token" server/src deploy` and confirm no raw token logging/storage.
- [ ] Verify a real stage database migration on a disposable PostgreSQL container before applying it to the stage volume.
- [ ] Do not deploy yet; continue with `2026-08-11-review-retention-stage-rollout.md`.
