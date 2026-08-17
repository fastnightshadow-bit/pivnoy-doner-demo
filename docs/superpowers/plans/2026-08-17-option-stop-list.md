# Option Stop List Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let the kitchen independently stop chicken, beef and each doner sauce while keeping the existing product stop-list.

**Architecture:** Add server-side option availability keyed by `kind/id`, expose only stopped IDs in the public status contract, and validate product configuration during order creation. Kitchen settings render grouped switches; client sheets disable stopped choices and preserve the last known server state.

**Tech Stack:** PostgreSQL, Express, shared catalog modules, vanilla ES modules, Node test runner, Supertest.

## Global Constraints

- Meat IDs are exactly `chicken` and `beef`.
- Sauce IDs come only from `PRODUCT_SAUCES`.
- Product, meat and sauce availability are server-authoritative.
- Existing product stop-list behavior must remain unchanged.

---

### Task 1: Persist and expose option availability

**Files:**
- Modify: `server/src/db/migrations/004_kitchen_operations.sql`
- Modify: `server/src/repositories/settings.js`
- Modify: `server/src/services/settings.js`
- Modify: `server/src/routes/settings.js`
- Test: `server/tests/migrations.test.mjs`
- Test: `server/tests/settings.test.mjs`

**Interfaces:**
- Produces: settings fields `stoppedMeatIds: string[]` and `stoppedSauceIds: string[]`.
- Produces: `PATCH /api/catalog-options/:kind/:id` accepting `{ available: boolean }`.

- [ ] **Step 1: Write failing repository/route tests** for exact public fields, authenticated writes, unknown kind/id rejection and outbox event.
- [ ] **Step 2: Run focused tests** and confirm failures are from the missing table and route.
- [ ] **Step 3: Implement the option table, repository and validated route** using allowlists from the shared catalog.
- [ ] **Step 4: Re-run focused tests** until green.
- [ ] **Step 5: Commit** as `feat: add ingredient stop list`.

### Task 2: Reject unavailable configurations

**Files:**
- Modify: `server/src/services/orders.js`
- Test: `server/tests/orders.test.mjs`

**Interfaces:**
- Consumes: `catalogSettings.get()` returning product/meat/sauce stopped IDs.
- Produces: `PRODUCT_OPTION_UNAVAILABLE` with safe `{ meats, sauces }` details.

- [ ] **Step 1: Write failing tests** for stopped meat, stopped sauce, no pricing/persistence side effects and available configurations.
- [ ] **Step 2: Run the focused order tests** and verify expected failures.
- [ ] **Step 3: Add the minimal authoritative configuration validation** before price calculation.
- [ ] **Step 4: Re-run focused tests** and require all to pass.
- [ ] **Step 5: Commit** as `fix: reject stopped product options`.

### Task 3: Grouped kitchen controls and client rendering

**Files:**
- Modify: `kitchen-settings.js`
- Modify: `kitchen-api.js`
- Modify: `kitchen.js`
- Modify: `kitchen.css`
- Modify: `home.js`
- Modify: `product-sheet.js`
- Modify: `checkout.js`
- Modify: affected HTML/service-worker cache URLs
- Test: `tests/kitchen-settings.test.mjs`
- Test: `tests/kitchen-api.test.mjs`
- Test: `tests/product-sheet.test.mjs`
- Test: `tests/checkout.test.mjs`
- Test: `tests/deployment.test.mjs`

**Interfaces:**
- Consumes: new settings contract and option endpoint from Task 1.
- Produces: grouped stop-list UI and disabled client choices with clear `Нет в наличии` copy.

- [ ] **Step 1: Write failing state/API/rendering tests** for meat and sauce groups, disabled options and checkout revalidation.
- [ ] **Step 2: Run focused tests** and confirm the desired failures.
- [ ] **Step 3: Implement minimal state, API calls and UI** while preserving product toggles.
- [ ] **Step 4: Bump the full cache graph and run focused plus deployment tests**.
- [ ] **Step 5: Commit** as `feat: show option stop list across apps`.
