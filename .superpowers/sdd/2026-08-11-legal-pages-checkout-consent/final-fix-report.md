# Plan 1 — final review fix report

Дата: 11 августа 2026 года

Ветка/worktree: `feat/addons-mobile-kitchen`, `.worktrees/stage-2-implementation`

Итог: все четыре замечания final review исправлены; повторный независимый review не нашёл Critical/Important и дал verdict **Ready**.

## Что исправлено

### 1. Immutable cache

- `checkout.html` загружает изменённые `checkout.css` и `checkout.js` с `?v=20260811`.
- Изменённые прямые зависимости checkout загружаются с той же версией: `checkout-state.js`, `order-storage.js`, `shared/legal.js`.
- Так как `order-storage.js` используется и на других страницах, версионированы только затронутые entry/import-цепочки: `home.js`, `order.js`, `order-demo.js` и их HTML entry points.
- Непосредственная цепочка demo закрыта полностью: `order.js?v=20260811 → order-demo.js?v=20260811 → order-storage.js?v=20260811`.
- Другие, не изменённые assets массово не cache-bustились.

### 2. Минимизация browser storage

- Адрес доставки больше не записывается в `localStorage`; во время заполнения он живёт только в памяти открытой страницы.
- Старый ключ `pivnoy-doner-delivery-address-v1` удаляется при открытии checkout.
- Retry-маркер в `sessionStorage` теперь содержит ровно `{ digest, key, createdAt }`.
- `digest` — детерминированный 64-символьный hex SHA-256 от канонического order identity через Web Crypto. Base64 и обратимое кодирование не используются.
- Согласие и версии юридических документов не входят в digest. Поэтому legal-only изменение сохраняет прежний idempotency key, а изменение имени, телефона, адреса, комментария или товара создаёт новый key.
- Legacy-маркер с raw `fingerprint` мигрируется без смены key; при отсутствии Web Crypto raw marker удаляется и отправка завершается безопасной ошибкой.
- Локальный demo snapshot активного заказа очищается от имени, телефона, адреса, комментария курьеру и item comments; старые snapshots мигрируют при чтении.
- `privacy.html` теперь точно описывает local/session storage, SHA-256 retry marker и удаление legacy-адреса.

### 3. Accessibility

- Checkbox согласия остаётся изначально пустым и получил нативный `required` плюс `aria-required="true"`.
- Форма сохраняет `novalidate`, поэтому существующая custom validation, фокус и сохранение введённых данных продолжают работать.
- Добавлены отдельные светлые/тёмные токены фокуса, текста ошибки и поверхности ошибки.
- Статический тест разбирает реальные CSS hex-токены и вычисляет WCAG contrast:
  - light focus/surface: `9.13:1`;
  - light focus/error surface: `8.77:1`;
  - light error text/error surface: `6.29:1`;
  - dark focus/surface: `7.79:1`;
  - dark focus/error surface: `7.60:1`;
  - dark error text/error surface: `7.45:1`.

### 4. Empty checkout

- Empty state стал основным `<main>` и расположен до legal footer.
- Когда checkout form скрыта, legal footer больше не резервирует место под отсутствующую fixed bar.
- Убран полный `100vh` spacer; CTA и юридические ссылки доступны без лишнего scroll.

## TDD: RED

Baseline до изменений:

```powershell
& 'C:\Users\fastn\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe' --test tests/*.test.mjs
```

Результат в корне: `105 passed, 0 failed`.

Тот же command из `server`: `33 passed, 0 failed`.

Первый пакет новых регрессий:

```powershell
& 'C:\Users\fastn\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe' --test tests/deployment.test.mjs tests/checkout-consent.test.mjs tests/legal-pages.test.mjs
```

Ожидаемый RED: `45 tests; 34 passed; 11 failed`. Падения подтвердили raw PII retry marker, нестабильность/legacy edge cases, сохранённый delivery address и active-order PII, отсутствие требуемой cache version, accessibility tokens/semantics и empty-state clearance/privacy copy.

Отдельный cache-graph regression после первого GREEN:

```powershell
& 'C:\Users\fastn\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe' --test tests/deployment.test.mjs tests/checkout-consent.test.mjs
```

Ожидаемый RED: `23 tests; 22 passed; 1 failed`; assertion показал отсутствующий `./order-demo.js?v=20260811` в `order.js`. После этого были версионированы обе части demo import chain.

Дополнительные RED-проверки отдельно подтвердили, что до реализации не удалялся legacy raw marker при недоступном Web Crypto, legacy active-order оставался небезопасным в возвращаемом объекте при заблокированной записи, а `checkout.css` загружался по immutable URL без версии.

## GREEN и финальная автоматическая проверка

Focused suite из корня:

```powershell
& 'C:\Users\fastn\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe' --test tests/deployment.test.mjs tests/checkout-consent.test.mjs tests/legal-pages.test.mjs tests/delivery-policy.test.mjs tests/baseline.test.mjs
```

Результат: `59 tests; 59 passed; 0 failed`.

Полный root suite:

```powershell
& 'C:\Users\fastn\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe' --test tests/*.test.mjs
```

Результат: `117 tests; 117 passed; 0 failed`.

Полный server suite из каталога `server`:

```powershell
& 'C:\Users\fastn\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe' --test tests/*.test.mjs
```

Результат: `33 tests; 33 passed; 0 failed`.

Статические проверки:

```powershell
git diff --check
git diff --exit-code -- deploy server
```

Результат обоих commands: exit code `0`. `git diff --check` сообщил только информационные LF→CRLF warnings, whitespace errors отсутствуют. В `deploy/`, `server/`, Caddy и production domain изменений нет.

Примечание по окружению: `npm test` был недоступен (`npm` отсутствовал в `PATH`), а попытка pnpm потребовала сетевой registry и завершилась timeout на `sharp`. Зависимости не менялись и не скачивались; все проверки выполнены уже установленным bundled Node напрямую.

## Browser QA

Локальный сайт запущен установленным Node через `scripts/serve.cjs` на `http://127.0.0.1:4173`; проверка выполнена в in-app browser без обращения к production.

| Viewport / состояние | Тема | Результат |
| --- | --- | --- |
| `390×844`, populated | light | Checkbox получает фокус и объявляемую ошибку; имя, телефон, адрес и комментарий остаются в форме; fixed bar не перекрывает consent; horizontal overflow отсутствует. |
| `390×844`, populated | dark | Фокус `rgb(255, 141, 133)`, error text `rgb(255, 138, 132)` на `rgb(43, 23, 22)`; consent не перекрыт, ссылки доступны. |
| `1440×900`, populated | dark | Двухколоночный checkout, consent и legal footer доступны; overflow отсутствует. |
| `1440×900`, empty | dark | Empty `<main>` и legal footer видны в первом viewport; `scrollHeight = 900`, лишнего scroll нет. |
| `390×844`, empty | dark + light | CTA и legal footer видны в первом viewport; `scrollHeight = 844`, hidden-bar clearance и overflow отсутствуют. |

Console errors/warnings: `0`. Перед завершением browser viewport и tabs были очищены.

## Повторный review

Независимый read-only reviewer сначала нашёл одну оставшуюся Important cache-цепочку (`order-demo.js → order-storage.js`) и Minor test-gap (`novalidate`/непредзаполненный checkbox). Оба замечания исправлены через RED/GREEN. Повторный review текущего diff:

- Critical: `0`;
- Important: `0`;
- focused tests: `59/59`;
- verdict: **Ready**.

## Файлы

- `checkout.css` — компактная высота empty state.
- `checkout.html` — versioned assets, required checkbox, порядок empty/legal landmarks.
- `checkout.js` — SHA-256 retry marker, legacy address purge, page-memory address, awaited key.
- `client-theme.css` — contrast tokens и empty footer clearance.
- `home.html`, `home.js` — точечная cache version для изменённого storage dependency.
- `order.html`, `order.js`, `order-demo.js` — полная versioned import chain.
- `order-storage.js` — очистка PII из demo active-order storage и legacy migration.
- `privacy.html` — точное описание минимального browser storage.
- `tests/checkout-consent.test.mjs` — storage/idempotency/accessibility regressions.
- `tests/deployment.test.mjs` — immutable-cache regressions.
- `tests/legal-pages.test.mjs` — privacy и empty-layout regressions.
- `.superpowers/sdd/2026-08-11-legal-pages-checkout-consent/final-fix-report.md` — этот отчёт.

## Ограничения и оставшиеся действия

- Web Crypto SHA-256 требует secure context; production HTTPS и localhost его поддерживают. В несовместимом/небезопасном окружении checkout намеренно fail-closed и не пишет raw fallback.
- Серверная фиксация/проверка согласия и дальнейшие production rollout шаги относятся к следующим планам; в этом fix wave server persistence, deploy, Caddy и домены не менялись.
- Юридические тексты остаются рабочими проектами и должны быть окончательно утверждены владельцем/профильным юристом, как указано в approved spec.
