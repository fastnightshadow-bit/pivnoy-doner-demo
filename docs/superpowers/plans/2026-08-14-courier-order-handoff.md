# Courier Order Handoff Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the courier, rather than the kitchen, accept ready delivery orders and mark them delivered, while the customer sees a simple reliable status flow.

**Architecture:** Keep `ready` as the kitchen boundary, use `courier` while the courier owns the order, and close the order as `completed` when the courier confirms delivery. The kitchen and courier UIs derive their actions from pure state helpers; the server remains the authority for role permissions and optimistic version checks.

**Tech Stack:** Browser ES modules, HTML/CSS PWA, Node.js 22, Express, PostgreSQL, Node test runner.

## Global Constraints

- Customer delivery copy: `Оформлен → Принят → Готовится → Передан курьеру → Доставлен`.
- Kitchen must never perform `ready → courier`.
- Courier must perform `ready → courier` and `courier → completed`.
- Pickup flow remains unchanged.
- Status UI updates only after the server confirms the transition.
- No database migration and no changes to the main domain or old Telegram bot.
- Stage deployment happens only after all local tests pass.

---

### Task 1: Server transition contract

**Files:**
- Modify: `server/src/domain/status-machine.js`
- Modify: `server/tests/statuses.test.mjs`
- Modify: `server/tests/order-flow.test.mjs`

**Interfaces:**
- Consumes: `canTransition(from, to, role)` and `PATCH /api/staff/orders/:id/status`.
- Produces: courier-owned `ready → courier → completed` flow; kitchen remains forbidden from courier transitions.

- [ ] **Step 1: Write the failing role-transition test**

Add literal assertions:

```js
assert.equal(canTransition('ready', 'courier', 'kitchen'), false);
assert.equal(canTransition('ready', 'courier', 'courier'), true);
assert.equal(canTransition('courier', 'completed', 'courier'), true);
```

- [ ] **Step 2: Update the integration flow expectation and verify RED**

Change the courier loop to `['courier', 'completed']` and expect the final public status `completed`.

Run:

```powershell
node --test server/tests/statuses.test.mjs server/tests/order-flow.test.mjs
```

Expected: FAIL because `courier → completed` is currently forbidden.

- [ ] **Step 3: Implement the minimal server rule**

Keep the global graph compatible and change the courier role list to include:

```js
'ready:courier',
'courier:completed',
```

- [ ] **Step 4: Verify GREEN**

Run the focused server tests again. Expected: all pass.

- [ ] **Step 5: Commit**

```powershell
git add server/src/domain/status-machine.js server/tests/statuses.test.mjs server/tests/order-flow.test.mjs
git commit -m "fix: give courier delivery status ownership"
```

### Task 2: Kitchen stops at ready

**Files:**
- Modify: `kitchen-model.js`
- Modify: `kitchen.js`
- Modify: `tests/kitchen-model.test.mjs` or the existing kitchen presentation test that exercises real markup

**Interfaces:**
- Consumes: normalized kitchen order with `status` and `fulfillment`.
- Produces: `getNextKitchenAction(order)` returns no transition for a ready delivery; kitchen markup shows `Ожидает курьера` without a clickable status control.

- [ ] **Step 1: Write the failing model and markup tests**

Use a ready delivery fixture and assert:

```js
assert.equal(getNextKitchenAction(readyDelivery), null);
assert.match(createOrderCardMarkup(readyDelivery), /Ожидает курьера/);
assert.doesNotMatch(createOrderCardMarkup(readyDelivery), /data-change-status/);
```

Also retain a pickup assertion that returns `issued`.

- [ ] **Step 2: Verify RED**

Run the focused kitchen tests. Expected: current delivery action is still `handed_to_courier`.

- [ ] **Step 3: Implement the minimal kitchen behavior**

Return `null` for `ready + delivery`, preserve `issued` for pickup, and render this passive footer element:

```html
<span class="order-card__waiting">Ожидает курьера</span>
```

Show the same passive copy in the detail panel.

- [ ] **Step 4: Verify GREEN and commit**

Run focused kitchen tests, then commit:

```powershell
git add kitchen-model.js kitchen.js tests
git commit -m "fix: keep delivery handoff out of kitchen"
```

### Task 3: Courier action controls

**Files:**
- Modify: `courier-state.js`
- Modify: `courier-api.js`
- Modify: `courier.js`
- Modify: `courier.css`
- Modify: `tests/courier-state.test.mjs`
- Modify: `tests/courier-api.test.mjs`

**Interfaces:**
- Produces: `getCourierAction(order)` returning `{ status: 'courier', label: 'Принять заказ' }`, `{ status: 'completed', label: 'Заказ доставлен' }`, or `null`.
- Preserves: normalized `version` for optimistic concurrency.
- Consumes: `api.changeStatus(orderId, status, version)`.

- [ ] **Step 1: Write failing pure-state tests**

Add literal expectations:

```js
assert.deepEqual(getCourierAction({ status: 'ready' }), {
  status: 'courier',
  label: 'Принять заказ',
});
assert.deepEqual(getCourierAction({ status: 'handed_to_courier' }), {
  status: 'completed',
  label: 'Заказ доставлен',
});
assert.equal(getCourierAction({ status: 'cooking' }), null);
```

Assert that normalization preserves `version`.

- [ ] **Step 2: Write the failing API/markup tests and verify RED**

Assert the production API sends `status` and `version`, and markup contains one action only in ready/owned states. Run courier tests; expected failure is missing action behavior.

- [ ] **Step 3: Implement minimal courier behavior**

Add the pure action helper, button markup, delegated click handler, pending-request guard, disabled `Сохраняем…` state, reload after success, and reload plus visible error after `409`.

Implement the same two transitions in the in-memory demo API so local demonstrations remain usable.

- [ ] **Step 4: Add accessible styling**

Style `.courier-order__action` with at least 52 px height, full width, black primary treatment, disabled state, and pressed feedback.

- [ ] **Step 5: Verify GREEN and commit**

```powershell
node --test tests/courier-state.test.mjs tests/courier-api.test.mjs
git add courier-state.js courier-api.js courier.js courier.css tests/courier-state.test.mjs tests/courier-api.test.mjs
git commit -m "feat: add courier delivery controls"
```

### Task 4: Customer copy and immutable PWA cache

**Files:**
- Modify: `order-state.js`
- Modify: `tests/order-state.test.mjs`
- Modify: `courier.html`
- Modify: `courier-sw.js`
- Modify: `tests/pwa-assets.test.mjs`

**Interfaces:**
- Produces: customer-visible `Передан курьеру` for `courier` and `Доставлен` for completed delivery.
- Produces: coherent versioned courier asset graph and a new service-worker cache name.

- [ ] **Step 1: Write failing customer-copy tests**

Assert delivery presentation titles for `courier` and `completed`, and assert the final progress label is `Передан курьеру` before completion and `Доставлен` after completion.

- [ ] **Step 2: Write the failing cache-graph test**

Assert that `courier.html`, `courier.js`, their changed imports, and `courier-sw.js` use one new cache version and do not reference the prior unversioned changed assets.

- [ ] **Step 3: Verify RED**

Run focused order and PWA tests. Expected: old copy and unversioned asset graph fail.

- [ ] **Step 4: Implement copy and cache version**

Use delivery-aware completed copy, version all changed courier assets consistently, and increment the courier shell cache name.

- [ ] **Step 5: Verify GREEN and commit**

```powershell
node --test tests/order-state.test.mjs tests/pwa-assets.test.mjs
git add order-state.js courier.html courier-sw.js tests/order-state.test.mjs tests/pwa-assets.test.mjs
git commit -m "fix: align delivery tracking and courier cache"
```

### Task 5: Full verification and stage rollout

**Files:**
- No new source files expected.
- Verify deployment files remain scoped to stage.

**Interfaces:**
- Consumes: completed commits from Tasks 1–4.
- Produces: verified local build and stage-only rollout.

- [ ] **Step 1: Run all local suites**

```powershell
pnpm test
pnpm --dir server test
git diff --check
git status --short
```

Expected: all tests pass, diff check is clean, worktree is clean.

- [ ] **Step 2: Run stage deployment**

Deploy the current committed worktree to `/opt/pivdoner`, rebuild/recreate only the Pivnoy Doner stage containers required by the changed static client/API, and leave the main domain and old bot untouched.

- [ ] **Step 3: Run stage smoke checks**

Verify health, kitchen ready delivery state, courier acceptance, courier completion, customer delivered copy, and review availability. Verify one stale/double action returns safe conflict behavior without duplicating a status transition.

- [ ] **Step 4: Record the final evidence**

Report test counts, deployed commit, health result, and remaining external work (if any) without exposing credentials or customer data.
