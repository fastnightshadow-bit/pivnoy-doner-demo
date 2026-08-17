# Kitchen Order History Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Connect the existing kitchen history screen to a secure server endpoint for completed and cancelled orders.

**Architecture:** Extend the staff-order repository with a bounded history query and expose it only to owner/kitchen roles. Reuse the existing safe order mapper and details panel; add status/search filters without exposing history to couriers.

**Tech Stack:** Express, PostgreSQL repository queries, vanilla ES modules, Node test runner, Supertest.

## Global Constraints

- Endpoint is accessible only to `owner` and `kitchen`.
- Return at most 100 orders, newest first.
- Search is limited to the public order number; status is `completed`, `cancelled` or `all`.
- Keep the existing safe staff projection; do not expose credentials or payment provider payloads.

---

### Task 1: Secure history endpoint

**Files:**
- Modify: `server/src/repositories/staff-orders.js`
- Modify: `server/src/routes/staff-orders.js`
- Test: `server/tests/staff-orders-security.test.mjs`
- Test: `server/tests/order-flow.test.mjs`

**Interfaces:**
- Produces: `orders.listHistory({ query, status, limit })`.
- Produces: `GET /api/staff/orders/history?query=&status=` returning `{ orders }`.

- [ ] **Step 1: Write failing security and repository tests** for role access, completed/cancelled selection, order, limit and safe projection.
- [ ] **Step 2: Run focused tests** and verify 404/missing-method failures.
- [ ] **Step 3: Implement the bounded parameterized query and route before `/:id/status`** so `history` is not parsed as an order ID.
- [ ] **Step 4: Re-run focused and integration tests** until green.
- [ ] **Step 5: Commit** as `feat: expose kitchen order history`.

### Task 2: Connect kitchen history UI

**Files:**
- Modify: `kitchen-api.js`
- Modify: `kitchen.js`
- Modify: `kitchen.html`
- Modify: `kitchen.css`
- Modify: affected cache URLs/service worker
- Test: `tests/kitchen-api.test.mjs`
- Test: `tests/kitchen.test.mjs`
- Test: `tests/deployment.test.mjs`

**Interfaces:**
- Consumes: `/staff/orders/history` from Task 1.
- Produces: working history search/status filter and existing details panel integration.

- [ ] **Step 1: Write failing tests** for the endpoint URL, status filter, empty/error state and opened details.
- [ ] **Step 2: Run focused tests** and verify failures are caused by the old `/history` URL and missing filter behavior.
- [ ] **Step 3: Implement the minimal client wiring and cache-version updates**.
- [ ] **Step 4: Run focused, deployment, complete root and complete server suites**.
- [ ] **Step 5: Commit** as `feat: connect kitchen order history`.
