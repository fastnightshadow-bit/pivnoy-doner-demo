# Client Desktop Polish Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Исправить приостановку приёма заказов и контраст тёмной темы, затем привести desktop-блок «Хит», футер и корзину к утверждённой композиции A без изменения мобильного UX.

**Architecture:** Сервер остаётся последней точкой защиты и отклоняет новые заказы при `acceptingOrders=false`; клиент подписывается на тот же публичный статус и блокирует действия заранее. Визуальные изменения ограничиваются desktop media queries и семантическими токенами тем, а новое фото хранится отдельным оптимизированным WebP-ресурсом.

**Tech Stack:** HTML, CSS, JavaScript ES modules, Node test runner, Express, ImageGen, WebP.

## Global Constraints

- Мобильная версия 390 px сохраняет утверждённую композицию.
- Desktop-изменения начинаются с 1024 px и проверяются на 1024×768 и 1440×900.
- Красный остаётся акцентом; фон светлый или системный тёмный.
- Новое изображение не содержит текста, логотипа, кнопок или водяных знаков.
- Основной домен, Telegram-бот и боевая ЮKassa не изменяются.
- Публикация выполняется только на `stage.pivdoner.ru` после полного тестирования.

---

### Task 1: Приостановка заказов и контраст недоступности

**Files:**
- Modify: `server/src/services/orders.js`
- Modify: `server/src/routes/orders.js`
- Modify: `checkout.js`
- Modify: `home.js`
- Modify: `home-menu.js`
- Modify: `product-sheet.js`
- Modify: `client-theme.css`
- Test: `server/tests/orders.test.mjs`
- Test: `tests/checkout-consent.test.mjs`
- Test: `tests/product-options.test.mjs`
- Test: `tests/baseline.test.mjs`

**Interfaces:**
- Produces: `DomainError('ORDERING_PAUSED')`, HTTP 409, `isCheckoutOrderingPaused(status)`, `getOrderingPausedMessage()`, опция `unavailableLabel` для карточек и карточки блюда.

- [ ] Запустить добавленные регрессионные тесты и подтвердить падения по отсутствующим контрактам.
- [ ] В `createOrderService.create()` после восстановления идемпотентного заказа прочитать настройки и до ценообразования выбросить `ORDERING_PAUSED`, если `acceptingOrders === false`.
- [ ] Сопоставить `ORDERING_PAUSED` с HTTP 409.
- [ ] Добавить клиентские функции состояния, сообщение «Приём заказов временно приостановлен. Корзина сохранена.» и проверку перед отправкой checkout.
- [ ] Хранить `acceptingOrders` в состоянии главной; блокировать покупку всех товаров с подписью «Приём заказов закрыт», сохраняя отдельную подпись стоп-листа.
- [ ] Добавить явные тёмные правила для бейджа, кнопки и нижней панели недоступного блюда.
- [ ] Запустить focused-тесты до полного GREEN.

### Task 2: Новое изображение и desktop-блок «Хит»

**Files:**
- Create: `assets/mobile-home/hit-desktop-v2.webp`
- Modify: `home.html`
- Modify: `home.css`
- Test: `tests/baseline.test.mjs`

**Interfaces:**
- Produces: отдельный desktop `<source media="(min-width: 1024px)">`; мобильный `hit-sales.webp` остаётся fallback.

- [ ] Добавить RED-проверку desktop source, доступного alt и отсутствия текста внутри нового изображения.
- [ ] Сгенерировать широкую натуральную фотографию классической шаурмы на тёплом белом фоне без текста и реквизита.
- [ ] Проверить изображение визуально, сохранить в WebP и ограничить разумный вес файла.
- [ ] Перестроить desktop-карточку в сетку 62/38, добавить интерфейсный бейдж «Хит продаж», вес и ровные внутренние отступы.
- [ ] Сохранить мобильные стили вне desktop media query без изменений.
- [ ] Запустить focused-тесты.

### Task 3: Полноширинный футер

**Files:**
- Modify: `home.html`
- Modify: `cart.html`
- Modify: `checkout.html`
- Modify: `order.html`
- Modify: `client-theme.css`
- Modify: page CSS only where legacy layout overrides the shared footer
- Test: `tests/baseline.test.mjs`
- Test: `tests/legal-pages.test.mjs`

**Interfaces:**
- Produces: единая структура `.client-footer__brand`, `.client-footer__social`, `.client-footer__legal`.

- [ ] Добавить RED-проверки единой структуры и обязательных ссылок.
- [ ] Привести разметку клиентских страниц к трём логическим группам.
- [ ] Сделать desktop grid без пустой боковой колонки и адаптивный перенос для телефона.
- [ ] Добавить hover/focus и тёмную тему через системные токены.
- [ ] Запустить focused-тесты.

### Task 4: Desktop-корзина без обрезания

**Files:**
- Modify: `cart.html`
- Modify: `cart.css`
- Test: `tests/baseline.test.mjs`

**Interfaces:**
- Produces: `.cart-desktop-layout` с основной колонкой и sticky `.cart-checkout`; рекомендации остаются горизонтальными на телефоне и становятся доступной сеткой/полосой на desktop.

- [ ] Добавить RED-проверки desktop grid, безопасных отступов и отсутствия старой боковой юридической колонки.
- [ ] Перегруппировать существующие секции без изменения cart JS data-атрибутов.
- [ ] На desktop разместить товары и рекомендации слева, итог справа; убрать фиксированные размеры, обрезающие последнюю карточку.
- [ ] На мобильном сохранить текущую нижнюю CTA-панель.
- [ ] Запустить focused-тесты.

### Task 5: Cache graph, полная проверка и stage-only rollout

**Files:**
- Modify: versioned HTML/module references affected by Tasks 1–4
- Modify: `tests/deployment.test.mjs`

**Interfaces:**
- Produces: единый новый immutable release key во всём изменённом графе.

- [ ] Поднять release key и обновить все изменённые CSS/JS импорты без незаверсионированных зависимостей.
- [ ] Запустить client full suite, server full suite, syntax checks и `git diff --check`.
- [ ] Провести визуальную проверку 390×844, 1024×768, 1440×900, в светлой и тёмной теме.
- [ ] Проверить реальное выключение приёма заказов: публичный статус, заблокированный UI, HTTP 409; обязательно вернуть настройку в исходное состояние.
- [ ] Создать commit и push.
- [ ] Сделать резервную копию stage, развернуть только stage API/web, выполнить health и smoke checks.
