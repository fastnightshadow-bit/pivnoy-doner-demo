# Kitchen Menu, Availability, and Refunds Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Добавить кухне полноэкранное управление меню, синхронизировать стоп-лист со всеми клиентскими экранами и доказать безопасный полный возврат оплаты при отмене заказа.

**Architecture:** Панель владельца и кухня используют единый серверный источник доступности: блюда, мясо, соусы и добавки. Клиент получает публичное состояние, обновляет интерфейс без перезагрузки и повторно проверяется сервером при создании заказа. Отмена оплаченного заказа запускает одну идемпотентную операцию возврата ЮKassa, состояние которой видно в истории кухни.

**Tech Stack:** HTML, CSS, JavaScript ES modules, Node.js 22, Express 5, PostgreSQL, Server-Sent Events, Node test runner, Supertest, Docker Compose, ЮKassa API.

**Spec:** `docs/superpowers/specs/2026-08-21-kitchen-menu-availability-refunds-design.md`

## Global Constraints

- Жёлтые переключатели не используются: доступно — чёрный переключатель с белым бегунком; отключено — красное состояние «Нет в наличии».
- Красный используется только для стоп-листа, предупреждений и опасных действий.
- Кухня должна работать на телефоне и планшете; интерактивные зоны не меньше 44 px.
- Кухня и владелец меняют один серверный набор `stoppedProductIds`, `stoppedMeatIds`, `stoppedSauceIds`, `stoppedAddonIds`.
- Недоступная позиция обязательно отклоняется сервером при оформлении заказа.
- Курьер не может отменять заказы и запускать возврат.
- Клиент, кухня, сервер и миграции публикуются как одна совместимая версия.
- Сначала проверяется `stage.pivdoner.ru`, после успешной проверки — основной домен.
- Не добавлять на кухню изменение цен, создание и удаление блюд.

---

### Task 1: Зафиксировать единый контракт доступности

**Files:**
- Modify: `kitchen-settings.js`
- Modify: `owner-menu.js`
- Modify: `server/src/services/settings.js`
- Modify: `server/src/repositories/settings.js`
- Modify: `server/src/routes/settings.js`
- Modify: `server/src/routes/owner.js`
- Test: `tests/kitchen-settings.test.mjs`
- Test: `tests/owner-menu.test.mjs`
- Test: `server/tests/settings.test.mjs`

**Interfaces:**
- Consumes: `PRODUCTS`, `CATEGORIES`, `PRODUCT_ADDONS`, `PRODUCT_SAUCES`.
- Produces: `normalizeKitchenSettings(value)`, `buildCategorySummaries(input)`, `setCategoryAvailability(categoryId, available, account)`, `setOptionAvailability(kind, optionId, available, account)`.

- [ ] **Step 1: Добавить проваливающийся тест полного контракта**

```js
test('settings preserve products, meat, sauces, and addons together', () => {
  assert.deepEqual(normalizeKitchenSettings({
    acceptingOrders: false,
    stoppedProductIds: ['nuggets'],
    stoppedMeatIds: ['beef'],
    stoppedSauceIds: ['tasty'],
    stoppedAddonIds: ['fried-onion'],
  }), {
    acceptingOrders: false,
    stoppedProductIds: ['nuggets'],
    stoppedMeatIds: ['beef'],
    stoppedSauceIds: ['tasty'],
    stoppedAddonIds: ['fried-onion'],
  });
});
```

- [ ] **Step 2: Запустить тест и подтвердить ожидаемое падение**

Run: `node --test tests/kitchen-settings.test.mjs server/tests/settings.test.mjs`

Expected: FAIL, если хотя бы одно поле теряется в API или репозитории.

- [ ] **Step 3: Завершить минимальную реализацию контракта**

Публичный ответ `/api/catalog-status` и защищённые ответы `/api/settings`, `/api/owner/dashboard` должны возвращать четыре массива:

```js
{
  acceptingOrders: value.acceptingOrders !== false,
  stoppedProductIds: value.stoppedProductIds.map(String),
  stoppedMeatIds: value.stoppedMeatIds.map(String),
  stoppedSauceIds: value.stoppedSauceIds.map(String),
  stoppedAddonIds: value.stoppedAddonIds.map(String),
}
```

Категория изменяет только связанные `productId`; опция принимает только `meat`, `sauce`, `addon`.

- [ ] **Step 4: Запустить тесты контракта**

Run: `node --test tests/kitchen-settings.test.mjs tests/owner-menu.test.mjs server/tests/settings.test.mjs`

Expected: PASS.

- [ ] **Step 5: Зафиксировать изменения**

```bash
git add kitchen-settings.js owner-menu.js server/src/services/settings.js server/src/repositories/settings.js server/src/routes/settings.js server/src/routes/owner.js tests/kitchen-settings.test.mjs tests/owner-menu.test.mjs server/tests/settings.test.mjs
git commit -m "feat: unify catalog availability settings"
```

### Task 2: Завершить мобильное меню владельца как эталон

**Files:**
- Modify: `owner.html`
- Modify: `owner.css`
- Modify: `owner.js`
- Modify: `owner-api.js`
- Test: `tests/owner-api.test.mjs`
- Test: `tests/owner-menu.test.mjs`

**Interfaces:**
- Consumes: контракт Task 1.
- Produces: эталонный список категорий и блюд, который повторно использует кухня; `OwnerApi.setAvailability`, `setCategoryAvailability`, `setOptionAvailability`.

- [ ] **Step 1: Добавить тесты взаимодействий панели**

```js
test('owner category toggle calls category endpoint once', async () => {
  await api.setCategoryAvailability('snacks', false);
  assert.equal(calls[0].url, '/api/owner/categories/snacks');
  assert.deepEqual(JSON.parse(calls[0].options.body), { available: false });
});
```

Проверить отдельные вызовы для `meat/beef`, `sauce/tasty`, `addon/fried-onion`.

- [ ] **Step 2: Подтвердить падение тестов до полной реализации**

Run: `node --test tests/owner-api.test.mjs tests/owner-menu.test.mjs`

Expected: FAIL на отсутствующем или неправильном вызове.

- [ ] **Step 3: Довести экран владельца**

Экран должен содержать поиск, общий приём заказов, список категорий, раскрытие блюд и переключатели опций. Каждое действие:

```js
setBusy(key, true);
try {
  await api.setOptionAvailability(kind, id, available);
  await refreshDashboard();
} catch (error) {
  showToast(error.message, 'error');
} finally {
  setBusy(key, false);
}
```

- [ ] **Step 4: Проверить тесты владельца**

Run: `node --test tests/owner-api.test.mjs tests/owner-menu.test.mjs`

Expected: PASS.

- [ ] **Step 5: Зафиксировать эталонный экран**

```bash
git add owner.html owner.css owner.js owner-api.js tests/owner-api.test.mjs tests/owner-menu.test.mjs
git commit -m "feat: add owner mobile menu controls"
```

### Task 3: Добавить такое же полноэкранное меню кухне

**Files:**
- Create: `kitchen-menu.js`
- Modify: `kitchen.html`
- Modify: `kitchen.css`
- Modify: `kitchen.js`
- Modify: `kitchen-api.js`
- Modify: `kitchen-sw.js`
- Test: `tests/kitchen-settings.test.mjs`
- Test: `tests/kitchen-api.test.mjs`
- Test: `tests/kitchen-update.test.mjs`
- Test: `tests/deployment.test.mjs`

**Interfaces:**
- Consumes: `buildCategorySummaries`, `filterOwnerMenu`, `getProductOptionGroups` из `owner-menu.js`; настройки Task 1.
- Produces: `renderKitchenMenu({ categories, settings, query, expandedIds })`; `KitchenApi.setAvailability`, `setCategoryAvailability`, `setOptionAvailability`.

- [ ] **Step 1: Написать тест разметки кухонного меню**

```js
test('kitchen menu exposes category, product, and option controls', () => {
  const html = renderKitchenMenu({
    categories: buildCategorySummaries(),
    settings: normalizeKitchenSettings({ stoppedMeatIds: ['beef'] }),
    query: '',
    expandedIds: new Set(['classic-shawarma']),
  });
  assert.match(html, /data-kitchen-category-toggle="shawarma"/);
  assert.match(html, /data-kitchen-product-toggle="classic-shawarma"/);
  assert.match(html, /data-kitchen-option-toggle="meat:beef"/);
  assert.match(html, /Нет в наличии/);
});
```

- [ ] **Step 2: Запустить тест и подтвердить падение**

Run: `node --test tests/kitchen-settings.test.mjs tests/kitchen-api.test.mjs tests/kitchen-update.test.mjs`

Expected: FAIL, пока `kitchen-menu.js` и новые действия отсутствуют.

- [ ] **Step 3: Реализовать API точечных изменений**

Не отправлять весь каталог серией запросов. Использовать один запрос на одно действие:

```js
setAvailability(productId, available) {
  return jsonRequest(`/catalog/${encodeURIComponent(productId)}`, {
    method: 'PATCH',
    body: JSON.stringify({ available: Boolean(available) }),
  });
}
```

Аналогично для категории и опции.

- [ ] **Step 4: Реализовать полноэкранный режим**

В `kitchen.html` добавить отдельный view с кнопкой назад, поиском, состоянием приёма заказов и контейнером списка. В `kitchen.js` при открытии загружать `api.getSettings()`, сохранять раскрытые карточки и после каждого PATCH получать актуальное состояние.

- [ ] **Step 5: Добавить утверждённый стиль**

```css
.availability-switch[aria-checked='true'] { background: #171717; }
.availability-switch[aria-checked='true']::after { background: #fff; }
.availability-switch[aria-checked='false'] { background: #e5241f; }
.availability-state--stopped { color: #e5241f; }
```

На ширине до 767 px меню занимает весь экран; на планшете ограничивает строку читаемой шириной, но сохраняет зоны 44 px.

- [ ] **Step 6: Обновить service worker**

Добавить `kitchen-menu.js` и новую версию CSS/JS в precache; изменить cache key, чтобы установленная PWA не показывала старую панель.

- [ ] **Step 7: Запустить кухонные и PWA-тесты**

Run: `node --test tests/kitchen-settings.test.mjs tests/kitchen-api.test.mjs tests/kitchen-update.test.mjs tests/deployment.test.mjs tests/pwa-assets.test.mjs`

Expected: PASS.

- [ ] **Step 8: Зафиксировать кухонное меню**

```bash
git add kitchen-menu.js kitchen.html kitchen.css kitchen.js kitchen-api.js kitchen-sw.js tests/kitchen-settings.test.mjs tests/kitchen-api.test.mjs tests/kitchen-update.test.mjs tests/deployment.test.mjs tests/pwa-assets.test.mjs
git commit -m "feat: add kitchen menu availability controls"
```

### Task 4: Синхронизировать стоп-лист с клиентом и оформлением

**Files:**
- Modify: `home.js`
- Modify: `home.html`
- Modify: `product-sheet.js`
- Modify: `product-sheet.css`
- Modify: `checkout.js`
- Modify: `checkout.html`
- Modify: `server/src/services/orders.js`
- Test: `tests/client-api.test.mjs`
- Test: `tests/product-options.test.mjs`
- Test: `tests/checkout-consent.test.mjs`
- Test: `server/tests/orders.test.mjs`

**Interfaces:**
- Consumes: публичный `GET /api/catalog-status`.
- Produces: `applyCatalogStatus(status)`, серверная ошибка `PRODUCT_UNAVAILABLE` с `details` для блюда или опции.

- [ ] **Step 1: Добавить тесты динамического отключения**

```js
test('stopped addon is disabled in an already open product sheet', () => {
  const status = { stoppedAddonIds: ['fried-onion'] };
  assert.match(renderSheetWithStatus(status), /fried-onion[^]*disabled/);
});
```

На сервере проверить отдельные ошибки для продукта, мяса, соуса и добавки.

- [ ] **Step 2: Запустить клиентские и серверные тесты**

Run: `node --test tests/client-api.test.mjs tests/product-options.test.mjs tests/checkout-consent.test.mjs server/tests/orders.test.mjs`

Expected: FAIL, если открытый интерфейс или сервер пропускает выключенную опцию.

- [ ] **Step 3: Реализовать обновление состояния клиента**

Получать статус при загрузке, при `visibilitychange`, после SSE-события `settings.updated` и резервно не реже одного раза в 20 секунд. Обновлять карточки и открытый product sheet без перезагрузки страницы.

- [ ] **Step 4: Реализовать серверную защиту**

В `createOrdersService().create()` собрать выбранные идентификаторы и отклонить заказ до расчёта цены:

```js
if (stoppedProducts.has(item.productId)) {
  throw new DomainError('PRODUCT_UNAVAILABLE', {
    productIds: [item.productId],
  });
}
```

Повторить для мяса, соусов и добавок.

- [ ] **Step 5: Показать понятное сообщение старой корзине**

Текст содержит конкретную позицию и действие: удалить товар или выбрать замену. Уведомление центрируется и не выходит за viewport.

- [ ] **Step 6: Запустить тесты синхронизации**

Run: `node --test tests/client-api.test.mjs tests/product-options.test.mjs tests/checkout-consent.test.mjs server/tests/orders.test.mjs`

Expected: PASS.

- [ ] **Step 7: Зафиксировать клиентскую синхронизацию**

```bash
git add home.js home.html product-sheet.js product-sheet.css checkout.js checkout.html server/src/services/orders.js tests/client-api.test.mjs tests/product-options.test.mjs tests/checkout-consent.test.mjs server/tests/orders.test.mjs
git commit -m "fix: enforce live catalog availability"
```

### Task 5: Доказать автоматический возврат при отмене

**Files:**
- Modify: `server/src/routes/staff-orders.js`
- Modify: `server/src/services/payments.js`
- Modify: `server/src/payments/yookassa-provider.js`
- Modify: `server/src/repositories/payments.js`
- Modify: `server/src/repositories/staff-orders.js`
- Modify: `kitchen-api.js`
- Modify: `kitchen.js`
- Test: `server/tests/refunds.test.mjs`
- Test: `server/tests/staff-orders-history.test.mjs`
- Test: `tests/kitchen-api.test.mjs`
- Test: `tests/kitchen-update.test.mjs`

**Interfaces:**
- Consumes: `POST /api/staff/orders/:id/cancel`, сохранённый платёж заказа и серверный секрет ЮKassa.
- Produces: `paymentService.refundFull({ orderId, reason, account })` и `refundStatus: processing|succeeded|failed`.

- [ ] **Step 1: Добавить тест повторной отмены и сбоя сети**

```js
test('retry reuses the same idempotency key and never creates a second refund', async () => {
  await service.refundFull(input).catch(() => {});
  await service.refundFull(input);
  assert.equal(providerCalls[0].idempotencyKey, providerCalls[1].idempotencyKey);
});
```

Проверить, что курьер получает 403 и вызов провайдера отсутствует.

- [ ] **Step 2: Запустить refund-тесты и подтвердить падение при нарушении**

Run: `npm --prefix server test -- --test-name-pattern="refund|cancellation"`

Expected: FAIL при повторном создании возврата или доверии сумме с клиента.

- [ ] **Step 3: Завершить серверную реализацию**

Сумма и `providerPaymentId` берутся только из базы. Перед вызовом провайдера резервируется одна `refund_operations` на заказ. Повторный запрос использует сохранённый `idempotency_key`; `refund.succeeded` повторно проверяется через API ЮKassa перед переводом оплаты в `refunded`.

- [ ] **Step 4: Завершить кухонное отображение**

После отмены показывать «Возврат выполняется». История отображает `succeeded` или `failed`; для `failed` доступна одна блокируемая на время запроса кнопка повторения.

- [ ] **Step 5: Запустить refund и history тесты**

Run: `node --test server/tests/refunds.test.mjs server/tests/staff-orders-history.test.mjs tests/kitchen-api.test.mjs tests/kitchen-update.test.mjs`

Expected: PASS.

- [ ] **Step 6: Зафиксировать безопасные возвраты**

```bash
git add server/src/routes/staff-orders.js server/src/services/payments.js server/src/payments/yookassa-provider.js server/src/repositories/payments.js server/src/repositories/staff-orders.js kitchen-api.js kitchen.js server/tests/refunds.test.mjs server/tests/staff-orders-history.test.mjs tests/kitchen-api.test.mjs tests/kitchen-update.test.mjs
git commit -m "feat: complete kitchen cancellation refunds"
```

### Task 6: Исправить мобильные уведомления и увеличение полей

**Files:**
- Modify: `checkout.css`
- Modify: `product-sheet.css`
- Modify: `kitchen.css`
- Test: `tests/baseline.test.mjs`
- Test: `tests/checkout-consent.test.mjs`

**Interfaces:**
- Consumes: существующие `.toast`, input, textarea, select.
- Produces: центрированное уведомление и поля с эффективным размером шрифта минимум 16 px на iOS.

- [ ] **Step 1: Добавить CSS-регрессионные тесты**

```js
assert.match(css, /\.toast[^}]*left:\s*50%[^}]*translateX\(-50%\)/s);
assert.match(css, /@media[^}]*max-width[^]*input[^}]*font-size:\s*16px/s);
```

- [ ] **Step 2: Запустить тесты и подтвердить падение**

Run: `node --test tests/baseline.test.mjs tests/checkout-consent.test.mjs`

- [ ] **Step 3: Исправить CSS**

Уведомление ограничить `max-width: calc(100vw - 32px)` и центрировать независимо от текста. Для всех редактируемых полей на мобильных установить `font-size: 16px`; не запрещать пользователю ручное масштабирование viewport.

- [ ] **Step 4: Запустить тесты**

Run: `node --test tests/baseline.test.mjs tests/checkout-consent.test.mjs`

Expected: PASS.

- [ ] **Step 5: Зафиксировать мобильные исправления**

```bash
git add checkout.css product-sheet.css kitchen.css tests/baseline.test.mjs tests/checkout-consent.test.mjs
git commit -m "fix: polish mobile forms and notifications"
```

### Task 7: Полная локальная проверка

**Files:**
- Modify only if a test reveals a concrete defect.

**Interfaces:**
- Consumes: Tasks 1–6.
- Produces: одна проверенная версия-кандидат.

- [ ] **Step 1: Проверить формат патча**

Run: `git diff --check`

Expected: no output.

- [ ] **Step 2: Запустить клиентские тесты**

Run: `npm test`

Expected: exit 0.

- [ ] **Step 3: Запустить серверные тесты**

Run: `npm run test:server`

Expected: exit 0.

- [ ] **Step 4: Запустить интеграционный сценарий**

Run: `npm run test:integration`

Expected: заказ проходит допустимые статусы; недоступная позиция отклоняется; отмена возвращает безопасный статус возврата.

- [ ] **Step 5: Проверить production-ассеты**

Run: `node --test tests/deployment.test.mjs tests/pwa-assets.test.mjs tests/social-preview.test.mjs`

Expected: exit 0.

- [ ] **Step 6: Проверить чистоту версии-кандидата**

Run: `git status --short`

Expected: нет незакоммиченных файлов реализации.

### Task 8: Stage-публикация и ручная приёмка

**Files:**
- Modify: deployment configuration only if verification finds a version mismatch.

**Interfaces:**
- Consumes: verified commit from Task 7.
- Produces: проверенный `stage.pivdoner.ru`.

- [ ] **Step 1: Сделать резервную копию stage-базы и текущего релиза**

Run on server: `cd /opt/pivdoner && bash deploy/backup.sh`

Expected: путь к архиву базы и текущей версии; команда завершается с exit 0.

- [ ] **Step 2: Опубликовать одну совместимую версию**

Сначала отправить проверенный commit:

```bash
git push origin feat/addons-mobile-kitchen
```

Затем на сервере развернуть ровно вершину этой ветки:

```bash
cd /opt/pivdoner
git fetch origin feat/addons-mobile-kitchen
git checkout --detach FETCH_HEAD
docker compose -p pivdoner-stage -f deploy/docker-compose.stage.yml up -d --build
```

Expected: миграции применены, API и статические PWA используют один commit SHA.

- [ ] **Step 3: Проверить health и публичный статус**

Run:

```bash
curl -fsS https://stage.pivdoner.ru/api/health
curl -fsS https://stage.pivdoner.ru/api/catalog-status
```

Expected: HTTP 200; в статусе присутствуют четыре массива stopped IDs.

- [ ] **Step 4: Проверить телефон и планшет**

Ручной сценарий: кухня входит один раз, открывает «Управление → Меню», выключает говядину, соус и добавку; клиент без перезагрузки видит их недоступными; сервер отклоняет старую корзину.

- [ ] **Step 5: Проверить реальный возврат на минимальном заказе**

Создать один оплаченный заказ с согласия владельца, отменить на кухне, убедиться в трёх местах: история кухни, операция ЮKassa, итоговый статус `refunded` в API. Не считать возврат завершённым только по нажатию кнопки.

- [ ] **Step 6: Записать результаты приёмки**

Создать `docs/releases/2026-08-21-stage-acceptance.md` с commit SHA, временем теста, устройствами, номером тестового заказа и итогом возврата без секретов и персональных данных.

### Task 9: Основной релиз

**Files:**
- Create: `docs/releases/2026-08-21-production-release.md`

**Interfaces:**
- Consumes: подписанный результат Task 8.
- Produces: production release and rollback record.

- [ ] **Step 1: Подтвердить готовность production**

Требуются: зелёные тесты, успешный stage-сценарий, рабочий webhook `https://pivdoner.ru/api/payments/webhook`, резервная копия и разрешение владельца.

- [ ] **Step 2: Сделать production backup**

Run on server: `cd /opt/pivdoner && bash deploy/backup.sh`

Expected: exit 0 and recorded backup path.

- [ ] **Step 3: Опубликовать проверенный SHA**

На сервере не переключать commit после stage-проверки; развернуть текущий проверенный detached HEAD:

```bash
cd /opt/pivdoner
docker compose -p pivdoner -f deploy/docker-compose.production.yml up -d --build
```

Expected: production использует тот же SHA, который принят на stage.

- [ ] **Step 4: Выполнить smoke-check**

Проверить клиент, кухню, владельца, `api/health`, `api/catalog-status`, вход кухни, одну безопасную смену стоп-листа и её обратное включение. Не проводить второй денежный тест, если stage уже подтвердил рабочий магазин ЮKassa и webhook одинаков для production.

- [ ] **Step 5: Записать релиз и откат**

В `docs/releases/2026-08-21-production-release.md` записать SHA, время, backup path, результаты smoke-check и точную команду отката на предыдущую версию.
