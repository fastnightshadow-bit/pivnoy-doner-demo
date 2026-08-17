# Kitchen Refunds Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let authenticated kitchen and owner accounts cancel a paid order and safely request one full YooKassa refund.

**Architecture:** Persist refund operations before contacting the provider, derive amount and provider payment ID from the database, and use a stable idempotency key. Cancellation and refund state stay separate so provider failure is visible and retryable without putting the order back into production.

**Tech Stack:** Express, PostgreSQL migrations/repositories, YooKassa HTTP API, vanilla ES modules, Node test runner, Supertest.

## Global Constraints

- Full refunds only; amount is never accepted from the browser.
- Roles `owner` and `kitchen` may request or retry a refund.
- No live provider calls in automated tests or local verification.
- Never expose provider credentials or unrestricted provider payloads.

---

### Task 1: Refund persistence and provider contract

**Files:**
- Create: `server/src/db/migrations/004_kitchen_operations.sql`
- Modify: `server/src/payments/provider.js`
- Modify: `server/src/payments/mock-provider.js`
- Modify: `server/src/payments/yookassa-provider.js`
- Modify: `server/src/repositories/payments.js`
- Test: `server/tests/migrations.test.mjs`
- Test: `server/tests/payments.test.mjs`

**Interfaces:**
- Produces: `provider.createRefund({ paymentId, amount, idempotencyKey })` returning `{ id, paymentId, status, amount, currency }`.
- Produces: payment repository methods `reserveRefund`, `completeRefund`, `findRefundByOrderId`.

- [ ] **Step 1: Write failing migration and provider tests** proving one refund per order, exact full amount, stable idempotency header, normalized response and fail-closed provider validation.
- [ ] **Step 2: Run focused tests** with `node --test server/tests/migrations.test.mjs server/tests/payments.test.mjs` and verify failures are caused by missing refund behavior.
- [ ] **Step 3: Add the refund table and minimal provider/repository implementation** with unique `order_id`, unique `idempotency_key`, statuses `pending|succeeded|failed`, safe provider fields and timestamps.
- [ ] **Step 4: Re-run focused tests** and require all assertions to pass.
- [ ] **Step 5: Commit** the persistence/provider unit as `feat: add idempotent payment refunds`.

### Task 2: Kitchen cancellation service and API

**Files:**
- Create: `server/src/services/refunds.js`
- Modify: `server/src/http.js`
- Modify: `server/src/app.js`
- Modify: `server/src/routes/staff-orders.js`
- Modify: `server/src/repositories/staff-orders.js`
- Modify: `server/src/domain/staff-order.js`
- Test: `server/tests/staff-orders.test.mjs`
- Test: `server/tests/order-flow.test.mjs`

**Interfaces:**
- Consumes: refund repository/provider contract from Task 1.
- Produces: `POST /api/staff/orders/:id/cancel` with `{ version, reason }` and response `{ order, refund }`.
- Produces: `POST /api/staff/orders/:id/refund/retry` for a failed operation.

- [ ] **Step 1: Write failing route/service tests** for kitchen/owner access, courier rejection, missing reason, unpaid order rejection, exact amount lookup, double-submit idempotency, failure state and retry.
- [ ] **Step 2: Run focused tests** and verify the new endpoints fail because they do not exist.
- [ ] **Step 3: Implement the minimal transactional reservation and service flow** so cancellation removes work from the board, refund state is persisted, and outbox payloads contain no secrets.
- [ ] **Step 4: Re-run focused and integration tests** until both pass.
- [ ] **Step 5: Commit** as `feat: let kitchen refund cancelled orders`.

### Task 3: Kitchen cancellation UI

**Files:**
- Modify: `kitchen-api.js`
- Modify: `kitchen.js`
- Modify: `kitchen.html`
- Modify: `kitchen.css`
- Modify: `kitchen-sw.js`
- Test: `tests/kitchen-api.test.mjs`
- Test: `tests/kitchen.test.mjs`
- Test: `tests/deployment.test.mjs`

**Interfaces:**
- Consumes: cancellation/retry endpoints from Task 2.
- Produces: reason + order-number confirmation dialog and truthful refund status/retry controls.

- [ ] **Step 1: Write failing client tests** for request shape, displayed amount, two-step confirmation, pending/succeeded/failed messages and retry.
- [ ] **Step 2: Run focused client tests** and verify the missing behavior fails.
- [ ] **Step 3: Implement the UI and bump the complete immutable-cache graph** without changing unrelated transitions.
- [ ] **Step 4: Run focused client/deployment tests** and then the complete root and server suites.
- [ ] **Step 5: Commit** as `feat: show kitchen refund progress`.
