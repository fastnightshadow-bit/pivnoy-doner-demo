# PWA, Delivery Rules, Sauces and Courier Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add branded install icons, sauce selection, validated delivery pricing/hours, and a mobile courier demo PWA to the latest owner demo without regressing existing flows.

**Architecture:** Keep the existing static ES-module application. Add small pure modules for delivery policy and courier presentation, reuse the existing product/cart/order models, and keep server-dependent behavior behind a courier API adapter so it can later be replaced by RUVDS endpoints.

**Tech Stack:** HTML5, CSS, vanilla JavaScript ES modules, Web App Manifest, Service Worker, Node.js built-in test runner, Sharp for deterministic logo-derived PNG assets.

## Global Constraints

- Mobile client remains optimized for 390 px; kitchen remains optimized for 1024 px landscape.
- Original logo artwork must not be redrawn or semantically changed.
- Sauce selection is single-choice and included in the item price.
- Delivery costs 200 ₽, is free from 2 000 ₽, has a 300 ₽ minimum, and is accepted 11:30–22:30.
- Courier UI exposes only readiness, delivery address, and clickable contact plus minimal order identity.
- Production secrets and PIN codes must not enter client code or Git.

---

### Task 1: Restore a deterministic test and local server toolchain

**Files:**
- Create: `package.json`
- Create: `scripts/serve.cjs`
- Create: `tests/helpers.mjs`
- Test: `tests/baseline.test.mjs`

**Interfaces:**
- Produces: `npm test`, `npm run dev`, `readText(path)`, `extractJson(path)`.

- [ ] Write a baseline test that imports current state modules and verifies core HTML files exist.
- [ ] Run the test and confirm it fails because the test toolchain is absent.
- [ ] Add the minimal package and server files.
- [ ] Run the test and confirm it passes.
- [ ] Commit the toolchain.

### Task 2: Generate and connect branded install assets

**Files:**
- Create: `scripts/build-app-icons.mjs`
- Create: `assets/app/favicon-16.png`
- Create: `assets/app/favicon-32.png`
- Create: `assets/app/apple-touch-icon.png`
- Create: `assets/app/icon-192.png`
- Create: `assets/app/icon-512.png`
- Create: `assets/app/icon-maskable-512.png`
- Create: `assets/courier/icon-192.png`
- Create: `assets/courier/icon-512.png`
- Create: `client.webmanifest`
- Modify: `home.html`, `catalog.html`, `dish.html`, `cart.html`, `checkout.html`, `order.html`, `index.html`, `demo.webmanifest`
- Test: `tests/pwa-assets.test.mjs`

**Interfaces:**
- Produces: client manifest at `client.webmanifest`; reusable favicon head links; exact PNG sizes 16, 32, 180, 192, and 512.

- [ ] Write tests for manifest metadata, links on every client page, file existence and decoded PNG dimensions.
- [ ] Run tests and confirm failures identify the missing client icons and links.
- [ ] Add a Sharp script that composites the unchanged transparent logo on the approved light square and generates all sizes.
- [ ] Generate icons and add manifests/head links with a version query for cache invalidation.
- [ ] Run PWA tests and the full suite.
- [ ] Commit branded PWA assets.

### Task 3: Add sauce selection and fried-onion copy through the order flow

**Files:**
- Modify: `catalog-data.js`
- Modify: `product-config.js`
- Modify: `product-sheet.js`
- Modify: `product-sheet.css`
- Modify: `cart-state.js`
- Modify: `cart-storage.js`
- Modify: `cart.js`
- Modify: `checkout.js`
- Modify: `order-state.js`
- Modify: `kitchen-presentation.js`
- Test: `tests/product-sauces.test.mjs`
- Test: `tests/cart-sauce-identity.test.mjs`

**Interfaces:**
- Produces: `PRODUCT_SAUCES`, `getAvailableSauces(productId)`, selection property `sauce`, cart-line property `sauce`.
- Consumes: existing `calculateProductPrice`, cart normalization and order snapshot creation.

- [ ] Write failing tests for the ten sauces, `Жареный лук`, hot-dog copy, default sauce normalization, and distinct cart keys for different sauces.
- [ ] Run targeted tests and confirm expected failures.
- [ ] Add sauce metadata and thread `sauce` through product selection and cart normalization.
- [ ] Add an accessible single-choice sauce section to the product sheet.
- [ ] Render the chosen sauce in cart, checkout, active order and kitchen details using existing parameter lists.
- [ ] Run targeted tests and the full suite.
- [ ] Commit sauce and copy changes.

### Task 4: Implement central delivery policy and checkout enforcement

**Files:**
- Create: `delivery-policy.js`
- Modify: `checkout-state.js`
- Modify: `checkout.js`
- Modify: `checkout.html`
- Modify: `checkout.css`
- Test: `tests/delivery-policy.test.mjs`
- Test: `tests/checkout-delivery.test.mjs`

**Interfaces:**
- Produces: `DELIVERY_POLICY`, `calculateDeliveryFee(itemsTotal)`, `isDeliveryOrderingOpen(date)`, `getDeliveryAvailability({ itemsTotal, now })`.
- Consumes: item subtotal from `calculateCartSummary` before promo discount.

- [ ] Write failing boundary tests for 299/300 ₽, 1 999/2 000 ₽, 11:29/11:30 and 22:30/22:31.
- [ ] Run targeted tests and confirm expected failures.
- [ ] Implement the pure delivery policy module.
- [ ] Use it in checkout summary, validation and CTA state while leaving pickup unchanged.
- [ ] Add concise minimum/order-hours messaging and accessible disabled-state feedback.
- [ ] Run targeted tests and the full suite.
- [ ] Commit delivery rules.

### Task 5: Build the mobile courier demo PWA

**Files:**
- Create: `courier.html`
- Create: `courier.css`
- Create: `courier.js`
- Create: `courier-model.js`
- Create: `courier-api.js`
- Create: `courier-fixtures.js`
- Create: `courier-sw.js`
- Create: `courier.webmanifest`
- Modify: `index.html`
- Modify: `demo.css`
- Test: `tests/courier-model.test.mjs`
- Test: `tests/courier-ui.test.mjs`

**Interfaces:**
- Produces: `filterCourierOrders(orders)`, `formatReadyIn(order, now)`, `formatCourierAddress(order)`, `createDemoCourierApi()`.
- Consumes: normalized order shape compatible with `order-state.js` and future server API.

- [ ] Write failing tests proving only delivery orders appear and phone/address/readiness are formatted correctly.
- [ ] Run targeted tests and confirm missing module failures.
- [ ] Implement pure model helpers and a demo API adapter with explicit demo authentication boundaries.
- [ ] Build the mobile login, order list, empty/offline/error states and tap-to-call link.
- [ ] Add service worker, manifest, install metadata and notification permission only after user interaction.
- [ ] Add the courier entry to the owner walkthrough without exposing a PIN in page copy.
- [ ] Run targeted tests and the full suite.
- [ ] Commit courier PWA.

### Task 6: Integrated visual and regression verification

**Files:**
- Modify only files shown by evidence from verification.
- Create: `docs/superpowers/reviews/2026-08-05-pwa-delivery-courier-review.md`

**Interfaces:**
- Consumes: local HTTP server and all implemented UI routes.
- Produces: verified client, kitchen, checkout and courier screenshots/notes.

- [ ] Start the local server and verify manifest/icon responses and MIME types.
- [ ] Inspect client home/product sheet/checkout at 390 px in light and dark themes.
- [ ] Inspect courier login/orders/offline states at 390 px and kitchen at 1024 px.
- [ ] Fix only evidenced regressions, adding a failing test first when behavior changes.
- [ ] Run the complete test suite one final time.
- [ ] Record the review result and commit verification fixes.
