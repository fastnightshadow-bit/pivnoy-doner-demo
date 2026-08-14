# Stage Final Acceptance Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Подтвердить техническую готовность тестового контура «Пивной Донер» и получить точный список внешних действий владельца перед включением основного домена и реальных платежей.

**Architecture:** Проверка разделена на локальные автоматические тесты, безопасный аудит развернутого stage и контролируемый сквозной сценарий с тестовыми данными. Производственный домен, старый Telegram-бот и реальные платежи не изменяются. Любая найденная ошибка сначала воспроизводится тестом и только затем исправляется.

**Tech Stack:** Static PWA, JavaScript ES modules, Node.js 22, Express 5, PostgreSQL, Docker Compose, Nginx/Caddy, RU VDS, ЮKassa API.

## Global Constraints

- Не изменять `pivdoner.ru`, старый Telegram-бот и live-настройки ЮKassa в рамках этой проверки.
- Не выводить в консоль, отчёт или Git секреты, PIN, токены доступа, телефоны и адреса покупателей.
- Для контрольных заказов использовать только вымышленные тестовые контактные данные.
- Не отмечать юридические и внешние пункты выполненными без подтверждения владельца.
- При обнаружении дефекта использовать RED → GREEN и повторять полный набор тестов.

---

### Task 1: Зафиксировать чистую техническую базу

**Files:**
- Verify: `package.json`
- Verify: `server/package.json`
- Verify: `tests/*.test.mjs`
- Verify: `server/tests/*.test.mjs`

**Interfaces:**
- Consumes: текущий HEAD ветки `feat/addons-mobile-kitchen`.
- Produces: подтвержденный локальный baseline без изменений production.

- [ ] **Step 1: Проверить чистоту worktree и текущий commit**

Run:

```powershell
git -c safe.directory=$PWD status --short
git -c safe.directory=$PWD log -1 --oneline
```

Expected: `status --short` не выводит изменений до начала проверки.

- [ ] **Step 2: Запустить полный клиентский набор тестов**

Run:

```powershell
& 'C:\Users\fastn\.cache\codex-runtimes\codex-primary-runtime\dependencies\bin\node.exe' --test tests/*.test.mjs
```

Expected: все тесты PASS.

- [ ] **Step 3: Запустить полный серверный набор тестов**

Run:

```powershell
& 'C:\Users\fastn\.cache\codex-runtimes\codex-primary-runtime\dependencies\bin\node.exe' --test server/tests/*.test.mjs
```

Expected: все тесты PASS.

### Task 2: Проверить развернутый stage без раскрытия секретов

**Files:**
- Verify: `deploy/docker-compose.production.yml`
- Verify: `deploy/nginx.conf`
- Verify: `kitchen-sw.js`
- Verify: `courier-sw.js`

**Interfaces:**
- Consumes: HTTPS endpoints `stage.pivdoner.ru` и служебный SSH-доступ к stage.
- Produces: сведения о health, версиях PWA, контейнерах и режиме оплаты только в безопасном агрегированном виде.

- [ ] **Step 1: Проверить публичный health и HTTPS**

Run:

```powershell
curl.exe -fsS https://stage.pivdoner.ru/api/health
curl.exe -fsSI https://stage.pivdoner.ru/kitchen-sw.js
curl.exe -fsSI https://stage.pivdoner.ru/courier-sw.js
```

Expected: health сообщает `ok`, service worker не имеет immutable-кэша.

- [ ] **Step 2: Проверить контейнеры и ревизию stage**

Run через SSH только с безопасными полями: имена контейнеров, состояние, health, число рестартов и `STAGE_REVISION`.

Expected: web, API и PostgreSQL запущены; API/DB healthy; число рестартов не растёт.

- [ ] **Step 3: Проверить режим оплаты без печати ключей**

Run через SSH: вывести только `PAYMENT_PROVIDER` и булевы признаки наличия `YOOKASSA_SHOP_ID`/`YOOKASSA_SECRET_KEY`, не их значения.

Expected: фактический режим задокументирован; наличие тестовых реквизитов не трактуется как разрешение на live-запуск.

### Task 3: Выполнить сквозную stage-приёмку

**Files:**
- Verify: `checkout.html`
- Verify: `kitchen.html`
- Verify: `courier.html`
- Verify: `order.html`
- Verify: `owner.html`
- Test evidence: `.superpowers/sdd/2026-08-14-stage-final-acceptance/report.md`

**Interfaces:**
- Consumes: stage API и действующие тестовые роли.
- Produces: подтверждение двух последовательных заказов без ручной перезагрузки рабочего экрана.

- [ ] **Step 1: Проверить самовывоз**

Создать тестовый заказ с вымышленным именем и телефоном, провести его по цепочке `submitted → accepted → cooking → ready → completed`.

Expected: кухня получает заказ без перезагрузки, клиентский статус обновляется автоматически.

- [ ] **Step 2: Проверить доставку на уже открытых экранах**

Не закрывая кухню, создать второй тестовый заказ доставки и провести его по цепочке `submitted → accepted → cooking → ready → courier_assigned → out_for_delivery → completed`.

Expected: кухня и курьер видят новый заказ без перезагрузки; повторные действия не создают стопку одинаковых ошибок.

- [ ] **Step 3: Проверить стоп-лист**

Через панель владельца временно отключить одну тестовую позицию, проверить недоступность у клиента и вернуть исходное состояние.

Expected: клиентский каталог получает изменение без повреждения корзины; исходное состояние восстановлено.

- [ ] **Step 4: Проверить приватность публичных ответов**

Проверить, что публичные запросы без клиентского access token не раскрывают состав заказа, адрес, телефон или внутренние поля.

Expected: закрытые данные недоступны; защищённый заказ открывается только с корректным токеном.

### Task 4: Сформировать решение о запуске

**Files:**
- Update: `.superpowers/sdd/2026-08-14-stage-final-acceptance/report.md`
- Verify: `docs/legal/owner-launch-checklist.md`
- Verify: `docs/legal/yookassa-kkt-checklist.md`
- Verify: `docs/legal/menu-approval-checklist.md`

**Interfaces:**
- Consumes: результаты Tasks 1–3 и подтверждения владельца.
- Produces: один из двух вердиктов — `GO for production preparation` или `NO-GO` с конкретными блокерами.

- [ ] **Step 1: Записать только фактически подтвержденные результаты**

Отчёт должен содержать commit/revision, числа пройденных тестов, health stage, два сквозных сценария и список невыполненных внешних пунктов без персональных данных.

- [ ] **Step 2: Отделить технические задачи от действий владельца**

Владелец отдельно подтверждает документы, уведомление Роскомнадзора, размещение базы в РФ, матрицу доступа, меню/аллергены, ККТ/ОФД/ЮKassa и письменное разрешение на production.

- [ ] **Step 3: Не включать production при наличии пустого блокирующего пункта**

Expected: основной домен и live-платежи остаются выключенными до отдельного письменного решения владельца.

