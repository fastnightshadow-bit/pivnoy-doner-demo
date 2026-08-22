# Kiosk Ordering Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Создать отдельное вертикальное Android-веб-приложение стойки самообслуживания, которое использует существующие меню, настройки блюд, стоп-лист, заказы и кухню «Пивного Донера».

**Architecture:** Стойка остаётся статическим приложением на HTML/CSS/ES modules и размещается на `kiosk.pivdoner.ru`. Чистая логика экранов, сессии и платежей отделяется от DOM, существующие `catalog-data.js`, `product-config.js` и `cart-state.js` переиспользуются, а сервер и будущий физический терминал подключаются через небольшие адаптеры. До выбора модели терминала карточная оплата работает через детерминированный demo-адаптер; публичный интерфейс и API-контракт при этом остаются окончательными.

**Tech Stack:** HTML5, CSS, JavaScript ES modules, Web App Manifest, Service Worker, Server-Sent Events, Node.js `node:test`, Sharp для PWA-иконок.

**Spec:** `docs/superpowers/specs/2026-08-23-kiosk-ordering-design.md`

## Global Constraints

- Основное устройство: вертикальный Android-планшет.
- Публичный адрес: `https://kiosk.pivdoner.ru/`.
- Приложение запускается во весь экран в kiosk/single-app mode.
- Визуальный стиль: тёплый светлый фон, почти чёрный текст, красный только для главных действий и выбранных состояний.
- Стартовый экран содержит одну кнопку «Начать заказ» и не содержит элементов оплаты.
- Способ получения на стойке: только «Здесь» или «С собой»; доставка не показывается.
- Меню, цены, конфигурации, стоп-лист и состояние приёма заказов берутся из существующей системы.
- Оплата картой и по QR-коду всегда показывается отдельными полноэкранными шагами.
- Секреты оплаты находятся только на сервере; браузер не хранит платёжные данные.
- Пустая корзина сбрасывается после 30 секунд бездействия.
- Непустая корзина через 60 секунд бездействия показывает «Продолжить заказ?», а ещё через 10 секунд очищается.
- После успешной оплаты экран подтверждения показывается 10 секунд, затем стойка полностью очищает сессию.
- Новые runtime-зависимости не добавлять.
- Точную интеграцию физического терминала не реализовывать до выбора оборудования; использовать интерфейс адаптера из Task 6.

---

## File Map

- `kiosk.html`: единая HTML-оболочка и доступные контейнеры экранов.
- `kiosk.css`: портретная сетка, экранные состояния, компоненты и адаптация к размерам Android-планшета.
- `kiosk.js`: связывание состояния, DOM, API, оплаты и таймеров.
- `kiosk-state.js`: чистая машина экранов и переходов.
- `kiosk-session.js`: бездействие, предупреждение и безопасная очистка.
- `kiosk-api.js`: production/demo API меню, стоп-листа, заказа и SSE.
- `kiosk-fixtures.js`: детерминированные ответы только для локальной демонстрации.
- `kiosk-payment.js`: общий интерфейс карточной и QR-оплаты без привязки к модели терминала.
- `kiosk-presentation.js`: чистое HTML-представление карточек, корзины и итоговых экранов.
- `kiosk.webmanifest`: установка стойки как PWA.
- `kiosk-sw.js`: безопасное кэширование статических файлов без кэширования `/api/`.
- `assets/kiosk/icon-192.png`, `assets/kiosk/icon-512.png`, `assets/kiosk/icon-maskable-512.png`: фирменные иконки стойки.
- `tests/kiosk-state.test.mjs`: разрешённые переходы и полный сброс.
- `tests/kiosk-session.test.mjs`: таймеры бездействия.
- `tests/kiosk-api.test.mjs`: API-контракт, SSE и идемпотентность.
- `tests/kiosk-payment.test.mjs`: карта, QR, повторная проверка и ошибки.
- `tests/kiosk-ui.test.mjs`: обязательные элементы, тексты и размеры касаний.
- `tests/kiosk-pwa.test.mjs`: manifest, иконки и правила service worker.
- `tests/baseline.test.mjs`: наличие нового публичного экрана.
- `scripts/build-app-icons.mjs`: генерация kiosk-иконок из существующего логотипа.
- `docs/kiosk-api-contract.md`: точный контракт, который должен предоставить production backend.

---

### Task 1: Машина экранов и состояние заказа

**Files:**
- Create: `kiosk-state.js`
- Create: `tests/kiosk-state.test.mjs`

**Interfaces:**
- Produces: `KIOSK_SCREENS: readonly string[]`.
- Produces: `createKioskState() -> KioskState`.
- Produces: `reduceKioskState(state, event) -> KioskState`.
- Produces: `resetKioskState() -> KioskState`.
- `KioskState = { screen, fulfillment, lines, selectedProductId, order, payment, error }`.
- Consumes: existing cart lines compatible with `createCartLine()` from `cart-state.js`.

- [ ] **Step 1: Write failing transition tests**

```js
test('публичный сценарий проходит только по разрешённым экранам', () => {
  let state = createKioskState();
  state = reduceKioskState(state, { type: 'START' });
  assert.equal(state.screen, 'fulfillment');
  state = reduceKioskState(state, { type: 'SET_FULFILLMENT', value: 'dine-in' });
  assert.equal(state.screen, 'catalog');
  state = reduceKioskState(state, { type: 'OPEN_CART' });
  assert.equal(state.screen, 'cart');
  state = reduceKioskState(state, { type: 'OPEN_PAYMENT_METHOD' });
  assert.equal(state.screen, 'payment-method');
});

test('полный сброс не оставляет данные предыдущего посетителя', () => {
  const dirty = {
    ...createKioskState(),
    screen: 'success',
    fulfillment: 'takeaway',
    lines: [{ lineId: 'x', quantity: 2 }],
    order: { id: 'order-1', number: '24' },
  };
  assert.deepEqual(resetKioskState(), reduceKioskState(dirty, { type: 'RESET' }));
});
```

- [ ] **Step 2: Run the focused test and confirm failure**

Run: `node --test tests/kiosk-state.test.mjs`

Expected: FAIL with `ERR_MODULE_NOT_FOUND` for `kiosk-state.js`.

- [ ] **Step 3: Implement the finite-state reducer**

```js
export const KIOSK_SCREENS = Object.freeze([
  'start', 'fulfillment', 'catalog', 'product', 'cart',
  'payment-method', 'card-payment', 'qr-payment', 'success', 'error',
]);

export const createKioskState = () => ({
  screen: 'start',
  fulfillment: '',
  lines: [],
  selectedProductId: '',
  order: null,
  payment: null,
  error: '',
});

export const resetKioskState = createKioskState;
```

Implement explicit cases for `START`, `SET_FULFILLMENT`, `OPEN_PRODUCT`, `CLOSE_PRODUCT`, `SET_LINES`, `OPEN_CART`, `OPEN_PAYMENT_METHOD`, `SELECT_PAYMENT`, `PAYMENT_SUCCEEDED`, `PAYMENT_FAILED`, `BACK`, and `RESET`. Invalid transitions return the unchanged object. `SELECT_PAYMENT` accepts only `card` or `qr`.

- [ ] **Step 4: Run the focused test**

Run: `node --test tests/kiosk-state.test.mjs`

Expected: PASS.

- [ ] **Step 5: Commit the state machine**

```bash
git add kiosk-state.js tests/kiosk-state.test.mjs
git commit -m "feat: add kiosk ordering state machine"
```

---

### Task 2: API-контракт каталога, стоп-листа и заказа

**Files:**
- Create: `kiosk-api.js`
- Create: `kiosk-fixtures.js`
- Create: `tests/kiosk-api.test.mjs`
- Create: `docs/kiosk-api-contract.md`

**Interfaces:**
- Produces: `createKioskApi({ baseUrl = '/api/kiosk', fetchImpl, eventSourceFactory })`.
- Produces: `createDemoKioskApi({ delay, now })`.
- Produces methods: `getBootstrap()`, `createOrder(payload, operationId)`, `subscribe(onEvent, onConnection)`.
- `getBootstrap() -> { products, settings, serverTime }`.
- `settings = { acceptingOrders, stoppedProductIds, stoppedMeatIds, stoppedSauceIds, stoppedAddonIds }`.
- `createOrder() -> { order: { id, number, status, total }, serverTime }`.

- [ ] **Step 1: Write failing request and demo tests**

```js
test('production API отправляет заказ один раз с ключом операции', async () => {
  const calls = [];
  const api = createKioskApi({
    fetchImpl: async (url, options) => {
      calls.push({ url, options });
      return new Response(JSON.stringify({ order: { id: 'o1', number: '24', status: 'pending_payment', total: 760 } }), { status: 200 });
    },
  });
  await api.createOrder({ fulfillment: 'takeaway', lines: [] }, 'op-1');
  assert.equal(calls[0].url, '/api/kiosk/orders');
  assert.equal(calls[0].options.headers['Idempotency-Key'], 'op-1');
});

test('demo bootstrap использует существующее меню и полный стоп-лист', async () => {
  const result = await createDemoKioskApi({ delay: async () => {} }).getBootstrap();
  assert.ok(result.products.length > 0);
  assert.deepEqual(result.settings.stoppedProductIds, []);
  assert.equal(result.settings.acceptingOrders, true);
});
```

- [ ] **Step 2: Run the API test and confirm failure**

Run: `node --test tests/kiosk-api.test.mjs`

Expected: FAIL because the adapters do not exist.

- [ ] **Step 3: Implement the adapters and exact server contract**

Production routes:

```text
GET  /api/kiosk/bootstrap
POST /api/kiosk/orders
GET  /api/kiosk/events
```

`POST /orders` receives:

```json
{
  "source": "kiosk",
  "fulfillment": "dine-in",
  "lines": [{ "productId": "classic-shawarma", "meat": "chicken", "size": "standard", "quantity": 1 }]
}
```

The adapter must use `credentials: 'include'`, JSON headers, and `Idempotency-Key`. The demo adapter imports `PRODUCTS`, returns normalized empty stop-lists, stores operation results by idempotency key, and emits `catalog.updated` and `settings.updated` through its subscription.

Document request and response bodies, HTTP 400/401/409/422/503 behavior, and these SSE events in `docs/kiosk-api-contract.md`:

```json
{ "type": "settings.updated", "settings": {} }
{ "type": "catalog.updated", "products": [] }
{ "type": "order.updated", "order": {} }
```

- [ ] **Step 4: Run the API tests**

Run: `node --test tests/kiosk-api.test.mjs`

Expected: PASS.

- [ ] **Step 5: Commit the API boundary**

```bash
git add kiosk-api.js kiosk-fixtures.js tests/kiosk-api.test.mjs docs/kiosk-api-contract.md
git commit -m "feat: define kiosk server API boundary"
```

---

### Task 3: Оболочка, старт и выбор способа получения

**Files:**
- Create: `kiosk.html`
- Create: `kiosk.css`
- Create: `kiosk.js`
- Create: `kiosk-presentation.js`
- Create: `tests/kiosk-ui.test.mjs`
- Modify: `tests/baseline.test.mjs`

**Interfaces:**
- Consumes: `createKioskState()`, `reduceKioskState()`, `createKioskApi()` and `createDemoKioskApi()`.
- Produces: `renderKiosk(state, context) -> string`.
- Produces DOM actions: `[data-kiosk-start]`, `[data-kiosk-fulfillment]`, `[data-kiosk-back]`.

- [ ] **Step 1: Write failing shell and copy tests**

```js
test('стойка имеет отдельную страницу и только одну кнопку на старте', () => {
  const html = readText('kiosk.html');
  assert.match(html, /data-kiosk-app/);
  assert.match(html, /kiosk\.webmanifest/);
  const start = renderKiosk(createKioskState(), { products: [], settings: { acceptingOrders: true } });
  assert.match(start, /Вкус, который хочется повторить/);
  assert.match(start, /Начать заказ/);
  assert.doesNotMatch(start, /Оплата картой/);
});

test('после старта показывается выбор Здесь или С собой', () => {
  const state = reduceKioskState(createKioskState(), { type: 'START' });
  const markup = renderKiosk(state, { products: [], settings: { acceptingOrders: true } });
  assert.match(markup, />Здесь</);
  assert.match(markup, />С собой</);
});
```

- [ ] **Step 2: Run tests and confirm failure**

Run: `node --test tests/kiosk-ui.test.mjs tests/baseline.test.mjs`

Expected: FAIL because kiosk files are absent.

- [ ] **Step 3: Build the accessible portrait shell**

`kiosk.html` uses one `<main data-kiosk-app aria-live="polite">`, viewport `width=device-width, initial-scale=1, viewport-fit=cover`, manifest and app icons. `kiosk.js` selects demo API only on localhost or `?demo=1`, loads bootstrap once, subscribes to updates, delegates clicks, and calls `renderKiosk`.

`renderKiosk` outputs a start section with the existing real hero asset `assets/mobile-home/hero-enhanced.webp`, logo and exactly one primary button. The fulfillment screen has two buttons at least 96 px high and a back button with an inline SVG chevron, not a text character.

Core size rules:

```css
:root { --kiosk-red: #e5251f; --kiosk-ink: #171717; --kiosk-bg: #f8f5f0; }
.kiosk-app { min-height: 100dvh; max-width: 900px; margin: 0 auto; }
.kiosk-touch { min-width: 56px; min-height: 56px; }
.kiosk-primary { min-height: 76px; font-size: clamp(20px, 2.4vw, 30px); }
```

- [ ] **Step 4: Run UI tests**

Run: `node --test tests/kiosk-ui.test.mjs tests/baseline.test.mjs`

Expected: PASS.

- [ ] **Step 5: Commit the kiosk shell**

```bash
git add kiosk.html kiosk.css kiosk.js kiosk-presentation.js tests/kiosk-ui.test.mjs tests/baseline.test.mjs
git commit -m "feat: add kiosk start and fulfillment screens"
```

---

### Task 4: Каталог, карточка блюда и синхронный стоп-лист

**Files:**
- Modify: `kiosk.js`
- Modify: `kiosk.css`
- Modify: `kiosk-presentation.js`
- Modify: `tests/kiosk-ui.test.mjs`
- Modify: `tests/kiosk-api.test.mjs`

**Interfaces:**
- Consumes: `PRODUCTS`, `CATEGORIES`, `getProductConfiguration()`, `calculateProductPrice()`, `createCartLine()`, `addCartLine()`.
- Produces: `getKioskAvailability(product, selection, settings) -> { available, reason }`.
- Produces DOM actions: `[data-kiosk-category]`, `[data-kiosk-product]`, `[data-kiosk-option]`, `[data-kiosk-add-line]`.

- [ ] **Step 1: Add failing availability and product-sheet tests**

```js
test('выключенное мясо блокирует все блюда с этим мясом', () => {
  const result = getKioskAvailability(
    PRODUCTS.find(({ id }) => id === 'classic-shawarma'),
    { meat: 'chicken', size: 'standard' },
    { stoppedProductIds: [], stoppedMeatIds: ['chicken'], stoppedSauceIds: [], stoppedAddonIds: [] },
  );
  assert.deepEqual(result, { available: false, reason: 'Курица временно недоступна' });
});

test('карточка блюда показывает цену и большую кнопку добавления', () => {
  const state = { ...createKioskState(), screen: 'product', selectedProductId: 'classic-shawarma' };
  const markup = renderKiosk(state, { products: PRODUCTS, settings: emptySettings });
  assert.match(markup, /Добавить в корзину/);
  assert.match(markup, /data-kiosk-option/);
});
```

- [ ] **Step 2: Run the focused tests and confirm failure**

Run: `node --test tests/kiosk-ui.test.mjs tests/kiosk-api.test.mjs`

Expected: FAIL because catalog rendering and availability helper are absent.

- [ ] **Step 3: Implement catalog and bottom sheet**

Render category chips from `CATEGORIES`, cards from bootstrap products and a fixed bottom cart summary. Product cards show photo, name and lowest valid price. A disabled product remains visible with «Нет в наличии» and cannot open.

The bottom sheet uses the existing configuration ids and prices. Meat, size, addon and sauce controls update an in-memory selection and call `calculateProductPrice`. Quantity controls reuse the compact `− count +` pattern. Before adding, call `getKioskAvailability` again; then create a line through `createCartLine` and merge through `addCartLine`.

When SSE sends `settings.updated`, close an open sheet only if its current product/required option became unavailable, show a centered message, and re-render the catalog without page reload.

- [ ] **Step 4: Run focused and shared product tests**

Run: `node --test tests/kiosk-ui.test.mjs tests/kiosk-api.test.mjs tests/product-options.test.mjs`

Expected: PASS.

- [ ] **Step 5: Commit catalog behavior**

```bash
git add kiosk.js kiosk.css kiosk-presentation.js tests/kiosk-ui.test.mjs tests/kiosk-api.test.mjs
git commit -m "feat: add synchronized kiosk catalog"
```

---

### Task 5: Корзина и серверная перепроверка

**Files:**
- Modify: `kiosk-api.js`
- Modify: `kiosk-fixtures.js`
- Modify: `kiosk-state.js`
- Modify: `kiosk.js`
- Modify: `kiosk.css`
- Modify: `kiosk-presentation.js`
- Modify: `tests/kiosk-api.test.mjs`
- Modify: `tests/kiosk-ui.test.mjs`

**Interfaces:**
- Adds API method: `validateCart({ fulfillment, lines }) -> { lines, summary, unavailable }`.
- Production route: `POST /api/kiosk/cart/validate`.
- Consumes: `changeCartLineQuantity()`, `removeCartLine()`, `calculateCartSummary()`.

- [ ] **Step 1: Write failing validation and cart tests**

```js
test('переход к оплате использует итог сервера', async () => {
  const api = createDemoKioskApi({ delay: async () => {} });
  const result = await api.validateCart({
    fulfillment: 'takeaway',
    lines: [{ productId: 'classic-shawarma', meat: 'chicken', size: 'standard', quantity: 2 }],
  });
  assert.equal(result.summary.total, 600);
  assert.deepEqual(result.unavailable, []);
});

test('корзина показывает позиции, количество, итог и полноразмерный CTA', () => {
  const state = { ...createKioskState(), screen: 'cart', lines: [createCartLine(sampleLine)] };
  const markup = renderKiosk(state, { products: PRODUCTS, settings: emptySettings });
  assert.match(markup, /Корзина/);
  assert.match(markup, /Перейти к оплате/);
  assert.match(markup, /data-kiosk-line-quantity/);
});
```

- [ ] **Step 2: Run tests and confirm failure**

Run: `node --test tests/kiosk-api.test.mjs tests/kiosk-ui.test.mjs`

Expected: FAIL because cart validation and rendering are absent.

- [ ] **Step 3: Implement cart and validation**

Render editable cart lines, recommendations from available snack/sauce products, fulfillment and server total. Disable the CTA while `validateCart` runs. Replace local prices with server-normalized lines before creating the order.

If `unavailable` is not empty, stay in cart and show one message per line:

```json
{ "lineId": "classic-shawarma-x", "reason": "Курица временно недоступна" }
```

Never silently remove or substitute a product.

- [ ] **Step 4: Run cart tests**

Run: `node --test tests/kiosk-api.test.mjs tests/kiosk-ui.test.mjs tests/product-options.test.mjs`

Expected: PASS.

- [ ] **Step 5: Commit the validated cart**

```bash
git add kiosk-api.js kiosk-fixtures.js kiosk-state.js kiosk.js kiosk.css kiosk-presentation.js tests/kiosk-api.test.mjs tests/kiosk-ui.test.mjs
git commit -m "feat: add validated kiosk cart"
```

---

### Task 6: Карточная и QR-оплата через адаптер

**Files:**
- Create: `kiosk-payment.js`
- Create: `tests/kiosk-payment.test.mjs`
- Modify: `kiosk-api.js`
- Modify: `kiosk-fixtures.js`
- Modify: `kiosk-state.js`
- Modify: `kiosk.js`
- Modify: `kiosk.css`
- Modify: `kiosk-presentation.js`
- Modify: `docs/kiosk-api-contract.md`

**Interfaces:**
- Produces: `createKioskPaymentController({ api, terminal })`.
- Produces terminal interface: `terminal.start({ orderId, amount, operationId }) -> { externalId }`, `terminal.cancel(externalId)`, `terminal.getStatus(externalId)`.
- Adds API methods: `startQrPayment(orderId, operationId)`, `getPayment(paymentId)`, `cancelPayment(paymentId, operationId)`.
- Production routes: `POST /api/kiosk/orders/:id/payments/qr`, `GET /api/kiosk/payments/:id`, `POST /api/kiosk/payments/:id/cancel`.

- [ ] **Step 1: Write failing payment-state tests**

```js
test('повторное нажатие использует тот же ключ и не создаёт второй платёж', async () => {
  const api = createDemoKioskApi({ delay: async () => {} });
  const first = await api.startQrPayment('order-1', 'payment-op-1');
  const second = await api.startQrPayment('order-1', 'payment-op-1');
  assert.equal(first.payment.id, second.payment.id);
});

test('неизвестный результат карты сначала перепроверяется', async () => {
  const calls = [];
  const terminal = {
    async start() { return { externalId: 'terminal-1' }; },
    async getStatus(id) { calls.push(id); return { status: 'succeeded' }; },
    async cancel() {},
  };
  const result = await createKioskPaymentController({ api: fakeApi, terminal }).startCard(sampleOrder);
  assert.equal(result.status, 'succeeded');
  assert.deepEqual(calls, ['terminal-1']);
});
```

- [ ] **Step 2: Run the payment tests and confirm failure**

Run: `node --test tests/kiosk-payment.test.mjs`

Expected: FAIL because the payment controller does not exist.

- [ ] **Step 3: Implement payment controller and full-screen states**

Create a controller that owns one active operation, rejects concurrent starts, preserves the same operation id on retry, and translates provider states to `pending`, `succeeded`, `cancelled`, `failed`, or `unknown`.

Production QR creation is server-only. Demo QR returns a fixed non-sensitive SVG/data string and advances to `succeeded` deterministically. Demo card terminal uses the same interface and advances `waiting_for_card -> processing -> succeeded`.

Render three separate screens:

1. `payment-method`: two large cards «Картой» and «По QR-коду»;
2. `card-payment`: amount, NFC illustration, «Приложите карту к терминалу», cancel;
3. `qr-payment`: amount, QR, countdown, cancel.

Do not place payment and success in one layout. On `unknown`, show «Проверяем результат оплаты» and poll the existing payment id; do not call start again.

- [ ] **Step 4: Run payment and UI tests**

Run: `node --test tests/kiosk-payment.test.mjs tests/kiosk-ui.test.mjs tests/kiosk-api.test.mjs`

Expected: PASS.

- [ ] **Step 5: Commit payment flows**

```bash
git add kiosk-payment.js tests/kiosk-payment.test.mjs kiosk-api.js kiosk-fixtures.js kiosk-state.js kiosk.js kiosk.css kiosk-presentation.js docs/kiosk-api-contract.md
git commit -m "feat: add kiosk card and qr payment flows"
```

---

### Task 7: Бездействие, подтверждение и безопасный сброс

**Files:**
- Create: `kiosk-session.js`
- Create: `tests/kiosk-session.test.mjs`
- Modify: `kiosk.js`
- Modify: `kiosk.css`
- Modify: `kiosk-presentation.js`
- Modify: `tests/kiosk-ui.test.mjs`

**Interfaces:**
- Produces: `createKioskSessionTimer({ scheduler, onWarn, onReset })`.
- Methods: `touch({ hasItems })`, `pause()`, `resume({ hasItems })`, `dispose()`.
- Events: empty reset at 30,000 ms; non-empty warning at 60,000 ms; confirmed reset at 70,000 ms.

- [ ] **Step 1: Write failing fake-clock tests**

```js
test('пустая сессия сбрасывается через 30 секунд', () => {
  const clock = createFakeClock();
  let resets = 0;
  const timer = createKioskSessionTimer({ scheduler: clock, onWarn() {}, onReset() { resets += 1; } });
  timer.touch({ hasItems: false });
  clock.tick(29999);
  assert.equal(resets, 0);
  clock.tick(1);
  assert.equal(resets, 1);
});

test('непустая корзина предупреждает в 60 и очищается в 70 секунд', () => {
  const clock = createFakeClock();
  const events = [];
  const timer = createKioskSessionTimer({ scheduler: clock, onWarn() { events.push('warn'); }, onReset() { events.push('reset'); } });
  timer.touch({ hasItems: true });
  clock.tick(60000);
  clock.tick(10000);
  assert.deepEqual(events, ['warn', 'reset']);
});
```

- [ ] **Step 2: Run the timer tests and confirm failure**

Run: `node --test tests/kiosk-session.test.mjs`

Expected: FAIL because `kiosk-session.js` does not exist.

- [ ] **Step 3: Implement and wire inactivity behavior**

Listen to `pointerdown`, `keydown` and `touchstart` at the app root. Pause timers during a provider-controlled card interaction so a valid payment is not discarded. For a non-empty cart render a modal «Продолжить заказ?» with primary «Продолжить» and secondary «Очистить заказ».

After `PAYMENT_SUCCEEDED`, render the calm success page with order number and a visible 10-second countdown. At zero call `resetKioskState()`, clear in-memory cart, clear kiosk-owned localStorage keys, cancel SSE tied to the order, and return to start.

- [ ] **Step 4: Run session and UI tests**

Run: `node --test tests/kiosk-session.test.mjs tests/kiosk-ui.test.mjs tests/kiosk-state.test.mjs`

Expected: PASS.

- [ ] **Step 5: Commit safe reset behavior**

```bash
git add kiosk-session.js tests/kiosk-session.test.mjs kiosk.js kiosk.css kiosk-presentation.js tests/kiosk-ui.test.mjs
git commit -m "feat: add kiosk inactivity and safe reset"
```

---

### Task 8: PWA, kiosk mode и фирменные иконки

**Files:**
- Create: `kiosk.webmanifest`
- Create: `kiosk-sw.js`
- Create: `assets/kiosk/icon-192.png`
- Create: `assets/kiosk/icon-512.png`
- Create: `assets/kiosk/icon-maskable-512.png`
- Create: `tests/kiosk-pwa.test.mjs`
- Modify: `scripts/build-app-icons.mjs`
- Modify: `kiosk.html`

**Interfaces:**
- Manifest: `start_url: "/kiosk.html"`, `display: "standalone"`, `orientation: "portrait"`.
- Service worker caches only versioned kiosk shell/assets; never caches `/api/` or payment responses.

- [ ] **Step 1: Write failing manifest and cache tests**

```js
test('manifest стойки фиксирует портретный standalone-режим', () => {
  const manifest = JSON.parse(readText('kiosk.webmanifest'));
  assert.equal(manifest.start_url, '/kiosk.html');
  assert.equal(manifest.display, 'standalone');
  assert.equal(manifest.orientation, 'portrait');
});

test('service worker не кэширует API и оплату', () => {
  const source = readText('kiosk-sw.js');
  assert.match(source, /url\.pathname\.startsWith\('\/api\/'\)/);
  assert.match(source, /return/);
});
```

- [ ] **Step 2: Run the PWA tests and confirm failure**

Run: `node --test tests/kiosk-pwa.test.mjs`

Expected: FAIL because manifest and service worker are absent.

- [ ] **Step 3: Generate icons and add kiosk installation metadata**

Extend `scripts/build-app-icons.mjs` to composite the unchanged transparent restaurant logo onto a warm light square and generate 192, 512 and maskable 512 assets. Add manifest links, `theme-color`, `apple-mobile-web-app-capable=yes`, `mobile-web-app-capable=yes`, and register `kiosk-sw.js` only on HTTPS/localhost.

Document device setup in the spec-adjacent API document: install PWA, enable Android screen pinning or managed single-app mode, disable sleep while powered, hide gesture navigation, and protect exit with the device administrator PIN.

- [ ] **Step 4: Generate assets and run PWA tests**

Run: `npm run build:icons`

Run: `node --test tests/kiosk-pwa.test.mjs tests/pwa-assets.test.mjs`

Expected: PASS and exact PNG dimensions 192×192, 512×512 and 512×512.

- [ ] **Step 5: Commit PWA support**

```bash
git add kiosk.webmanifest kiosk-sw.js assets/kiosk scripts/build-app-icons.mjs kiosk.html tests/kiosk-pwa.test.mjs
git commit -m "feat: make kiosk installable on android"
```

---

### Task 9: Интеграционная и визуальная проверка

**Files:**
- Create: `docs/superpowers/reviews/2026-08-23-kiosk-ordering-review.md`
- Modify only files for which verification demonstrates a defect.

**Interfaces:**
- Consumes all previous tasks.
- Produces a verified kiosk demo and an explicit list of production integration requirements.

- [ ] **Step 1: Run the complete automated suite**

Run: `npm test`

Expected: all tests PASS with zero failures.

- [ ] **Step 2: Run repository checks**

Run: `git diff --check`

Expected: no whitespace errors.

- [ ] **Step 3: Run the local kiosk walkthrough**

Run: `npm run dev`

Open: `http://127.0.0.1:4173/kiosk.html?demo=1`

Verify at 800×1280 and 1280×1920 portrait:

1. start has one CTA and no payment footer;
2. «Здесь» and «С собой» both reach catalog;
3. stopped product/meat/sauce/addon cannot be selected;
4. product price changes immediately;
5. cart quantity and total remain correct;
6. payment choice is full-screen;
7. card demo and QR demo reach separate success screen;
8. success resets in 10 seconds;
9. empty idle resets at 30 seconds;
10. non-empty idle warns at 60 and resets at 70 seconds;
11. refresh never exposes another visitor's completed order;
12. touch targets remain at least 48×48 CSS pixels;
13. landscape shows a controlled «Поверните устройство» message instead of a broken layout.

- [ ] **Step 4: Verify accessibility and reduced motion**

Navigate every screen with keyboard, verify visible focus, dialog focus trapping, readable `aria-label`s, and that `prefers-reduced-motion: reduce` removes looping card motion and uses instant/simplified transitions.

- [ ] **Step 5: Record production blockers precisely**

Create the review document containing:

- selected Android tablet resolution and kiosk-mode method;
- backend confirmation for every route in `docs/kiosk-api-contract.md`;
- final payment terminal model and its vendor integration method;
- production QR provider confirmation;
- HTTPS and DNS readiness for `kiosk.pivdoner.ru`;
- result of a real paid order appearing on kitchen without refresh;
- result of duplicate-tap/idempotency verification.

Do not mark physical card payment production-ready until the terminal model and server connector pass a real transaction.

- [ ] **Step 6: Commit verified corrections and review**

```bash
git add docs/superpowers/reviews/2026-08-23-kiosk-ordering-review.md
git add -u
git commit -m "test: verify kiosk ordering flow"
```

---

## Separate Production Integration Plan

After the physical terminal is selected and the production backend source is available in a version-controlled workspace, create a second implementation plan covering only:

1. the terminal vendor SDK/HTTP connector;
2. production implementations of the routes in `docs/kiosk-api-contract.md`;
3. ЮKassa/СБП QR creation and webhook reconciliation;
4. receipt/fiscalization fields for kiosk orders;
5. deployment to `kiosk.pivdoner.ru`;
6. one real low-value card payment, one QR payment, one cancellation and one duplicate-tap test.

This separation keeps the kiosk interface independently reviewable and prevents guessing the protocol of hardware that has not been selected.
