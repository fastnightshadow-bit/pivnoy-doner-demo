# Контракт API стойки самообслуживания

Публичная стойка использует префикс `/api/kiosk`. Все цены, доступность и итог заказа подтверждает сервер. Браузер не получает секретные ключи ЮKassa и платёжного терминала.

## Общие правила

- Формат данных: JSON, UTF-8.
- Авторизация устройства настраивается сервером и не отображается посетителю.
- Изменяющие запросы принимают заголовок `Idempotency-Key`.
- События стоп-листа передаются через Server-Sent Events.
- Ошибка возвращается как `{ "message": "Понятное сообщение" }` с подходящим HTTP-кодом.

## Загрузка меню

`GET /api/kiosk/bootstrap`

Ответ содержит `products`, `settings` и `serverTime`. Поля `settings`:

- `acceptingOrders` — принимает ли ресторан новые заказы;
- `stoppedProductIds` — недоступные позиции;
- `stoppedMeatIds` — недоступные виды мяса;
- `stoppedSauceIds` — недоступные соусы;
- `stoppedAddonIds` — недоступные добавки.

## Создание заказа

`POST /api/kiosk/orders`

Тело: `{ "fulfillment": "dine-in|takeaway", "lines": [] }`.

Ответ: `{ "order": { "id", "number", "status", "total" }, "serverTime" }`.

## Обновления

`GET /api/kiosk/events`

Минимальное событие стоп-листа:

```json
{
  "type": "settings.updated",
  "settings": {
    "acceptingOrders": true,
    "stoppedProductIds": [],
    "stoppedMeatIds": [],
    "stoppedSauceIds": [],
    "stoppedAddonIds": []
  }
}
```

Маршруты проверки корзины и оплаты описываются в следующих этапах реализации. Физическая оплата картой подключается только после выбора модели терминала.
