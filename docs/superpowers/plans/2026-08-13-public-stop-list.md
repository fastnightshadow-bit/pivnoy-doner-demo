# Public Stop List Implementation Plan

**Goal:** Make kitchen stop-list changes visible to clients and reject orders containing stopped products on the server.

**Architecture:** Expose a minimal read-only public catalog-status endpoint backed by the existing settings repository. The client keeps the last successful status in memory, refreshes it on load/visibility/polling, renders stopped products as unavailable, and rechecks at checkout. The order service performs the authoritative availability check before pricing and persistence.

**Tech Stack:** Express, PostgreSQL repository services, vanilla ES modules, Node test runner, Supertest.

---

### Task 1: Public catalog-status contract

**Files:**
- Modify: `server/src/app.js`
- Modify: `server/src/routes/settings.js`
- Test: `server/tests/settings.test.mjs`

1. Add failing tests proving anonymous GET access, exact minimal response, and no write access.
2. Implement the read-only public route using `settings.get()`.
3. Run the focused settings tests.

### Task 2: Authoritative order rejection

**Files:**
- Modify: `server/src/http.js`
- Modify: `server/src/services/orders.js`
- Modify: `server/src/routes/orders.js`
- Test: `server/tests/orders.test.mjs`

1. Add failing tests for stopped products, error details, and no pricing/persistence side effects.
2. Inject the settings reader into the order service and reject new orders with `PRODUCT_UNAVAILABLE`.
3. Preserve successful idempotent retry recovery.
4. Run focused order tests.

### Task 3: Client status API and presentation

**Files:**
- Modify: `client-api.js`
- Modify: `home.js`
- Modify: `home-menu.js`
- Modify: `product-sheet.js`
- Modify: `home.css`
- Test: `tests/client-api.test.mjs`
- Test: `tests/home-menu.test.mjs`
- Test: `tests/product-sheet.test.mjs`

1. Add failing API and rendering tests.
2. Fetch public status on load, visibility return, and a non-overlapping interval while retaining the last successful value on errors.
3. Mark stopped products with `Нет в наличии`, disable opening/adding/quantity controls, and protect an already-open sheet.
4. Run focused client tests.

### Task 4: Checkout revalidation and cache graph

**Files:**
- Modify: `checkout.js`
- Modify: `checkout-state.js` if needed
- Modify: `home.html`
- Modify: `checkout.html`
- Modify: affected ES-module import URLs
- Test: `tests/checkout.test.mjs`
- Test: `tests/deployment.test.mjs`

1. Add failing tests proving checkout revalidates and reports stopped product names without clearing the cart.
2. Implement the pre-submit status check and map server `PRODUCT_UNAVAILABLE` errors to the same message.
3. Bump the complete immutable dependency graph.
4. Run focused checkout and deployment tests.

### Task 5: Full verification and stage-only rollout

1. Run full root and server test suites, syntax checks, `git diff --check`, and security searches.
2. Commit and push the feature branch.
3. Deploy only `stage.pivdoner.ru`; do not touch the main domain, Telegram bot, or live YooKassa.
4. Verify from the real stage API and browser: kitchen stops a product, client shows it unavailable, checkout/server reject stale attempts, restoring availability re-enables it.
5. Report other discovered deficiencies separately without changing them.
