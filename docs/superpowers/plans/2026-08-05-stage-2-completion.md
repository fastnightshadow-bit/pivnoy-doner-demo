# Stage 2 Completion Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Завершить демонстрационный второй этап «Пивного Донера»: платные множественные соусы, общий режим кухни, расчёт времени для двух поваров, Павел в интерфейсе курьера и проверенная PWA-публикация.

**Architecture:** Существующее статическое приложение на ES-модулях сохраняется без фреймворка. Чистая бизнес-логика остаётся в небольших модулях, состояние демонстрации хранится через текущие адаптеры/localStorage, а DOM-слой только отображает результат. Старое поле `sauce` читается как массив `sauces`, чтобы не ломать сохранённую корзину.

**Tech Stack:** HTML, CSS, JavaScript ES modules, Node.js `node:test`, Sharp для PWA-иконок, GitHub Pages.

## Global Constraints

- Клиентский интерфейс остаётся mobile-first и сохраняет действующую дизайн-систему.
- Кухня проверяется на реальном Topdevice TD3: 10,1″, 1280×800, Android 13, 4 ГБ RAM.
- Кухня также должна сохранять рабочий режим при ширине 768 px.
- Каждый соус стоит ровно 50 ₽; по умолчанию не выбран ни один.
- Можно выбрать несколько соусов.
- На кухне один общий вход и подпись действий «Кухня»; выбора повара нет.
- Расчёт: 2 повара × 3 шавермы за 8 минут = 6 шаверм за один 8-минутный цикл.
- Временный курьер демонстрации — Павел.
- Административная панель, настоящая БД, ЮKassa и продакшен-сервер не входят в эту реализацию.
- Не добавлять новые runtime-зависимости.

---

## File Map

- `product-config.js`: каталог соусов, разрешённые опции и расчёт цены блюда.
- `cart-state.js`: нормализация строк корзины, совместимость `sauce` → `sauces`, идентичность позиции.
- `product-sheet.js`: множественный выбор соусов и передача в корзину.
- `product-sheet.css`: компактные карточки соусов варианта A.
- `cart.js`, `order-state.js`, `order.js`, `kitchen-presentation.js`: сквозное отображение массива соусов.
- `preparation-time.js`: новая чистая функция расчёта партий кухни.
- `checkout.js`, `kitchen-fixtures.js`: использование расчёта в демонстрационном заказе и очереди.
- `kitchen-settings.js`: новое чистое состояние приёма заказов и стоп-листа.
- `kitchen-api.js`, `kitchen.js`, `kitchen.html`, `kitchen.css`: общий вход кухни и рабочая панель управления.
- `courier-api.js`, `courier.html`: Павел и скрытая подсказка PIN.
- `tests/product-options.test.mjs`: платные множественные соусы и миграция.
- `tests/preparation-time.test.mjs`: граничные значения партий кухни.
- `tests/kitchen-settings.test.mjs`: стоп-лист и приём заказов.
- `tests/kitchen-api.test.mjs`: общий вход и подпись истории «Кухня».
- `tests/courier-api.test.mjs`: имя Павел.
- `tests/kitchen-presentation.test.mjs`: 1280×800 и 768 px.
- `tests/pwa-assets.test.mjs`: регрессия фирменных иконок.

---

### Task 1: Платная модель нескольких соусов

**Files:**
- Modify: `tests/product-options.test.mjs`
- Modify: `product-config.js`
- Modify: `cart-state.js`
- Modify: `cart-storage.js`
- Modify: `order-state.js`
- Modify: `kitchen-presentation.js`

**Interfaces:**
- Produces: `PRODUCT_SAUCES[id] = { label: string, price: 50 }`.
- Produces: `calculateProductPrice(productId, { meat, size, addons, sauces }) -> number`.
- Produces: `createCartLine(input) -> CartLine` with `sauces: string[]`.
- Consumes legacy input: `sauce: string`; converts it to `sauces: [string]`.

- [ ] **Step 1: Replace old sauce tests with failing multiple-sauce tests**

```js
test('каждый соус стоит 50 ₽ и по умолчанию ничего не выбрано', () => {
  assert.ok(Object.values(PRODUCT_SAUCES).every(({ price }) => price === 50));
  const base = { meat: 'chicken', size: 'standard' };
  assert.equal(calculateProductPrice('classic-shawarma', base), 300);
  assert.equal(calculateProductPrice('classic-shawarma', { ...base, sauces: ['tasty', 'chili'] }), 400);
});

test('старая строка sauce преобразуется в sauces и участвует в подписи', () => {
  const migrated = createCartLine({ productId: 'doner', name: 'Донер', unitPrice: 400, sauce: 'Тейсти' });
  const modern = createCartLine({ productId: 'doner', name: 'Донер', unitPrice: 400, sauces: ['Тейсти'] });
  assert.deepEqual(migrated.sauces, ['Тейсти']);
  assert.equal(migrated.lineId, modern.lineId);
});
```

- [ ] **Step 2: Run focused tests and confirm failure**

Run: `npm test -- --test-name-pattern="соус|sauce"`

Expected: FAIL because sauces have no price, only one sauce is stored, and defaults are still active.

- [ ] **Step 3: Implement sauce pricing and normalization**

```js
export const PRODUCT_SAUCES = Object.freeze({
  tasty: Object.freeze({ label: 'Тейсти', price: 50 }),
  burger: Object.freeze({ label: 'Бургерный', price: 50 }),
  cheese: Object.freeze({ label: 'Сырный', price: 50 }),
  bbq: Object.freeze({ label: 'Барбекю', price: 50 }),
  truffle: Object.freeze({ label: 'Трюфель', price: 50 }),
  ketchup: Object.freeze({ label: 'Кетчуп', price: 50 }),
  curry: Object.freeze({ label: 'Карри', price: 50 }),
  blueCheese: Object.freeze({ label: 'Блю чиз', price: 50 }),
  mustard: Object.freeze({ label: 'Горчица', price: 50 }),
  chili: Object.freeze({ label: 'Чили', price: 50 }),
});

const normalizeSauces = (sauces, legacySauce = '') =>
  [...new Set((Array.isArray(sauces) ? sauces : legacySauce ? [legacySauce] : []).filter(Boolean))].sort();

export const calculateProductPrice = (productId, { meat = 'default', size = 'single', addons = [], sauces = [] } = {}) => {
  const configuration = getProductConfiguration(productId);
  const basePrice = configuration?.prices?.[meat]?.[size];
  if (!Number.isFinite(basePrice)) return 0;
  const allowedSauces = new Set(configuration.sauces);
  const allowedAddons = new Set(configuration.addons);
  const addonTotal = [...new Set(addons)]
    .filter((id) => allowedAddons.has(id))
    .reduce((total, id) => total + (PRODUCT_ADDONS[id]?.price ?? 0), basePrice);
  const sauceTotal = [...new Set(sauces)]
    .filter((id) => allowedSauces.has(id))
    .reduce((total, id) => total + PRODUCT_SAUCES[id].price, 0);
  return addonTotal + sauceTotal;
};
```

Remove `defaultSauce` from configurations. Normalize `sauces` in cart and order items and make the sorted list part of `getLineSignature`. In `getKitchenItemOptions`, append one string `Соусы: Тейсти, Чили`; continue reading legacy `item.sauce`.

- [ ] **Step 4: Run focused tests**

Run: `npm test -- --test-name-pattern="соус|sauce"`

Expected: PASS.

- [ ] **Step 5: Commit domain changes**

```bash
git add product-config.js cart-state.js cart-storage.js order-state.js kitchen-presentation.js tests/product-options.test.mjs
git commit -m "feat: support multiple paid sauces"
```

---

### Task 2: Карточки соусов и сквозное отображение

**Files:**
- Modify: `tests/product-options.test.mjs`
- Modify: `product-sheet.js`
- Modify: `product-sheet.css`
- Modify: `cart.js`
- Modify: `order.js`

**Interfaces:**
- Consumes: selection `{ sauces: string[] }` from Task 1.
- Produces: buttons with `role="checkbox"`, `aria-checked`, `data-sheet-sauce`.

- [ ] **Step 1: Add failing markup and propagation tests**

```js
test('карточка блюда показывает платный множественный выбор без активного соуса', () => {
  const product = PRODUCTS.find(({ id }) => id === 'classic-shawarma');
  const markup = createProductSheetMarkup(product, { sauces: [] });
  assert.match(markup, /Соусы/);
  assert.match(markup, /Можно выбрать несколько/);
  assert.match(markup, /Тейсти[\s\S]*?\+50/);
  assert.doesNotMatch(markup, /role="radio"/);
});

test('два выбранных соуса сохраняются в заказе и видны кухне', () => {
  const order = normalizeOrder({ id: 'o1', number: '0001', createdAt: new Date().toISOString(), items: [{ name: 'Донер', sauces: ['Тейсти', 'Чили'] }] });
  assert.deepEqual(order.items[0].sauces, ['Тейсти', 'Чили']);
  assert.deepEqual(getKitchenItemOptions(order.items[0]), ['Соусы: Тейсти, Чили']);
});
```

- [ ] **Step 2: Run focused tests and confirm failure**

Run: `npm test -- --test-name-pattern="карточка блюда|видны кухне"`

Expected: FAIL because current UI is a single free radio sauce.

- [ ] **Step 3: Implement the approved A interaction**

Normalize sheet state to `sauces: []`. On click, toggle the clicked id:

```js
const next = new Set(state.selection.sauces);
if (next.has(id)) next.delete(id);
else next.add(id);
updateSelection({ sauces: [...next] });
```

Render each button as:

```html
<button type="button" role="checkbox" aria-checked="false" data-sheet-sauce="tasty">
  <span>Тейсти</span><small>+50 ₽</small>
</button>
```

Remove free default sauce from quick-add in `cart.js`. Render `Соусы: ...` in cart and order. Keep touch target at least 46 px and use dark-theme variables already present.

- [ ] **Step 4: Run product tests**

Run: `npm test -- --test-name-pattern="соус|карточка блюда|кухне"`

Expected: PASS.

- [ ] **Step 5: Commit UI changes**

```bash
git add product-sheet.js product-sheet.css cart.js order.js tests/product-options.test.mjs
git commit -m "feat: add paid sauce selector"
```

---

### Task 3: Алгоритм времени для двух поваров

**Files:**
- Create: `preparation-time.js`
- Create: `tests/preparation-time.test.mjs`
- Modify: `checkout.js`
- Modify: `kitchen-fixtures.js`

**Interfaces:**
- Produces: `countShawarmaUnits(items) -> number`.
- Produces: `calculatePreparationMinutes({ queuedUnits, incomingUnits, cooks = 2, unitsPerCook = 3, batchMinutes = 8 }) -> number`.
- Produces: `createPreparationEta(items, queuedItems = []) -> { min: number, max: number }`.

- [ ] **Step 1: Write failing capacity tests**

```js
test('два повара готовят до шести шаверм за восьмиминутный цикл', () => {
  assert.equal(calculatePreparationMinutes({ incomingUnits: 1, queuedUnits: 0 }), 8);
  assert.equal(calculatePreparationMinutes({ incomingUnits: 6, queuedUnits: 0 }), 8);
  assert.equal(calculatePreparationMinutes({ incomingUnits: 7, queuedUnits: 0 }), 16);
  assert.equal(calculatePreparationMinutes({ incomingUnits: 6, queuedUnits: 6 }), 16);
});

test('неизвестный или пустой заказ получает безопасный минимум', () => {
  assert.deepEqual(createPreparationEta([], []), { min: 8, max: 12 });
});
```

- [ ] **Step 2: Run test and confirm failure**

Run: `node --test tests/preparation-time.test.mjs`

Expected: FAIL because `preparation-time.js` does not exist.

- [ ] **Step 3: Implement batch calculation**

```js
const BATCH_CAPACITY = 2 * 3;
export const calculatePreparationMinutes = ({ queuedUnits = 0, incomingUnits = 0 } = {}) => {
  const total = Math.max(1, Math.ceil(Number(queuedUnits) || 0) + Math.ceil(Number(incomingUnits) || 0));
  return Math.ceil(total / BATCH_CAPACITY) * 8;
};
```

`countShawarmaUnits` recognizes product ids/names containing `shawarma`, `шаурма` or `шава` and multiplies by quantity. `createPreparationEta` returns `{ min: minutes, max: minutes + 4 }`. Use it in checkout with an empty local queue and in kitchen demo fixtures with cumulative active shawarma units; derive `promisedAt` from the computed minutes.

- [ ] **Step 4: Run capacity and checkout regression tests**

Run: `node --test tests/preparation-time.test.mjs tests/baseline.test.mjs`

Expected: PASS.

- [ ] **Step 5: Commit ETA changes**

```bash
git add preparation-time.js checkout.js kitchen-fixtures.js tests/preparation-time.test.mjs
git commit -m "feat: calculate kitchen preparation batches"
```

---

### Task 4: Общий вход кухни и рабочие настройки

**Files:**
- Create: `kitchen-settings.js`
- Create: `tests/kitchen-settings.test.mjs`
- Create: `tests/kitchen-api.test.mjs`
- Modify: `kitchen-api.js`
- Modify: `kitchen-fixtures.js`
- Modify: `kitchen.js`
- Modify: `kitchen.html`
- Modify: `kitchen.css`

**Interfaces:**
- Produces: `normalizeKitchenSettings(value) -> { acceptingOrders: boolean, stoppedProductIds: string[] }`.
- Produces demo API methods: `getSettings()` and `updateSettings(patch, operationId)`.
- Shared demo session: `{ employee: { id: 'kitchen', name: 'Кухня' }, shift: '2 повара' }`.

- [ ] **Step 1: Write failing shared-session and settings tests**

```js
test('демо-кухня использует один общий аккаунт', async () => {
  const api = createDemoKitchenApi({ delay: async () => {} });
  const session = await api.login('2468');
  assert.equal(session.employee.name, 'Кухня');
  assert.equal(session.shift, '2 повара');
});

test('настройки принимают только флаг приёма и уникальный стоп-лист', () => {
  assert.deepEqual(normalizeKitchenSettings({ acceptingOrders: false, stoppedProductIds: ['doner', 'doner'] }), {
    acceptingOrders: false,
    stoppedProductIds: ['doner'],
  });
});
```

- [ ] **Step 2: Run tests and confirm failure**

Run: `node --test tests/kitchen-api.test.mjs tests/kitchen-settings.test.mjs`

Expected: FAIL because kitchen still has personal demo employees and no settings API.

- [ ] **Step 3: Implement shared access and settings**

Replace demo employees with one record named `Кухня`. All status and cancellation history continues to use `session.name`, therefore new events are attributed to `Кухня`.

Add top-bar button `Управление` and a dialog containing:

```html
<label class="kitchen-setting-toggle">
  <span><strong>Приём заказов</strong><small>Новые заказы поступают на кухню</small></span>
  <input type="checkbox" data-accepting-orders />
</label>
<div data-stop-list></div>
```

The stop-list uses product names from `PRODUCTS`; toggles persist through demo API state. Disable controls until the demo API confirms the update, reuse operation ids, and show existing error toast/banner on failure. Remove «личный» from PIN copy, remove visible demo PIN text, replace `Сменить` with `Выйти`.

- [ ] **Step 4: Run kitchen tests**

Run: `node --test tests/kitchen-api.test.mjs tests/kitchen-settings.test.mjs`

Expected: PASS.

- [ ] **Step 5: Commit kitchen changes**

```bash
git add kitchen-settings.js kitchen-api.js kitchen-fixtures.js kitchen.js kitchen.html kitchen.css tests/kitchen-settings.test.mjs tests/kitchen-api.test.mjs
git commit -m "feat: add shared kitchen controls"
```

---

### Task 5: Павел в интерфейсе курьера и планшет Topdevice

**Files:**
- Modify: `tests/courier-api.test.mjs`
- Create: `tests/kitchen-presentation.test.mjs`
- Modify: `tests/pwa-assets.test.mjs`
- Modify: `courier-api.js`
- Modify: `courier.html`
- Modify: `kitchen.css`

**Interfaces:**
- Demo courier login returns `{ courier: { name: 'Павел' } }`.
- `getKitchenPresentation({ width: 1280, height: 800 })` returns tablet mode.

- [ ] **Step 1: Write failing identity and device tests**

```js
test('временный курьер — Павел', async () => {
  const api = createDemoCourierApi({ delay: async () => {} });
  assert.deepEqual(await api.login('5724'), { courier: { name: 'Павел' } });
});

test('Topdevice TD3 работает как планшет без масштабирования', () => {
  assert.deepEqual(getKitchenPresentation({ width: 1280, height: 800 }), { mode: 'tablet', scale: 1 });
  assert.deepEqual(getKitchenPresentation({ width: 768, height: 1024 }), { mode: 'tablet', scale: 1 });
});

test('кухонная PWA использует фирменные квадратные иконки', () => {
  assert.deepEqual(readPngDimensions('assets/kitchen/icon-192.png'), { width: 192, height: 192 });
  assert.deepEqual(readPngDimensions('assets/kitchen/icon-512.png'), { width: 512, height: 512 });
});
```

- [ ] **Step 2: Run tests and confirm courier failure**

Run: `node --test tests/courier-api.test.mjs tests/kitchen-presentation.test.mjs`

Expected: courier test FAIL with current name `Курьер`; device assertions document the supported sizes.

- [ ] **Step 3: Implement identity and lightweight tablet polish**

Return `Павел` from the demo courier login, remove the visible demo PIN hint from `courier.html`, and ensure the kitchen at 1280×800 keeps four equal Kanban columns, 48 px controls, compact topbar and no scaling or expensive blur animation.

- [ ] **Step 4: Run focused tests**

Run: `node --test tests/courier-api.test.mjs tests/kitchen-presentation.test.mjs tests/pwa-assets.test.mjs`

Expected: PASS.

- [ ] **Step 5: Commit courier/device changes**

```bash
git add courier-api.js courier.html kitchen.css tests/courier-api.test.mjs tests/kitchen-presentation.test.mjs tests/pwa-assets.test.mjs
git commit -m "fix: tailor demo for owner and kitchen tablet"
```

---

### Task 6: Полная проверка и публикация

**Files:**
- Verify only: all application and test files.
- Modify only if a verified regression is found.

**Interfaces:**
- Consumes all prior tasks.
- Produces a tested GitHub Pages demonstration.

- [ ] **Step 1: Run the complete automated suite**

Run: `npm test`

Expected: all tests PASS with zero failures.

- [ ] **Step 2: Run repository checks**

Run: `git diff --check`

Expected: no whitespace errors.

- [ ] **Step 3: Perform browser QA**

Check these paths locally:

- `home.html` at 390×844 in light and dark themes;
- product sheet with zero, one and two sauces; verify +0, +50 and +100 ₽;
- `cart.html`, `checkout.html`, `order.html` with two sauces visible;
- `kitchen.html?demo=1` at 1280×800 and 768×1024; verify shared login, settings, stop-list, columns and order details;
- `courier.html?demo=1` at 390×844; verify Павел, ETA, address and tap-to-call;
- browser/PWA icons for client, kitchen and courier.

- [ ] **Step 4: Commit any QA-only fixes**

Run `git status --short`, inspect every tracked modification, then run `git add -u` and `git commit -m "fix: polish stage 2 demo"` only when QA produced a real tracked-file correction.

Skip this commit when QA finds no issue.

- [ ] **Step 5: Publish through GitHub review flow**

```bash
git push -u origin agent/stage-2-completion
gh pr create --fill
gh pr merge --merge --delete-branch
```

Expected: the merge reaches `main` and GitHub Pages deploys the updated demo.

- [ ] **Step 6: Verify public Pages**

Open `https://fastnightshadow-bit.github.io/pivnoy-doner-demo/` and confirm that the public HTML contains the new sauce copy and that client, kitchen and courier entry points return HTTP 200.
