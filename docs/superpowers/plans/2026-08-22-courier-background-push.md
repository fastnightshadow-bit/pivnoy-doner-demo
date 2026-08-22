# Courier Background Push Implementation Plan

> **For Ilya:** This plan should be executed with `superpowers:executing-plans` (or inline in this task) and verified with `superpowers:verification-before-completion` before deployment.

**Goal:** Deliver real background courier notifications when the courier PWA is closed, keep foreground updates reliable, and add the Yandex Webmaster verification file at the public site root.

**Architecture:** Use standards-based Web Push with VAPID. Store browser subscriptions and an idempotent push outbox in PostgreSQL. Enqueue a courier notification in the same database transaction that marks a delivery payment as paid, then let a small API-side worker deliver queued notifications with retries. The courier PWA subscribes only after an explicit user action; its service worker receives pushes while the app is closed.

**Tech Stack:** Node.js 22, Express 5, PostgreSQL, `web-push` 3.6.7, vanilla JavaScript PWA/service worker, Node test runner, Docker Compose, Caddy.

---

## Task 1: Add Yandex Webmaster verification at the public root

**Files:**
- Create: `yandex_5d45df874506b158.html`
- Create: `tests/yandex-webmaster.test.mjs`

**Step 1: Write the failing test**

Create a test that reads `yandex_5d45df874506b158.html` and asserts:

```js
assert.match(html, /charset=UTF-8/i);
assert.match(html, /Verification:\s*5d45df874506b158/);
```

**Step 2: Run the test to verify it fails**

Run:

```powershell
node --test tests/yandex-webmaster.test.mjs
```

Expected: FAIL because the verification file does not exist.

**Step 3: Add the exact verification file**

Create the root HTML file with the approved verification token and UTF-8 meta tag. Do not add scripts, redirects, or application layout.

**Step 4: Run the test to verify it passes**

Run the same command. Expected: PASS.

**Step 5: Commit**

```powershell
git add yandex_5d45df874506b158.html tests/yandex-webmaster.test.mjs
git commit -m "Add Yandex Webmaster verification"
```

## Task 2: Add persistent push storage and outbox schema

**Files:**
- Create: `server/src/db/migrations/005_courier_push.sql`
- Modify: `server/tests/migrations.test.mjs`

**Step 1: Write failing migration assertions**

Add tests that require:

- `push_subscriptions` with a unique endpoint and `staff_account_id` foreign key;
- `push_jobs` with unique `event_key`, `order_id`, JSON payload, status, attempts and retry timestamps;
- an index that supports claiming pending jobs by `available_at`.

**Step 2: Run the server migration test**

```powershell
cd server
npm test -- --test-name-pattern="push"
```

Expected: FAIL because migration 005 is missing.

**Step 3: Create migration 005**

Use constraints that protect correctness even if the worker restarts:

```sql
create table if not exists push_subscriptions (... endpoint text not null unique ...);
create table if not exists push_jobs (... event_key text not null unique ...);
```

Allowed job statuses: `pending`, `sending`, `sent`, `dead`. Store no customer phone in push payloads.

**Step 4: Re-run the migration tests**

Expected: PASS.

**Step 5: Commit**

```powershell
git add server/src/db/migrations/005_courier_push.sql server/tests/migrations.test.mjs
git commit -m "Add courier push outbox schema"
```

## Task 3: Implement subscription and job repository operations

**Files:**
- Create: `server/src/repositories/push.js`
- Create: `server/tests/push-repository.test.mjs`

**Step 1: Write failing repository tests**

Use a recording fake pool/client and cover:

- upsert by endpoint updates the account and keys;
- unsubscribe is scoped to the authenticated account;
- only active courier subscriptions are listed;
- claim uses a transaction and `FOR UPDATE SKIP LOCKED`;
- success, retry, dead-letter and stale-subscription updates are distinct;
- retries increment attempts and set `available_at`.

**Step 2: Run only the new tests**

```powershell
cd server
node --test tests/push-repository.test.mjs
```

Expected: FAIL because the module is missing.

**Step 3: Implement the smallest repository API**

Export `createPushRepository(pool)` with:

```js
upsertSubscription
deleteSubscription
listActiveCourierSubscriptions
claimNextJob
markJobSent
rescheduleJob
markJobDead
deactivateSubscription
```

Always release the database client in `finally` and roll back failed claims.

**Step 4: Re-run the tests**

Expected: PASS.

**Step 5: Commit**

```powershell
git add server/src/repositories/push.js server/tests/push-repository.test.mjs
git commit -m "Add courier push repository"
```

## Task 4: Enqueue one delivery push atomically after verified payment

**Files:**
- Modify: `server/src/repositories/payments.js`
- Modify: `server/tests/payments.test.mjs`

**Step 1: Add failing payment repository tests**

Cover all three cases:

1. `paid` + `delivery` inserts exactly one `push_jobs` record containing order number, ETA and formatted address;
2. replaying the same webhook does not duplicate the job (`event_key` uniqueness / `ON CONFLICT DO NOTHING`);
3. pickup or non-paid states do not enqueue a courier job.

**Step 2: Run the focused tests**

```powershell
cd server
node --test --test-name-pattern="courier push" tests/payments.test.mjs
```

Expected: FAIL.

**Step 3: Extend `applyVerifiedState`**

Inside its existing transaction, read the order fulfillment data and, only when the verified payment changes the delivery order to paid, insert:

```text
event_key = courier.order_paid:<order-id>
```

The payload must contain only `orderId`, public order number, ETA, address text and target URL. Never include phone, PIN or payment credentials.

**Step 4: Re-run focused and full payment tests**

```powershell
node --test --test-name-pattern="courier push" tests/payments.test.mjs
npm test
```

Expected: PASS.

**Step 5: Commit**

```powershell
git add server/src/repositories/payments.js server/tests/payments.test.mjs
git commit -m "Queue courier push after paid delivery"
```

## Task 5: Add Web Push sender and reliable worker

**Files:**
- Modify: `server/package.json`
- Modify: lockfile used by the project
- Create: `server/src/push/web-push-sender.js`
- Create: `server/src/push/worker.js`
- Create: `server/tests/push-worker.test.mjs`

**Step 1: Write failing worker tests**

Inject a fake repository, sender and clock. Cover:

- no queued job is a no-op;
- all active courier subscriptions receive the job;
- HTTP 404/410 deactivates only the stale subscription;
- temporary sender error retries with bounded backoff;
- maximum attempts mark the job dead;
- no active subscription finishes the job without endlessly replaying old orders;
- one failed subscription does not prevent successful delivery to another.

**Step 2: Run the test**

```powershell
cd server
node --test tests/push-worker.test.mjs
```

Expected: FAIL.

**Step 3: Install and wrap `web-push`**

```powershell
pnpm add web-push@3.6.7
```

Keep the library behind an injected sender so tests never call the network.

**Step 4: Implement `createPushWorker`**

Use one bounded processing loop. Do not overlap ticks. A successful job is marked `sent`; retryable errors receive exponential backoff; stale endpoints are deactivated.

**Step 5: Run worker and all server tests**

```powershell
node --test tests/push-worker.test.mjs
npm test
```

Expected: PASS.

**Step 6: Commit**

```powershell
git add server/package.json pnpm-lock.yaml server/src/push server/tests/push-worker.test.mjs
git commit -m "Add reliable Web Push worker"
```

## Task 6: Add authenticated push API

**Files:**
- Create: `server/src/services/push.js`
- Create: `server/src/routes/push.js`
- Modify: `server/src/app.js`
- Create: `server/tests/push-routes.test.mjs`

**Step 1: Write failing route tests**

Test:

- anonymous requests receive 401;
- courier and owner can read the public VAPID key;
- a valid PushSubscription is saved for the authenticated account;
- malformed endpoint/keys receive 400;
- DELETE removes only the current account/device endpoint;
- kitchen-only role receives 403.

**Step 2: Run the route tests**

```powershell
cd server
node --test tests/push-routes.test.mjs
```

Expected: FAIL.

**Step 3: Implement service and router**

Mount at `/api/push` with:

```text
GET    /public-key
POST   /subscriptions
DELETE /subscriptions
```

Use the existing session middleware and `requireRole`. Validate JSON with Zod and keep the public key endpoint authenticated so it cannot be abused as an unrelated public API.

**Step 4: Run route and full server tests**

Expected: PASS.

**Step 5: Commit**

```powershell
git add server/src/services/push.js server/src/routes/push.js server/src/app.js server/tests/push-routes.test.mjs
git commit -m "Expose authenticated courier push API"
```

## Task 7: Wire VAPID configuration and worker lifecycle

**Files:**
- Modify: `server/src/config.js`
- Modify: `server/src/http.js`
- Modify: `deploy/compose.yml`
- Modify: `deploy/compose.production.yml`
- Modify: `deploy/compose.stage.yml`
- Modify: deployment environment examples if present
- Create or modify: `server/tests/config.test.mjs`

**Step 1: Write failing configuration tests**

Require these settings:

```text
VAPID_PUBLIC_KEY
VAPID_PRIVATE_KEY
VAPID_SUBJECT
PUSH_POLL_MS
```

Test that push is disabled cleanly when keys are absent in local development, but an incomplete pair is rejected.

**Step 2: Run focused config tests**

Expected: FAIL.

**Step 3: Wire production lifecycle**

Create repository, push service, sender and worker in `http.js`. Start the interval only when a complete VAPID configuration exists. Clear the timer during graceful shutdown. Ensure only one tick runs at a time.

**Step 4: Pass variables through Docker Compose**

Do not commit private values. The repository contains only variable names; real private keys stay in server `.env` files.

**Step 5: Run all server tests**

Expected: PASS.

**Step 6: Commit**

```powershell
git add server/src/config.js server/src/http.js deploy server/tests/config.test.mjs
git commit -m "Configure courier push delivery"
```

## Task 8: Add courier browser subscription client

**Files:**
- Modify: `courier-api.js`
- Create: `courier-push.js`
- Create: `tests/courier-push.test.mjs`
- Modify: `tests/courier-api.test.mjs`

**Step 1: Write failing client tests**

Cover:

- URL-safe VAPID key conversion;
- GET public key, POST subscription and DELETE subscription API methods;
- existing browser subscription is reused;
- subscription is stored on the server after explicit enable;
- logout unregisters only the current endpoint;
- denied or unsupported Notification/PushManager produces a friendly state, not an uncaught error.

**Step 2: Run the tests**

```powershell
node --test tests/courier-api.test.mjs tests/courier-push.test.mjs
```

Expected: FAIL.

**Step 3: Implement the client manager**

Keep browser APIs injected so the module is testable. Do not request permission automatically on page load; require the existing notification button.

**Step 4: Re-run client tests**

Expected: PASS.

**Step 5: Commit**

```powershell
git add courier-api.js courier-push.js tests/courier-api.test.mjs tests/courier-push.test.mjs
git commit -m "Add courier push subscription client"
```

## Task 9: Receive background pushes in the courier PWA

**Files:**
- Modify: `courier-sw.js`
- Modify: `courier.webmanifest`
- Modify: `tests/pwa-assets.test.mjs`
- Create: `tests/courier-service-worker.test.mjs`

**Step 1: Write failing service-worker tests**

Assert that:

- the manifest starts at `./courier.html`, never `?demo=1`;
- `push` parses the payload and calls `showNotification`;
- title/body/icon/tag/data URL are present;
- click focuses an existing courier window or opens `courier.html`;
- click never opens demo mode.

**Step 2: Run focused tests**

```powershell
node --test tests/pwa-assets.test.mjs tests/courier-service-worker.test.mjs
```

Expected: FAIL.

**Step 3: Implement the service-worker handlers**

Use `event.waitUntil`. Treat invalid payloads safely. Match existing clients by origin/path before `openWindow`. Bump the courier cache version so installed PWAs update.

**Step 4: Re-run tests**

Expected: PASS.

**Step 5: Commit**

```powershell
git add courier-sw.js courier.webmanifest tests/pwa-assets.test.mjs tests/courier-service-worker.test.mjs
git commit -m "Enable courier background push notifications"
```

## Task 10: Integrate push state into the courier UI without duplicate alerts

**Files:**
- Modify: `courier.html`
- Modify: `courier.js`
- Modify: existing courier styles if required
- Create or modify: `tests/courier-notifications.test.mjs`

**Step 1: Write failing UI behavior tests**

Cover:

- enable button triggers subscription only after click;
- active subscription shows “Уведомления включены”;
- foreground `showNotification` fallback is skipped when full Web Push is active;
- SSE/order refresh stays active for on-screen updates;
- logout deletes the current server subscription before ending the session;
- failed subscription leaves normal courier order controls usable.

**Step 2: Run focused tests**

Expected: FAIL.

**Step 3: Integrate `courier-push.js`**

Keep a clear state machine: unsupported, default, denied, subscribed. Preserve the existing live order flow and avoid two notifications for one order.

**Step 4: Run courier and full root tests**

```powershell
node --test tests/courier-*.test.mjs tests/pwa-assets.test.mjs
node --test tests/*.test.mjs
```

Expected: PASS.

**Step 5: Commit**

```powershell
git add courier.html courier.js tests/courier-notifications.test.mjs
git commit -m "Integrate courier push notification controls"
```

## Task 11: Security, regression and operational verification

**Files:**
- Modify only files uncovered by failing tests or audit findings
- Create: `docs/operations/courier-push.md`

**Step 1: Run the full automated suite**

```powershell
node --test tests/*.test.mjs
cd server
npm test
```

Expected: all tests PASS.

**Step 2: Run syntax and repository checks**

```powershell
node --check courier.js
node --check courier-api.js
node --check courier-push.js
node --check courier-sw.js
git status --short
```

Expected: no syntax errors; only intentional documentation/deployment changes remain.

**Step 3: Audit secrets and privacy**

Search tracked files for VAPID private keys, YooKassa keys and raw phone data in push payloads. Expected: no secret or phone in committed push code, fixtures or documentation.

**Step 4: Write the runbook**

Document safe VAPID generation/rotation, stage and production environment variable names, subscription troubleshooting, retry/dead job checks and browser support. Never include live secrets.

**Step 5: Commit**

```powershell
git add docs/operations/courier-push.md
git commit -m "Document courier push operations"
```

## Task 12: Deploy stage, perform real-device test, then deploy production

**Files:**
- No source changes unless verification finds a defect

**Step 1: Generate separate VAPID pairs securely**

Generate one pair for stage and one for production. Write private keys directly into the remote protected `.env.stage` and `.env` files without printing them into chat, shell history, Git output or logs.

**Step 2: Deploy stage**

Deploy the committed revision to `/opt/pivdoner`, rebuild the stage API, run migration 005 and confirm:

```text
https://stage.pivdoner.ru/api/health
https://stage.pivdoner.ru/yandex_5d45df874506b158.html
```

**Step 3: Verify API and worker on stage**

- authenticated courier can fetch public VAPID key;
- subscription is stored once even after reopening the PWA;
- a paid delivery creates exactly one push job;
- worker marks it sent or records a bounded retry;
- pickup creates no courier push job.

**Step 4: Perform real Android closed-app test**

On the courier phone:

1. install/open the courier PWA;
2. sign in once;
3. tap “Включить уведомления” and allow notifications;
4. fully close the PWA;
5. create and pay a stage delivery order;
6. confirm one notification arrives;
7. tap it and confirm the courier app opens the active order.

Also verify denied permission, offline recovery and no duplicate foreground alert.

**Step 5: Deploy production**

Only after stage passes, update production containers, run migrations, verify health and preserve the existing YooKassa/DB configuration. Do not touch the old Telegram bot or unrelated server services.

**Step 6: Verify public endpoints**

Check:

```text
https://pivdoner.ru/
https://kitchen.pivdoner.ru/
https://courier.pivdoner.ru/
https://owner.pivdoner.ru/
https://pivdoner.ru/yandex_5d45df874506b158.html
```

Then create one low-value controlled delivery order, verify the kitchen/courier flow and process it normally.

**Step 7: Final commit/tag record**

Record the deployed commit hash in the runbook or deployment log. Confirm `git status --short` is clean.

---

## Acceptance checklist

- Courier receives one notification for a newly paid delivery while the PWA is closed.
- Notification opens the real courier app, never demo mode.
- Pickup, unpaid and duplicate webhook events do not create courier notifications.
- Foreground screen continues to update through SSE/fallback without manual refresh.
- Stale browser subscriptions are removed; temporary failures retry without blocking payments.
- Logout unregisters only that browser subscription.
- Push payload contains no customer phone or secrets.
- Stage and production use separate VAPID credentials stored only in server environment files.
- Yandex verification file is reachable at the exact production root URL.
- Root and server automated suites pass before and after deployment.
