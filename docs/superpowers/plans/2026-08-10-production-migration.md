# Production Migration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Превратить утверждённую демонстрацию «Пивной Донер» в серверную систему заказов, безопасно развернуть её рядом с действующим ботом и подготовить к подключению ЮKassa и домена `pivdoner.ru`.

**Architecture:** Статические PWA клиента, кухни, курьера и владельца обслуживает отдельный Nginx-контейнер; Node.js API хранит данные в PostgreSQL, пересчитывает цены и управляет статусами. Существующий Caddy остаётся единственной точкой HTTPS и направляет `/api/*` в API, а остальные запросы — в веб-контейнер.

**Tech Stack:** HTML/CSS/ES modules, Node.js 22, Express 5, PostgreSQL 16, `pg`, `zod`, `argon2`, `helmet`, `express-rate-limit`, Server-Sent Events, Node test runner, Docker Compose, Caddy.

## Global Constraints

- Действующие `/root/pivnoy_doner`, `/root/govno1`, Telegram-бот и Docker volumes не изменять до создания проверенных резервных копий.
- Новую систему размещать в `/opt/pivdoner` отдельным Compose-проектом.
- Telegram-бот отключать только после первого успешного рабочего заказа через новый сайт.
- Секреты и PIN не хранить в Git, JavaScript клиента, логах или документации.
- Все цены пересчитывать сервером; стоимость из браузера не считать доверенной.
- База данных не публикует порт в интернет.
- ЮKassa сначала работает через тестовый адаптер; боевые ключи подключаются после интеграционных тестов.
- Клиентский интерфейс остаётся mobile-first, кухня поддерживает планшет 1280×800 и телефон, курьер — телефон.
- Каждая мутация статуса считается успешной только после подтверждения API.

---

### Task 1: Количества соусов в карточках закусок

**Files:**
- Modify: `product-config.js`
- Modify: `product-sheet.js`
- Modify: `cart-state.js`
- Modify: `cart-storage.js`
- Modify: `order-state.js`
- Modify: `cart.js`
- Modify: `order.js`
- Modify: `kitchen-presentation.js`
- Test: `tests/product-options.test.mjs`

**Interfaces:**
- Consumes: `normalizeOptionQuantities(value, { max: 5 })` из `option-quantities.js`.
- Produces: `selection.sauces: Record<string, number>` и сохранённые подписи соусов `Record<string, number>`.

- [ ] **Step 1: Написать падающие тесты количества соусов**

```js
test('две порции соуса увеличивают цену на 100 ₽', () => {
  assert.equal(calculateProductPrice('nuggets', { sauces: { tasty: 2 } }), 300);
});

test('карточка закуски показывает счётчик соуса', () => {
  const product = PRODUCTS.find(({ id }) => id === 'nuggets');
  const markup = createProductSheetMarkup(product, { sauces: { tasty: 2 } });
  assert.match(markup, /data-sheet-sauce-change="tasty" data-delta="-1"/);
  assert.match(markup, /data-sheet-sauce-value="tasty"[^>]*>2</);
  assert.match(markup, /data-sheet-sauce-change="tasty" data-delta="1"/);
});

test('количество соусов сохраняется для кухни', () => {
  const line = createCartLine({
    productId: 'nuggets',
    name: 'Наггетсы',
    unitPrice: 300,
    sauces: { Тейсти: 2 },
  });
  assert.deepEqual(line.sauces, { Тейсти: 2 });
  assert.deepEqual(getKitchenItemOptions(line), ['Соусы: Тейсти ×2']);
});
```

- [ ] **Step 2: Запустить тест и подтвердить падение**

Run: `node --test tests/product-options.test.mjs`

Expected: FAIL, потому что текущая реализация нормализует соусы как уникальный массив.

- [ ] **Step 3: Перевести выбор соусов на количественную модель**

```js
const normalizeSauces = (value) =>
  normalizeOptionQuantities(
    Array.isArray(value)
      ? Object.fromEntries(value.map((id) => [id, 1]))
      : value,
    { max: 5 },
  );

const sauceTotal = Object.entries(normalizeSauces(sauces)).reduce(
  (total, [id, quantity]) =>
    total + (allowedSauces.has(id) ? (PRODUCT_SAUCES[id]?.price ?? 0) * quantity : 0),
  addonTotal,
);
```

В `product-sheet.js` использовать те же кнопки `− 0 +`, что уже применяются для добавок; в корзине, заказе и кухне выводить `×N` только при `N > 1`.

- [ ] **Step 4: Запустить продуктовые и полные тесты**

Run: `node --test tests/product-options.test.mjs`

Expected: PASS.

Run: `npm test`

Expected: все тесты PASS.

- [ ] **Step 5: Зафиксировать изменение**

```bash
git add product-config.js product-sheet.js cart-state.js cart-storage.js order-state.js cart.js order.js kitchen-presentation.js tests/product-options.test.mjs
git commit -m "feat: support sauce quantities for snacks"
```

### Task 2: Каркас production API

**Files:**
- Create: `server/package.json`
- Create: `server/src/app.js`
- Create: `server/src/config.js`
- Create: `server/src/http.js`
- Create: `server/src/routes/health.js`
- Create: `server/tests/health.test.mjs`
- Modify: `package.json`

**Interfaces:**
- Produces: `createApp(dependencies): Express`, `loadConfig(env): Config`, `GET /api/health`.

- [ ] **Step 1: Добавить падающий smoke-тест API**

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import { createApp } from '../src/app.js';

test('GET /api/health возвращает состояние сервиса', async () => {
  const response = await request(createApp({ db: { query: async () => ({ rows: [{ ok: 1 }] }) } }))
    .get('/api/health');
  assert.equal(response.status, 200);
  assert.deepEqual(response.body, { ok: true, database: 'up' });
});
```

- [ ] **Step 2: Установить серверные зависимости**

`server/package.json`:

```json
{
  "name": "pivdoner-api",
  "private": true,
  "type": "module",
  "engines": { "node": ">=22" },
  "scripts": {
    "start": "node src/http.js",
    "test": "node --test tests/*.test.mjs"
  },
  "dependencies": {
    "argon2": "^0.44.0",
    "cookie-parser": "^1.4.7",
    "express": "^5.1.0",
    "express-rate-limit": "^8.0.1",
    "helmet": "^8.1.0",
    "pg": "^8.16.3",
    "zod": "^4.0.17"
  },
  "devDependencies": { "supertest": "^7.1.4" }
}
```

Run: `npm --prefix server install`

- [ ] **Step 3: Реализовать конфигурацию и health route**

```js
export const loadConfig = (env = process.env) => ({
  port: Number(env.PORT ?? 3001),
  databaseUrl: String(env.DATABASE_URL ?? ''),
  sessionSecret: String(env.SESSION_SECRET ?? ''),
  nodeEnv: String(env.NODE_ENV ?? 'development'),
});
```

```js
export const createApp = ({ db }) => {
  const app = express();
  app.use(helmet());
  app.use(express.json({ limit: '256kb' }));
  app.get('/api/health', async (_request, response) => {
    await db.query('select 1 as ok');
    response.json({ ok: true, database: 'up' });
  });
  return app;
};
```

- [ ] **Step 4: Проверить API**

Run: `npm --prefix server test`

Expected: PASS.

- [ ] **Step 5: Зафиксировать каркас**

```bash
git add package.json server
git commit -m "feat: scaffold production api"
```

### Task 3: PostgreSQL и миграции

**Files:**
- Create: `server/src/db/pool.js`
- Create: `server/src/db/migrate.js`
- Create: `server/src/db/migrations/001_initial.sql`
- Create: `server/tests/migrations.test.mjs`

**Interfaces:**
- Produces: `createPool(databaseUrl): pg.Pool`, `runMigrations(pool): Promise<void>`.
- Tables: `staff_accounts`, `sessions`, `catalog_products`, `orders`, `order_items`, `status_history`, `payments`, `reviews`, `restaurant_settings`, `event_outbox`.

- [ ] **Step 1: Написать тест списка миграций**

```js
test('начальная миграция содержит обязательные таблицы', async () => {
  const sql = await readFile(new URL('../src/db/migrations/001_initial.sql', import.meta.url), 'utf8');
  for (const table of ['orders', 'order_items', 'status_history', 'payments', 'staff_accounts']) {
    assert.match(sql, new RegExp(`create table ${table}`, 'i'));
  }
});
```

- [ ] **Step 2: Подтвердить падение теста**

Run: `npm --prefix server test`

Expected: FAIL с `ENOENT` для `001_initial.sql`.

- [ ] **Step 3: Создать транзакционную схему**

Ключевые ограничения в `001_initial.sql`:

```sql
create type order_status as enum (
  'submitted', 'accepted', 'cooking', 'ready', 'courier', 'delivered', 'completed', 'cancelled'
);

create table orders (
  id uuid primary key,
  public_number bigint generated always as identity unique,
  status order_status not null default 'submitted',
  fulfillment text not null check (fulfillment in ('pickup', 'delivery')),
  payment_status text not null check (payment_status in ('pending', 'paid', 'failed', 'refunded')),
  customer_name text not null default '',
  phone text not null,
  address jsonb not null default '{}'::jsonb,
  items_total integer not null check (items_total >= 0),
  delivery_total integer not null check (delivery_total >= 0),
  discount_total integer not null check (discount_total >= 0),
  total integer not null check (total >= 0),
  eta_min integer not null,
  eta_max integer not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table order_items (
  id uuid primary key,
  order_id uuid not null references orders(id) on delete cascade,
  product_id text not null,
  name text not null,
  quantity integer not null check (quantity between 1 and 20),
  unit_price integer not null check (unit_price >= 0),
  configuration jsonb not null default '{}'::jsonb
);
```

Добавить таблицу `schema_migrations`, advisory lock и выполнение каждого SQL-файла один раз.

- [ ] **Step 4: Запустить тесты миграций**

Run: `npm --prefix server test`

Expected: PASS.

- [ ] **Step 5: Зафиксировать схему**

```bash
git add server/src/db server/tests/migrations.test.mjs
git commit -m "feat: add production database schema"
```

### Task 4: Серверный каталог и расчёт заказа

**Files:**
- Create: `shared/catalog.js`
- Modify: `catalog-data.js`
- Modify: `product-config.js`
- Create: `server/src/domain/pricing.js`
- Create: `server/src/domain/delivery.js`
- Create: `server/src/routes/orders.js`
- Create: `server/tests/orders.test.mjs`

**Interfaces:**
- Consumes: `PRODUCTS`, `PRODUCT_CONFIGURATIONS`, `PRODUCT_ADDONS`, `PRODUCT_SAUCES` из `shared/catalog.js`.
- Produces: `priceOrder(input, settings): PricedOrder`, `POST /api/orders`.

- [ ] **Step 1: Написать тест недоверенной цены клиента**

```js
test('сервер игнорирует цену клиента и считает две порции соуса', async () => {
  const priced = priceOrder({
    fulfillment: 'pickup',
    items: [{
      productId: 'nuggets',
      quantity: 1,
      unitPrice: 1,
      sauces: { tasty: 2 },
    }],
  }, { deliveryPrice: 200, freeDeliveryFrom: 2000, minimumOrder: 300 });
  assert.equal(priced.itemsTotal, 300);
  assert.equal(priced.total, 300);
});
```

- [ ] **Step 2: Подтвердить падение**

Run: `npm --prefix server test`

Expected: FAIL, модуль `pricing.js` отсутствует.

- [ ] **Step 3: Реализовать единый серверный расчёт**

```js
export const priceOrder = (input, settings) => {
  const items = input.items.map(priceLine);
  const itemsTotal = items.reduce((sum, item) => sum + item.unitPrice * item.quantity, 0);
  if (itemsTotal < settings.minimumOrder) throw new DomainError('MINIMUM_ORDER');
  const deliveryTotal = input.fulfillment === 'delivery' && itemsTotal < settings.freeDeliveryFrom
    ? settings.deliveryPrice
    : 0;
  return { items, itemsTotal, deliveryTotal, discountTotal: 0, total: itemsTotal + deliveryTotal };
};
```

Валидация доставки: минимальный заказ 300 ₽, доставка 200 ₽, бесплатно от 2000 ₽, приём доставки 11:30–22:30 по Москве.

- [ ] **Step 4: Добавить идемпотентное создание заказа**

`POST /api/orders` принимает заголовок `Idempotency-Key`, сохраняет его в уникальном поле и при повторе возвращает существующий заказ.

- [ ] **Step 5: Проверить расчёт и API**

Run: `npm --prefix server test`

Expected: PASS для неверной клиентской цены, минимума заказа, доставки и повторного `Idempotency-Key`.

- [ ] **Step 6: Зафиксировать доменную логику**

```bash
git add shared catalog-data.js product-config.js server/src/domain server/src/routes/orders.js server/tests/orders.test.mjs
git commit -m "feat: validate and price orders on server"
```

### Task 5: Вход сотрудников и права ролей

**Files:**
- Create: `server/src/auth/session.js`
- Create: `server/src/auth/middleware.js`
- Create: `server/src/routes/auth.js`
- Create: `server/src/scripts/create-account.js`
- Create: `server/tests/auth.test.mjs`

**Interfaces:**
- Produces: `POST /api/auth/login`, `POST /api/auth/logout`, `requireRole(...roles)`.
- Roles: `owner`, `kitchen`, `courier`.

- [ ] **Step 1: Написать тесты входа и запрета роли**

```js
test('правильный PIN создаёт защищённую cookie', async () => {
  const response = await request(app).post('/api/auth/login').send({ role: 'kitchen', pin: '2468' });
  assert.equal(response.status, 204);
  assert.match(response.headers['set-cookie'][0], /HttpOnly/);
  assert.match(response.headers['set-cookie'][0], /SameSite=Lax/);
});

test('курьер не может менять настройки ресторана', async () => {
  const response = await request(app).patch('/api/settings').set('Cookie', courierCookie).send({ acceptingOrders: false });
  assert.equal(response.status, 403);
});
```

- [ ] **Step 2: Подтвердить падение**

Run: `npm --prefix server test`

Expected: FAIL, маршруты входа отсутствуют.

- [ ] **Step 3: Реализовать Argon2id и сессии**

```js
const pinHash = await argon2.hash(pin, { type: argon2.argon2id });
const token = randomBytes(32).toString('base64url');
const tokenHash = createHash('sha256').update(token).digest('hex');
response.cookie('pivdoner_session', token, {
  httpOnly: true,
  secure: config.nodeEnv === 'production',
  sameSite: 'lax',
  maxAge: 12 * 60 * 60 * 1000,
});
```

Лимит входа: 5 попыток за 15 минут на IP и роль. Production-аккаунты создаются только CLI-командой, PIN не выводится после создания.

- [ ] **Step 4: Запустить тесты авторизации**

Run: `npm --prefix server test`

Expected: PASS.

- [ ] **Step 5: Зафиксировать авторизацию**

```bash
git add server/src/auth server/src/routes/auth.js server/src/scripts/create-account.js server/tests/auth.test.mjs
git commit -m "feat: secure staff access by role"
```

### Task 6: Статусы, очередь, расчёт времени и SSE

**Files:**
- Create: `server/src/domain/status-machine.js`
- Create: `server/src/domain/eta.js`
- Create: `server/src/realtime/order-events.js`
- Create: `server/src/routes/staff-orders.js`
- Create: `server/src/routes/events.js`
- Create: `server/tests/statuses.test.mjs`
- Create: `server/tests/realtime.test.mjs`

**Interfaces:**
- Produces: `canTransition(from, to, role): boolean`, `calculateEta(activeItems): { min, max }`, `GET /api/events`, `PATCH /api/staff/orders/:id/status`.

- [ ] **Step 1: Написать тест разрешённых переходов**

```js
test('новый заказ нельзя сразу сделать готовым', () => {
  assert.equal(canTransition('submitted', 'ready', 'kitchen'), false);
  assert.equal(canTransition('submitted', 'accepted', 'kitchen'), true);
  assert.equal(canTransition('accepted', 'cooking', 'kitchen'), true);
});

test('два повара обрабатывают до шести шаверм параллельно', () => {
  assert.deepEqual(calculateEta({ shawarmaPortions: 6, otherMinutes: 0 }), { min: 6, max: 8 });
  assert.deepEqual(calculateEta({ shawarmaPortions: 7, otherMinutes: 0 }), { min: 12, max: 15 });
});
```

- [ ] **Step 2: Подтвердить падение**

Run: `npm --prefix server test`

Expected: FAIL, доменные функции отсутствуют.

- [ ] **Step 3: Реализовать конечный автомат и историю**

```js
const ALLOWED = Object.freeze({
  submitted: ['accepted', 'cancelled'],
  accepted: ['cooking', 'cancelled'],
  cooking: ['ready', 'cancelled'],
  ready: ['courier', 'completed'],
  courier: ['delivered'],
  delivered: ['completed'],
  completed: [],
  cancelled: [],
});
```

Обновлять `orders` и вставлять `status_history` в одной транзакции; при конфликте версии возвращать `409 STATUS_CONFLICT`.

- [ ] **Step 4: Реализовать SSE с восстановлением**

`GET /api/events` принимает `Last-Event-ID`, отправляет heartbeat каждые 20 секунд и повторно читает события из `event_outbox` после разрыва.

- [ ] **Step 5: Проверить статусы и SSE**

Run: `npm --prefix server test`

Expected: PASS, включая повторное подключение по `Last-Event-ID`.

- [ ] **Step 6: Зафиксировать очередь**

```bash
git add server/src/domain server/src/realtime server/src/routes/staff-orders.js server/src/routes/events.js server/tests/statuses.test.mjs server/tests/realtime.test.mjs
git commit -m "feat: add order lifecycle and realtime events"
```

### Task 7: Подключение клиента к API

**Files:**
- Create: `client-api.js`
- Modify: `checkout.js`
- Modify: `order.js`
- Modify: `review-service.js`
- Modify: `home.js`
- Create: `tests/client-api.test.mjs`

**Interfaces:**
- Produces: `createOrder(payload, idempotencyKey)`, `getOrder(id)`, `subscribeToOrder(id, handlers)`, `submitReview(orderId, data)`.

- [ ] **Step 1: Написать тест клиента API**

```js
test('создание заказа передаёт ключ идемпотентности', async () => {
  const calls = [];
  const api = createClientApi(async (url, options) => {
    calls.push({ url, options });
    return jsonResponse({ id: 'order-1', status: 'submitted' }, 201);
  });
  await api.createOrder({ items: [] }, 'checkout-123');
  assert.equal(calls[0].options.headers['Idempotency-Key'], 'checkout-123');
});
```

- [ ] **Step 2: Подтвердить падение**

Run: `node --test tests/client-api.test.mjs`

Expected: FAIL, файл `client-api.js` отсутствует.

- [ ] **Step 3: Реализовать адаптер и заменить локальное оформление**

```js
export const createClientApi = (fetcher = fetch) => ({
  createOrder: async (payload, key) => parseResponse(await fetcher('/api/orders', {
    method: 'POST',
    credentials: 'same-origin',
    headers: { 'Content-Type': 'application/json', 'Idempotency-Key': key },
    body: JSON.stringify(payload),
  })),
  getOrder: async (id) => parseResponse(await fetcher(`/api/orders/${encodeURIComponent(id)}`)),
});
```

`checkout.js` очищает корзину только после `201`. `order.js` подписывается на SSE и сохраняет только идентификатор активного заказа. Отзыв API принимает только для `completed`.

- [ ] **Step 4: Проверить клиент**

Run: `npm test`

Expected: PASS.

- [ ] **Step 5: Зафиксировать клиентскую интеграцию**

```bash
git add client-api.js checkout.js order.js review-service.js home.js tests/client-api.test.mjs
git commit -m "feat: connect client checkout to api"
```

### Task 8: Подключение кухни, курьера и минимального доступа владельца

**Files:**
- Modify: `kitchen-api.js`
- Modify: `kitchen.js`
- Modify: `courier-api.js`
- Modify: `courier.js`
- Create: `owner.html`
- Create: `owner.css`
- Create: `owner.js`
- Create: `owner-api.js`
- Create: `owner.webmanifest`
- Create: `tests/owner-api.test.mjs`

**Interfaces:**
- Kitchen: `listKitchenOrders()`, `changeOrderStatus(id, status, version)`, `setAvailability(productId, available)`.
- Courier: `listAssignedDeliveries()`, `changeDeliveryStatus(id, status, version)`.
- Owner: `getDashboard()`, `setAcceptingOrders(value)`, `setAvailability(productId, available)`.

- [ ] **Step 1: Написать тесты защищённых адаптеров**

```js
test('смена статуса кухни отправляет версию заказа', async () => {
  const calls = [];
  const api = createKitchenApi(recordingFetch(calls));
  await api.changeOrderStatus('order-1', 'accepted', 3);
  assert.deepEqual(JSON.parse(calls[0].options.body), { status: 'accepted', version: 3 });
});

test('владелец может остановить приём заказов', async () => {
  const calls = [];
  const api = createOwnerApi(recordingFetch(calls));
  await api.setAcceptingOrders(false);
  assert.deepEqual(JSON.parse(calls[0].options.body), { acceptingOrders: false });
});
```

- [ ] **Step 2: Подтвердить падение**

Run: `npm test`

Expected: FAIL для отсутствующего owner API и старых demo-адаптеров.

- [ ] **Step 3: Подключить реальные API и SSE**

Удалить генерацию фиктивных заказов из production-пути. При `401` показывать вход, при `409` обновлять карточку с сервера, при offline сохранять действие визуально как неотправленное, но не перемещать заказ в другую колонку.

```js
export const createKitchenApi = (fetcher = fetch) => ({
  listOrders: () => requestJson(fetcher, '/api/staff/orders?board=kitchen'),
  changeOrderStatus: (id, status, version) => requestJson(
    fetcher,
    `/api/staff/orders/${encodeURIComponent(id)}/status`,
    {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status, version }),
    },
  ),
});
```

- [ ] **Step 4: Создать минимальную панель владельца**

Показать: приём заказов включён/выключен, активные заказы, просроченные, выручку смены, стоп-лист и ссылки на кухню/курьера. Изменение цен не добавлять.

```js
export const createOwnerApi = (fetcher = fetch) => ({
  getDashboard: () => requestJson(fetcher, '/api/owner/dashboard'),
  setAcceptingOrders: (acceptingOrders) => requestJson(fetcher, '/api/owner/settings', {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ acceptingOrders: Boolean(acceptingOrders) }),
  }),
  setAvailability: (productId, available) => requestJson(
    fetcher,
    `/api/owner/catalog/${encodeURIComponent(productId)}`,
    {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ available: Boolean(available) }),
    },
  ),
});
```

- [ ] **Step 5: Проверить интерфейсы и PWA**

Run: `npm test`

Expected: PASS для API-адаптеров, манифестов и существующей логики кухни/курьера.

- [ ] **Step 6: Зафиксировать рабочие интерфейсы**

```bash
git add kitchen-api.js kitchen.js courier-api.js courier.js owner.html owner.css owner.js owner-api.js owner.webmanifest tests/owner-api.test.mjs
git commit -m "feat: connect staff apps to production api"
```

### Task 9: Платёжный адаптер ЮKassa

**Files:**
- Create: `server/src/payments/provider.js`
- Create: `server/src/payments/mock-provider.js`
- Create: `server/src/payments/yookassa-provider.js`
- Create: `server/src/routes/payments.js`
- Create: `server/tests/payments.test.mjs`

**Interfaces:**
- Produces: `createPayment({ orderId, amount, returnUrl, idempotencyKey })`, `handleWebhook(payload)`.

- [ ] **Step 1: Написать тест идемпотентной оплаты**

```js
test('повторный webhook не меняет заказ дважды', async () => {
  const first = await service.handleWebhook({ event: 'payment.succeeded', paymentId: 'pay-1' });
  const second = await service.handleWebhook({ event: 'payment.succeeded', paymentId: 'pay-1' });
  assert.equal(first.applied, true);
  assert.equal(second.applied, false);
});
```

- [ ] **Step 2: Реализовать mock provider и контракт ЮKassa**

```js
export class MockPaymentProvider {
  async createPayment({ orderId, amount }) {
    return { id: `mock-${orderId}`, status: 'pending', confirmationUrl: `/order.html?id=${orderId}` };
  }
}
```

Боевой provider использует Basic Auth только на сервере, отправляет сумму в рублях с двумя знаками и передаёт отдельный idempotence key ЮKassa.

- [ ] **Step 3: Реализовать webhook и транзакцию оплаты**

Сначала получить состояние платежа из API ЮKassa по `paymentId`, затем в одной транзакции изменить `payments` и `orders.payment_status`. Не доверять сумме из входящего webhook без сверки с заказом.

- [ ] **Step 4: Запустить тесты платежей**

Run: `npm --prefix server test`

Expected: PASS в mock-режиме без реальных ключей.

- [ ] **Step 5: Зафиксировать платёжный модуль**

```bash
git add server/src/payments server/src/routes/payments.js server/tests/payments.test.mjs
git commit -m "feat: add payment provider boundary"
```

### Task 10: Docker, резервные копии и конфигурация Caddy

**Files:**
- Create: `Dockerfile.web`
- Create: `server/Dockerfile`
- Create: `deploy/nginx.conf`
- Create: `deploy/docker-compose.production.yml`
- Create: `deploy/Caddyfile.pivdoner`
- Create: `deploy/.env.example`
- Create: `deploy/backup.sh`
- Create: `deploy/restore.md`
- Create: `tests/deployment.test.mjs`

**Interfaces:**
- Produces: containers `pivdoner-web`, `pivdoner-api`, `pivdoner-db`; volumes `pivdoner_pg_data`, `pivdoner_backups`.

- [ ] **Step 1: Написать статический тест deployment-файлов**

```js
test('production compose не публикует PostgreSQL', async () => {
  const compose = await readFile('deploy/docker-compose.production.yml', 'utf8');
  assert.doesNotMatch(compose, /5432:5432/);
  assert.match(compose, /pivnoy_doner_caddy/);
  assert.match(compose, /healthcheck:/);
});
```

- [ ] **Step 2: Создать production Compose**

Ключевая структура:

```yaml
services:
  web:
    container_name: pivdoner-web
    build:
      context: ..
      dockerfile: Dockerfile.web
    restart: unless-stopped
    networks: [internal, caddy]
  api:
    container_name: pivdoner-api
    build:
      context: ../server
    env_file: .env
    restart: unless-stopped
    depends_on:
      db:
        condition: service_healthy
    networks: [internal, caddy]
  db:
    container_name: pivdoner-db
    image: postgres:16-alpine
    env_file: .env
    restart: unless-stopped
    volumes: [pg_data:/var/lib/postgresql/data]
    networks: [internal]
networks:
  internal:
  caddy:
    external: true
    name: pivnoy_doner_caddy
```

- [ ] **Step 3: Создать Caddy-маршруты**

```caddyfile
(pivdoner_api) {
  handle /api/* {
    reverse_proxy pivdoner-api:3001
  }
}

pivdoner.ru, www.pivdoner.ru {
  import pivdoner_api
  reverse_proxy pivdoner-web:8080
}

kitchen.pivdoner.ru {
  import pivdoner_api
  reverse_proxy pivdoner-web:8080
}

courier.pivdoner.ru {
  import pivdoner_api
  reverse_proxy pivdoner-web:8080
}

owner.pivdoner.ru {
  import pivdoner_api
  reverse_proxy pivdoner-web:8080
}

stage.pivdoner.ru {
  import pivdoner_api
  reverse_proxy pivdoner-web:8080
}
```

В `deploy/nginx.conf` использовать `map $host $app_entry`: для `kitchen.*` — `/kitchen.html`, для `courier.*` — `/courier.html`, для `owner.*` — `/owner.html`, для остальных — `/home.html`; затем `try_files $uri $app_entry`, чтобы ассеты не попадали под переписывание.

- [ ] **Step 4: Создать безопасный backup script**

`backup.sh` создаёт каталог с UTC-временем, архивирует конфиги и запускает `pg_dump -Fc`; завершает работу при любой ошибке через `set -Eeuo pipefail`. Скрипт не удаляет существующие volumes.

```bash
#!/usr/bin/env bash
set -Eeuo pipefail
stamp="$(date -u +%Y%m%dT%H%M%SZ)"
target="/root/backups/pivdoner-migration/$stamp"
install -d -m 700 "$target"
tar -C /root -czf "$target/legacy-configs.tar.gz" pivnoy_doner govno1
docker run --rm \
  -v pivnoy_doner_db_data:/source:ro \
  -v "$target:/backup" \
  alpine:3.22 sh -c 'cd /source && tar -czf /backup/legacy-pivnoy-db.tar.gz .'
docker run --rm \
  -v govno1_backend-data:/source:ro \
  -v "$target:/backup" \
  alpine:3.22 sh -c 'cd /source && tar -czf /backup/legacy-shop-backend.tar.gz .'
docker run --rm \
  -v govno1_bot-data:/source:ro \
  -v "$target:/backup" \
  alpine:3.22 sh -c 'cd /source && tar -czf /backup/legacy-telegram-bot.tar.gz .'
sha256sum "$target"/* > "$target/SHA256SUMS"
(cd "$target" && sha256sum -c SHA256SUMS)
```

- [ ] **Step 5: Проверить конфигурацию локально**

Run: `node --test tests/deployment.test.mjs`

Expected: PASS.

Run: `docker compose -f deploy/docker-compose.production.yml config`

Expected: exit 0 без раскрытия реальных секретов.

- [ ] **Step 6: Зафиксировать deployment**

```bash
git add Dockerfile.web server/Dockerfile deploy tests/deployment.test.mjs
git commit -m "feat: add isolated production deployment"
```

### Task 11: Интеграционные и нагрузочные проверки

**Files:**
- Create: `server/tests/order-flow.test.mjs`
- Create: `scripts/load-test.mjs`
- Modify: `package.json`

**Interfaces:**
- Consumes: production API contract from Tasks 2–9.
- Produces: `npm run test:integration`, `npm run test:load`.

- [ ] **Step 1: Написать полный тест заказа**

```js
test('оплаченный заказ проходит путь клиент → кухня → курьер', async () => {
  const order = await client.createPaidDeliveryOrder();
  await kitchen.transition(order.id, 'accepted');
  await kitchen.transition(order.id, 'cooking');
  await kitchen.transition(order.id, 'ready');
  await courier.transition(order.id, 'courier');
  await courier.transition(order.id, 'delivered');
  assert.equal((await client.getOrder(order.id)).status, 'delivered');
});
```

- [ ] **Step 2: Реализовать нагрузочный сценарий**

`scripts/load-test.mjs` создаёт 100 параллельных чтений каталога и 50 заказов с уникальными `Idempotency-Key`, затем проверяет: 0 ответов `5xx`, ровно 50 заказов и p95 меньше 1000 мс на сервере владельца.

Добавить scripts в корневой `package.json`:

```json
{
  "scripts": {
    "test": "node --test tests/*.test.mjs",
    "test:integration": "node --test server/tests/order-flow.test.mjs",
    "test:load": "node scripts/load-test.mjs"
  }
}
```

- [ ] **Step 3: Выполнить полный локальный gate**

Run: `npm test`

Run: `npm --prefix server test`

Run: `npm run test:integration`

Expected: все команды PASS.

- [ ] **Step 4: Зафиксировать проверки**

```bash
git add server/tests/order-flow.test.mjs scripts/load-test.mjs package.json
git commit -m "test: cover production order flow and load"
```

### Task 12: Безопасное размещение на сервере

**Files:**
- Server create: `/opt/pivdoner`
- Server backup root: `/root/backups/pivdoner-migration`; `backup.sh` создаёт внутри каталог с фактическим UTC-временем запуска.
- Server modify after backup: `/root/pivnoy_doner/Caddyfile`

**Interfaces:**
- Consumes: verified Docker images/configuration from Tasks 1–11.
- Produces: testable HTTPS endpoints and rollback archive.

- [ ] **Step 1: Проверить действующие сервисы без изменений**

Run remotely: `docker ps --format 'table {{.Names}}\t{{.Status}}\t{{.Ports}}'`

Expected: `caddy`, `shawarma-app`, `shop-backend`, `tse-bot` работают.

- [ ] **Step 2: Создать резервные копии**

Архивировать `/root/pivnoy_doner`, `/root/govno1`, Caddyfile и volumes баз. Проверить архивы командой `tar -tf` и контрольными суммами SHA-256 до любых изменений.

- [ ] **Step 3: Загрузить код в `/opt/pivdoner` и создать `.env`**

Права: каталог root-owned; `deploy/.env` — `600`. Сгенерировать `SESSION_SECRET` через `openssl rand -base64 48`; создать отдельный пароль PostgreSQL. Не печатать значения в журнал работы.

- [ ] **Step 4: Запустить новый стек параллельно**

Run remotely: `docker compose -p pivdoner -f /opt/pivdoner/deploy/docker-compose.production.yml up -d --build`

Expected: три новых healthy-контейнера; старые контейнеры продолжают работать.

- [ ] **Step 5: Проверить API внутри Docker-сети**

Run remotely: `docker exec caddy wget -qO- http://pivdoner-api:3001/api/health`

Expected: `{"ok":true,"database":"up"}`.

- [ ] **Step 6: Подключить тестовые домены в Caddy**

Сначала проверить объединённый Caddyfile командой `docker exec caddy caddy validate --config /etc/caddy/Caddyfile`. Только после exit 0 выполнить `docker exec caddy caddy reload --config /etc/caddy/Caddyfile`.

- [ ] **Step 7: Провести браузерный smoke-test**

Проверить клиент на iPhone-width 390 px, кухню на 1280×800 и телефон, курьера на телефоне, владельца на desktop. Создать один mock-заказ и провести его до завершения.

- [ ] **Step 8: Выполнить нагрузочный тест на сервере**

Run: `npm run test:load -- --base-url=https://stage.pivdoner.ru`

Expected: 0 ответов `5xx`, 50 уникальных заказов, p95 < 1000 мс.

- [ ] **Step 9: Подготовить DNS и ЮKassa**

Настроить A-записи `@`, `www`, `stage`, `kitchen`, `courier`, `owner` на `194.87.147.92`. После распространения DNS включить тестовые ключи ЮKassa в серверном `.env`, перезапустить только `pivdoner-api` и провести тестовую оплату.

- [ ] **Step 10: Переключить рабочий поток**

После успешного контролируемого рабочего заказа остановить только контейнер Telegram-бота. Не удалять его и его volume 14 дней. Зафиксировать время переключения и путь к резервной копии в `/opt/pivdoner/deploy/deployment-log.md`.

---

## Self-review coverage

- Резервные копии и rollback: Tasks 10, 12.
- Серверная цена, доставка и заказ: Tasks 3, 4.
- Роли и PIN: Task 5.
- Кухня, курьер и владелец: Tasks 6, 8.
- Клиент и отзывы: Task 7.
- ЮKassa и webhook: Task 9.
- Docker, Caddy и домены: Tasks 10, 12.
- Нагрузка 100 посетителей: Task 11, Task 12.
- Безопасное отключение Telegram-бота: Task 12.
