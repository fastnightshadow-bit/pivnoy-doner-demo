# Add-ons, Sauces, Android, and Mobile Kitchen Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add repeatable paid add-ons, a text-only sauce category, snack-only sauce customization, shared PIN `0000`, complete courier address details, and a phone-ready kitchen while preserving the approved tablet and client designs.

**Architecture:** Introduce one small quantity-normalization module used by product pricing, cart signatures, order presentation, and migration. Keep standalone sauces as ordinary quick-add catalog products, while product-level sauce selection is enabled only for snacks. Add a mobile status selector to the existing kitchen Kanban; CSS shows one queue on phones and all four columns on tablets.

**Tech Stack:** Static HTML, CSS, ES modules, Local Storage, Web App Manifest, Service Worker, Node.js built-in test runner.

## Global Constraints

- Do not change the approved brand style or desktop/tablet Kanban behavior.
- Sauce catalog items have no photographs and cost exactly 50 ₽.
- Product-level sauce selection exists only for category `snacks`.
- Add-on quantities are integers from 0 through 5.
- Kitchen and courier demo PIN is exactly `0000` and is not printed in the UI.
- Phone breakpoint for the kitchen is `640px`; tablet Kanban starts at `641px`.
- Preserve old Local Storage carts by treating each legacy array add-on as quantity `1`.

---

### Task 1: Quantity Model and Cart Migration

**Files:**
- Create: `option-quantities.js`
- Modify: `product-config.js`
- Modify: `cart-state.js`
- Modify: `cart-storage.js`
- Test: `tests/product-options.test.mjs`

**Interfaces:**
- Produces: `normalizeOptionQuantities(value, max = 5) -> Record<string, number>`.
- Produces: `formatOptionQuantities(value) -> string[]`, where quantity `2` becomes `"Жареный лук ×2"`.
- `calculateProductPrice(productId, selection)` consumes `selection.addons` as an object keyed by add-on id.
- `createCartLine(input)` stores `addons` as an object keyed by display label.

- [ ] **Step 1: Write failing tests for repeated add-ons and legacy migration**

```js
test('две порции жареного лука увеличивают цену на 100 ₽', () => {
  assert.equal(calculateProductPrice('classic-shawarma', {
    meat: 'chicken', size: 'standard', addons: { onion: 2 },
  }), 400);
});

test('количество добавок входит в подпись позиции', () => {
  const one = createCartLine({ productId: 'classic-shawarma', unitPrice: 350, addons: { 'Жареный лук': 1 } });
  const two = createCartLine({ productId: 'classic-shawarma', unitPrice: 400, addons: { 'Жареный лук': 2 } });
  assert.notEqual(one.lineId, two.lineId);
  assert.deepEqual(two.addons, { 'Жареный лук': 2 });
});

test('старый массив добавок мигрирует как одна порция', () => {
  const storage = { getItem: () => JSON.stringify([{ productId: 'classic-shawarma', unitPrice: 350, addons: ['Сыр', 'Жареный лук'] }]) };
  assert.deepEqual(loadCart(storage)[0].addons, { 'Жареный лук': 1, 'Сыр': 1 });
});
```

- [ ] **Step 2: Run the focused test and verify failure**

Run: `node --test tests/product-options.test.mjs`

Expected: FAIL because arrays are still deduplicated and object quantities are not priced.

- [ ] **Step 3: Implement normalized quantities**

```js
export const normalizeOptionQuantities = (value, max = 5) => {
  const entries = Array.isArray(value)
    ? value.map((id) => [id, 1])
    : Object.entries(value && typeof value === 'object' ? value : {});
  return Object.fromEntries(entries
    .map(([id, quantity]) => [String(id), Math.min(max, Math.max(0, Math.floor(Number(quantity) || 0)))])
    .filter(([id, quantity]) => id && quantity > 0)
    .sort(([left], [right]) => left.localeCompare(right, 'ru')));
};
```

Use the normalized object for price multiplication, cart line signatures, and cart migration.

- [ ] **Step 4: Run the focused tests and verify pass**

Run: `node --test tests/product-options.test.mjs`

Expected: PASS.

- [ ] **Step 5: Commit the quantity model**

```bash
git add option-quantities.js product-config.js cart-state.js cart-storage.js tests/product-options.test.mjs
git commit -m "feat: support repeated paid add-ons"
```

### Task 2: Text-only Sauce Category and Snack-only Sauce Selection

**Files:**
- Modify: `catalog-data.js`
- Modify: `product-config.js`
- Modify: `home-menu.js`
- Modify: `home.js`
- Modify: `home.css`
- Modify: `product-sheet.js`
- Modify: `product-sheet.css`
- Test: `tests/product-options.test.mjs`

**Interfaces:**
- Adds catalog category `{ id: 'sauces', label: 'Соусы', icon: 'sauce' }`.
- Adds ten products with `category: 'sauces'`, `price: 50`, `textOnly: true`, and `quickAdd: true`.
- `getProductConfiguration(productId).sauces` is the full sauce id list only when the product category is `snacks`; it is empty otherwise.
- `createMenuProductCard(product, quantity)` emits `.menu-product--text` for text-only sauce rows.

- [ ] **Step 1: Write failing catalog and configuration tests**

```js
test('каталог содержит текстовую категорию соусов', () => {
  assert.ok(CATEGORIES.some(({ id }) => id === 'sauces'));
  const sauces = PRODUCTS.filter(({ category }) => category === 'sauces');
  assert.equal(sauces.length, 10);
  assert.ok(sauces.every(({ image, price, textOnly }) => !image && price === 50 && textOnly));
});

test('выбор соуса доступен только для закусок', () => {
  assert.deepEqual(getProductConfiguration('nuggets').sauces, Object.keys(PRODUCT_SAUCES));
  assert.deepEqual(getProductConfiguration('classic-shawarma').sauces, []);
  assert.deepEqual(getProductConfiguration('doner').sauces, []);
});
```

- [ ] **Step 2: Run the test and verify failure**

Run: `node --test tests/product-options.test.mjs`

Expected: FAIL because no sauce category exists and all products currently expose sauces.

- [ ] **Step 3: Add sauce products and quick-add text rows**

Implement ten catalog products using ids `sauce-tasty`, `sauce-burger`, `sauce-cheese`, `sauce-bbq`, `sauce-truffle`, `sauce-ketchup`, `sauce-curry`, `sauce-blue-cheese`, `sauce-mustard`, and `sauce-chili`. In `home.js`, `data-quick-add` creates a plain cart line without opening the product sheet. Use the existing quantity control after the first addition.

- [ ] **Step 4: Restrict product-level sauce controls to snacks**

```js
const sauces = product.category === 'snacks' ? ALL_SAUCES : Object.freeze([]);
```

Keep the current multi-select paid sauce UI for snack sheets; render only text, price, and selection state.

- [ ] **Step 5: Run focused tests and verify pass**

Run: `node --test tests/product-options.test.mjs`

Expected: PASS.

- [ ] **Step 6: Commit sauce behavior**

```bash
git add catalog-data.js product-config.js home-menu.js home.js home.css product-sheet.js product-sheet.css tests/product-options.test.mjs
git commit -m "feat: add text-only sauces for catalog and snacks"
```

### Task 3: Add-on Steppers and Order Presentation

**Files:**
- Modify: `product-sheet.js`
- Modify: `product-sheet.css`
- Modify: `cart.js`
- Modify: `order.js`
- Modify: `order-state.js`
- Modify: `kitchen-presentation.js`
- Test: `tests/product-options.test.mjs`

**Interfaces:**
- Product sheet buttons use `data-sheet-addon-change="addonId"` and `data-delta="-1|1"`.
- Selection stores add-on ids and quantities as an object.
- Cart, active order, and kitchen show `formatOptionQuantities(line.addons)`.

- [ ] **Step 1: Write failing markup and presentation tests**

```js
test('карточка блюда показывает счётчик добавки', () => {
  const product = PRODUCTS.find(({ id }) => id === 'classic-shawarma');
  const markup = createProductSheetMarkup(product, { addons: { onion: 2 } });
  assert.match(markup, /data-sheet-addon-change="onion"/);
  assert.match(markup, /Жареный лук/);
  assert.match(markup, />2</);
});

test('кухня видит количество добавки', () => {
  assert.deepEqual(getKitchenItemOptions({ addons: { 'Жареный лук': 2 } }), ['Добавки: Жареный лук ×2']);
});
```

- [ ] **Step 2: Run and verify failure**

Run: `node --test tests/product-options.test.mjs`

Expected: FAIL because add-ons still render as checkboxes and presentation expects arrays.

- [ ] **Step 3: Replace add-on toggles with 44px stepper rows**

On click, compute `next = clamp(current + delta, 0, 5)`, update selection, keep scroll position, and pulse only the total price. Disable minus at `0` and plus at `5`.

- [ ] **Step 4: Update cart, order, and kitchen copy**

Use `formatOptionQuantities` everywhere. A single unit is `Сыр`; repeated units are `Жареный лук ×2`.

- [ ] **Step 5: Run focused tests and verify pass**

Run: `node --test tests/product-options.test.mjs`

Expected: PASS.

- [ ] **Step 6: Commit UI and presentation**

```bash
git add product-sheet.js product-sheet.css cart.js order.js order-state.js kitchen-presentation.js tests/product-options.test.mjs
git commit -m "feat: add quantity steppers to product extras"
```

### Task 4: Meat Subtabs Directly Below Shawarma

**Files:**
- Modify: `home.html`
- Modify: `home.css`
- Modify: `home-menu.js`
- Test: `tests/baseline.test.mjs`

**Interfaces:**
- The heading order remains `h2[data-home-menu-title]` followed immediately by `[data-home-meat-switch]`.
- `createMeatSubgroupSwitch` continues to return two buttons with 44px tap targets.

- [ ] **Step 1: Write a failing structure/style test**

```js
test('мясные вкладки стоят отдельной строкой сразу под заголовком меню', () => {
  const html = readText('home.html');
  const css = readText('home.css');
  assert.match(html, /data-home-menu-title[\s\S]*data-home-meat-switch[\s\S]*data-home-menu/);
  assert.match(css, /\.menu-section__heading\s*\{[\s\S]*grid-template-columns:\s*1fr/);
  assert.match(css, /\.menu-meat-switch\s*\{[\s\S]*width:\s*100%/);
});
```

- [ ] **Step 2: Run and verify failure**

Run: `node --test tests/baseline.test.mjs`

Expected: FAIL because the heading is currently a side-by-side flex row.

- [ ] **Step 3: Make the switch a full-width row beneath the title**

Use a two-row grid for `.menu-section__heading`; keep compact maximum width on desktop but full width on mobile. Preserve both shawarma and doner behavior.

- [ ] **Step 4: Run and verify pass**

Run: `node --test tests/baseline.test.mjs`

Expected: PASS.

- [ ] **Step 5: Commit meat subtab placement**

```bash
git add home.html home.css home-menu.js tests/baseline.test.mjs
git commit -m "fix: surface meat tabs below menu heading"
```

### Task 5: Shared PIN and Complete Courier Address

**Files:**
- Modify: `kitchen-fixtures.js`
- Modify: `courier-api.js`
- Modify: `courier.js`
- Test: `tests/kitchen-api.test.mjs`
- Test: `tests/courier-api.test.mjs`
- Test: `tests/courier-state.test.mjs`

**Interfaces:**
- `createDemoKitchenApi().login('0000')` logs into `{ id: 'kitchen', name: 'Кухня' }`.
- `createDemoCourierApi().login('0000')` logs into the temporary courier account.
- Courier cards include street, entrance, floor, apartment, and intercom whenever supplied.

- [ ] **Step 1: Change tests to require the shared PIN and full address**

```js
assert.deepEqual(await kitchenApi.login('0000'), { employee: { id: 'kitchen', name: 'Кухня' }, shift: '2 повара' });
assert.deepEqual(await courierApi.login('0000'), { courier: { name: 'Павел' } });
assert.match(createCourierOrderMarkup(order), /этаж 4/);
assert.match(createCourierOrderMarkup(order), /кв\. 18/);
assert.match(createCourierOrderMarkup(order), /домофон 18К/);
```

- [ ] **Step 2: Run and verify failure**

Run: `node --test tests/kitchen-api.test.mjs tests/courier-api.test.mjs tests/courier-state.test.mjs`

Expected: FAIL because the current PINs are `2468` and `5724`.

- [ ] **Step 3: Set both demo logins to `0000` and complete delivery fixtures**

Keep PIN absent from `kitchen.html` and `courier.html`. Ensure every demo delivery includes explicit `floor`, `apartment`, and `intercom` values so the owner can verify the screen.

- [ ] **Step 4: Run and verify pass**

Run: `node --test tests/kitchen-api.test.mjs tests/courier-api.test.mjs tests/courier-state.test.mjs`

Expected: PASS.

- [ ] **Step 5: Commit authentication and courier details**

```bash
git add kitchen-fixtures.js courier-api.js courier.js tests/kitchen-api.test.mjs tests/courier-api.test.mjs tests/courier-state.test.mjs
git commit -m "feat: align worker PIN and courier address details"
```

### Task 6: Phone-ready Kitchen

**Files:**
- Modify: `kitchen.html`
- Modify: `kitchen.js`
- Modify: `kitchen.css`
- Test: `tests/kitchen-api.test.mjs`

**Interfaces:**
- Adds `[data-mobile-columns]` with buttons `[data-mobile-column="new|accepted|cooking|ready"]`.
- `state.activeMobileColumn` defaults to `new`.
- `renderBoard()` updates tab counts and `.is-current` on matching Kanban column.

- [ ] **Step 1: Write failing mobile kitchen contract tests**

```js
test('кухня имеет мобильный переключатель очередей', () => {
  const html = readText('kitchen.html');
  const css = readText('kitchen.css');
  assert.match(html, /data-mobile-columns/);
  assert.equal((html.match(/data-mobile-column=/g) || []).length, 4);
  assert.match(css, /@media \(max-width: 640px\)/);
  assert.match(css, /\.kanban-column:not\(\.is-current\)/);
});
```

- [ ] **Step 2: Run and verify failure**

Run: `node --test tests/kitchen-api.test.mjs`

Expected: FAIL because the kitchen currently retains four compressed columns on phones.

- [ ] **Step 3: Add mobile status selector and state**

Insert the status navigation between filter chips and the board. On click, set `state.activeMobileColumn`, update `aria-pressed`, mark the matching column `.is-current`, and preserve counts from `renderBoard()`.

- [ ] **Step 4: Add the `640px` responsive layout**

At phone width, show one full-width column, make the status selector horizontally scrollable and sticky, wrap the topbar into two rows, use `100dvh`, make the detail panel full-screen, and retain minimum 44px controls. At `641px` and above, hide the mobile selector and keep the four-column board unchanged.

- [ ] **Step 5: Run and verify pass**

Run: `node --test tests/kitchen-api.test.mjs`

Expected: PASS.

- [ ] **Step 6: Commit mobile kitchen behavior**

```bash
git add kitchen.html kitchen.js kitchen.css tests/kitchen-api.test.mjs
git commit -m "feat: adapt kitchen queue for phones"
```

### Task 7: Android and Regression Verification

**Files:**
- Modify if required by observed defects: `home.css`, `product-sheet.css`, `cart.css`, `checkout.css`, `courier.css`, `kitchen.css`
- Modify if required: `client.webmanifest`, `courier.webmanifest`, `kitchen.webmanifest`
- Test: `tests/pwa-assets.test.mjs`
- Test: `tests/baseline.test.mjs`

**Interfaces:**
- No new public data interfaces.
- All installed PWAs keep their existing names, start URLs, icons, and scopes.

- [ ] **Step 1: Run the full automated suite**

Run: `node --test tests/*.test.mjs`

Expected: all tests pass.

- [ ] **Step 2: Start the local server**

Run: `node scripts/serve.cjs`

Expected: client, courier, and kitchen pages are reachable from the local network.

- [ ] **Step 3: Inspect Android phone widths**

Check widths `360×800`, `390×844`, and `412×915` for `home.html`, an open snack product sheet, `cart.html`, `checkout.html`, `courier.html?demo=1`, and `kitchen.html?demo=1`. Verify no horizontal overflow, fixed actions remain visible, input text is at least 16px, and controls are at least 44px.

- [ ] **Step 4: Inspect the kitchen tablet**

Check `1024×800` and `768×1024`. Verify four columns at 1024px, readable compact columns at 768px, and no mobile status selector above 640px.

- [ ] **Step 5: Repair only defects found in verification and rerun tests**

Run: `node --test tests/*.test.mjs`

Expected: all tests pass after any CSS or manifest correction.

- [ ] **Step 6: Commit verified Android compatibility**

```bash
git add home.css product-sheet.css cart.css checkout.css courier.css kitchen.css client.webmanifest courier.webmanifest kitchen.webmanifest tests
git commit -m "fix: harden client and worker PWAs for Android"
```

### Task 8: Final Review

**Files:**
- Review: all files changed in Tasks 1–7

**Interfaces:**
- Confirms the approved design and all data contracts.

- [ ] **Step 1: Review the diff for unrelated visual or product changes**

Run: `git diff origin/main...HEAD --stat` and `git diff origin/main...HEAD`

Expected: only approved add-on, sauce, PIN, courier, kitchen, Android, test, and documentation changes.

- [ ] **Step 2: Run final tests**

Run: `node --test tests/*.test.mjs`

Expected: all tests pass with zero failures.

- [ ] **Step 3: Record the final local URLs**

Client: `http://127.0.0.1:4173/home.html`

Courier: `http://127.0.0.1:4173/courier.html?demo=1`

Kitchen: `http://127.0.0.1:4173/kitchen.html?demo=1`
