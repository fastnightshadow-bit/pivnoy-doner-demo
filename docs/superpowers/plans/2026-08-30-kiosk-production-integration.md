# Kiosk Production Integration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Перенести последнюю планшетную версию киоска `404b556` на свежий `main`, подключить каноническое меню, стоп-лист, QR-оплату ЮKassa и общую кухню.

**Architecture:** Последний UI киоска переносится без старого backend-кода и затем адаптируется к текущим общим модулям меню. Сервер получает отдельный аутентифицированный kiosk API, но повторно использует существующие ценообразование, заказы, платежи, event outbox и кухонную очередь. Карта остаётся строго локальной демонстрацией, QR создаёт одностадийный СБП-платёж.

**Tech Stack:** Vanilla ES modules, HTML/CSS, Node.js 22, Express 5, PostgreSQL 16, ЮKassa API, Node test runner, Supertest, Docker Compose, Nginx, Caddy.

**Spec:** `docs/superpowers/specs/2026-08-30-kiosk-production-integration-design.md`

## Global Constraints

- Базовая ветка: свежий `origin/main`; старую `codex/kiosk-tablet` целиком не сливать.
- Визуальная основа и оптимизация изображений: commit `404b556`.
- Целевой экран: 768×1024 portrait; поддержать 600×960, 800×1280, 1024×1366 и landscape.
- Источник каталога: только `catalog-data.js`, `product-config.js`, `option-quantities.js`.
- На кухню попадают только заказы с `payment_status = paid`.
- Карта не вызывает kiosk API и не создаёт заказ.
- QR использует `payment_method_data.type = sbp`, `capture = true`.
- Рабочий DNS и production не переключать без отдельного подтверждения.

---

### Task 1: Import and protect the latest responsive kiosk UI

**Files:**
- Create: `kiosk-*.js`, `kiosk-*.css`, `kiosk.html`, `kiosk.webmanifest`, `assets/kiosk/kiosk-start-hero-red.png`
- Test: `tests/kiosk-*.test.mjs`

**Interfaces:**
- Consumes: Git commit `404b556` and current canonical catalog modules.
- Produces: runnable kiosk shell with `createKioskImageCache()` and responsive CSS.

- [ ] **Step 1: Apply commits `e49cbed` through `404b556` and keep current `product-config.js`/`product-sheet.js` on conflicts.**
- [ ] **Step 2: Run `node --test tests/kiosk-*.test.mjs` and record any failures caused by the fresh main API.**
- [ ] **Step 3: Add a regression assertion that the kiosk imports the canonical catalog and retains `createKioskImageCache`.**

```js
assert.match(appSource, /from '\.\/catalog-data\.js'/);
assert.match(appSource, /createKioskImageCache/);
```

- [ ] **Step 4: Run the kiosk tests and commit `feat: import latest responsive kiosk ui`.**

### Task 2: Canonical menu configuration and live cart reconciliation

**Files:**
- Modify: `kiosk-app.js`, `kiosk-presentation.js`, `kiosk-cart-presentation.js`, `kiosk-state.js`
- Create: `kiosk-availability.js`
- Test: `tests/kiosk-menu-contract.test.mjs`, `tests/kiosk-live-update-regression.test.mjs`

**Interfaces:**
- Produces: `reconcileKioskCart(lines, settings) -> { lines, removedLineIds }`.
- Consumes: canonical quantity maps `addons` and `sauces`.

- [ ] **Step 1: Write failing tests for 8 categories, 28 products, no optional sauces on shawarma/doner, all sauces on snacks, and 10 separate quick-add sauces.**

```js
assert.equal(CATEGORIES.length, 8);
assert.equal(PRODUCTS.length, 28);
assert.deepEqual(getProductConfiguration('classic-shawarma').sauces, []);
assert.equal(getProductConfiguration('fries').sauces.length, 10);
assert.equal(PRODUCTS.filter(({ category }) => category === 'sauces').length, 10);
```

- [ ] **Step 2: Replace singular `sauce` and addon arrays with quantity objects throughout kiosk state and rendering.**
- [ ] **Step 3: Implement `reconcileKioskCart` so stopped products/options are removed and the total is recalculated.**
- [ ] **Step 4: Subscribe to settings changes, reconcile the open product and cart, and show a visible removal message.**
- [ ] **Step 5: Run kiosk/product tests and commit `fix: align kiosk with canonical menu`.**

### Task 3: Secure kiosk device activation

**Files:**
- Create: `server/src/db/migrations/006_kiosk.sql`
- Create: `server/src/repositories/kiosk-devices.js`
- Create: `server/src/auth/kiosk-session.js`
- Create: `server/src/auth/kiosk-middleware.js`
- Create: `server/src/routes/kiosk-auth.js`
- Modify: `server/src/app.js`, `server/src/http.js`, `server/src/routes/owner.js`
- Modify: `owner-api.js`, `owner.js`, `owner.html`, `owner.css`
- Test: `server/tests/kiosk-auth.test.mjs`, `server/tests/migrations.test.mjs`, `tests/owner-api.test.mjs`

**Interfaces:**
- Produces: `createActivation(account)`, `activate(code, displayName)`, `authenticate(token)` and cookie `pivdoner_kiosk`.

- [ ] **Step 1: Write failing tests for one-time 10-minute codes, single use, expiry, disabled devices and secure cookie flags.**
- [ ] **Step 2: Add `kiosk_devices`, `kiosk_activation_codes`, `orders.source`, `orders.service_mode`, and `orders.kiosk_device_id`.**
- [ ] **Step 3: Implement SHA-256 token storage, cryptographic activation codes, attempt rate limiting and owner-only code generation.**
- [ ] **Step 4: Add the owner button “Подключить киоск” and display the expiring code.**
- [ ] **Step 5: Run auth/migration/owner tests and commit `feat: add secure kiosk activation`.**

### Task 4: Kiosk order API with server pricing and stop-list validation

**Files:**
- Create: `server/src/routes/kiosk-orders.js`
- Create: `server/src/services/kiosk-orders.js`
- Create: `server/src/domain/catalog-availability.js`
- Modify: `server/src/services/orders.js`, `server/src/repositories/orders.js`, `server/src/app.js`, `server/src/http.js`
- Test: `server/tests/kiosk-orders.test.mjs`, `server/tests/orders.test.mjs`

**Interfaces:**
- Produces: `createKioskOrder(input, idempotencyKey, device)` returning `{ order, payment }`.
- Consumes: `priceOrder`, shared catalog, `settings.get()`.

- [ ] **Step 1: Write failing tests for device auth, `dine_in|takeaway`, server price, stopped products/options and duplicate idempotency keys.**
- [ ] **Step 2: Extract shared `assertCatalogAvailability(items, catalog)` and use it in public and kiosk services.**
- [ ] **Step 3: Persist kiosk orders as `fulfillment=pickup`, `source=kiosk`, `service_mode`, `payment_status=pending`, without fake customer data.**
- [ ] **Step 4: Return exact unavailable IDs with HTTP 409 and never create payment on validation failure.**
- [ ] **Step 5: Run order tests and commit `feat: add validated kiosk order api`.**

### Task 5: Real YooKassa SBP QR and verified payment status

**Files:**
- Modify: `server/src/payments/yookassa-provider.js`, `server/src/services/payments.js`, `server/src/repositories/payments.js`
- Create: `server/src/kiosk/qr.js`
- Modify: `server/package.json`, `server/pnpm-lock.yaml`, `server/src/routes/kiosk-orders.js`
- Test: `server/tests/kiosk-payments.test.mjs`, `server/tests/payments.test.mjs`

**Interfaces:**
- Produces: `{ orderId, number, paymentStatus, qrSvg, expiresAt }`.
- Consumes: YooKassa `confirmation_url`; `qrSvg` is generated server-side with no third-party browser request.

- [ ] **Step 1: Write failing provider tests asserting `payment_method_data: { type: 'sbp' }`, redirect confirmation and `capture: true`.**
- [ ] **Step 2: Add trusted `createForKiosk(orderId, key)` while preserving access-token checks on public `create`.**
- [ ] **Step 3: Generate an SVG QR from the confirmed YooKassa URL and return it only to the owning kiosk device.**
- [ ] **Step 4: Add status endpoint and filtered SSE for own order plus `settings.updated`.**
- [ ] **Step 5: Verify repeated/forged webhooks, paid visibility, failed expiry and commit `feat: add yookassa qr payments for kiosk`.**

### Task 6: Payment UI, card-only animation and session recovery

**Files:**
- Modify: `kiosk-api.js`, `kiosk-app.js`, `kiosk-payment-presentation.js`, `kiosk-payment.css`, `kiosk-session.js`, `kiosk-session-runtime.js`
- Test: `tests/kiosk-api.test.mjs`, `tests/kiosk-payment.test.mjs`, `tests/kiosk-session.test.mjs`

**Interfaces:**
- Consumes: kiosk order response and payment SSE/status.
- Produces: QR waiting, paid, failed, expired and card-unavailable states.

- [ ] **Step 1: Write a failing test proving card clicks perform zero fetch calls and never enter success state.**

```js
await controller.selectPayment('card');
assert.equal(fetchCalls.length, 0);
assert.equal(controller.state.paymentState, 'terminal-unavailable');
```

- [ ] **Step 2: Render the terminal animation for about two seconds, then the exact unavailable message and QR action.**
- [ ] **Step 3: Collect and normalize receipt phone only for QR, submit cart once and render sanitized `qrSvg`.**
- [ ] **Step 4: Persist only the pending order ID locally, recover it after reload and clear all customer/session data after payment or timeout.**
- [ ] **Step 5: Run frontend tests and commit `feat: complete kiosk qr checkout`.**

### Task 7: Kitchen labels and kiosk-safe staff DTO

**Files:**
- Modify: `server/src/repositories/staff-orders.js`, `server/src/domain/staff-order.js`, `kitchen-presentation.js`, `kitchen.css`
- Test: `server/tests/kiosk-kitchen.test.mjs`, `tests/kitchen-update.test.mjs`

**Interfaces:**
- Produces staff fields: `source: 'web'|'kiosk'`, `serviceMode: 'dine_in'|'takeaway'|null`.

- [ ] **Step 1: Write a failing integration test that pending kiosk orders are absent and paid orders appear with correct labels.**
- [ ] **Step 2: Extend staff queries/DTO without exposing kiosk receipt phone to kitchen.**
- [ ] **Step 3: Render “Киоск · Здесь” and “Киоск · С собой”; suppress courier/address actions.**
- [ ] **Step 4: Verify cancellation and full refund use the existing flow, then commit `feat: show paid kiosk orders in kitchen`.**

### Task 8: Multi-tablet responsive QA and deployment configuration

**Files:**
- Modify: `kiosk.css`, `kiosk-catalog.css`, `kiosk-cart.css`, `kiosk-payment.css`, `kiosk-fixes-v3.css`
- Modify: `deploy/nginx.conf`, `deploy/Caddyfile.pivdoner`, `robots-private.txt`
- Create: `tests/kiosk-responsive.test.mjs`, `tests/kiosk-deployment.test.mjs`

**Interfaces:**
- Produces: `/` on `kiosk.pivdoner.ru` -> `/kiosk.html`; `/api/*` -> current API.

- [ ] **Step 1: Write viewport tests for 600×960, 768×1024, 800×1280, 1024×1366 and 1280×800.**
- [ ] **Step 2: Use `clamp()`, dynamic viewport units, safe-area insets and bounded sheet grids so controls never clip.**
- [ ] **Step 3: Preserve 48 px touch targets, top-align product sheets and verify scrolling with touch.**
- [ ] **Step 4: Add kiosk host routing, private robots and deployment assertions.**
- [ ] **Step 5: Run all frontend/server tests, Docker config checks and manual screenshots at every target size.**
- [ ] **Step 6: Commit `feat: prepare kiosk subdomain deployment`; stop before production DNS/deploy and request explicit confirmation with rollback steps.**
