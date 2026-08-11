# Ежедневное хранение персональных данных

Сервис `retention` изолирован профилем Compose и не запускается обычной командой `up`. Не включайте профиль, пока тест на отдельной копии базы и dry-run на stage не подтвердят ожидаемые количества записей.

Все команды ниже выполняются из `/opt/pivdoner`, когда сервисы `api` и `db` уже запущены и здоровы.

## 1. Dry-run перед первым запуском

Эта команда заменяет ежедневную команду сервиса на безопасный просмотр и не изменяет базу:

```bash
docker compose -p pivdoner -f deploy/docker-compose.production.yml --profile retention run --rm --no-deps retention node src/scripts/retention.js --dry-run
```

Проверьте только агрегированные количества по каждой категории. Вывод не должен содержать телефоны, адреса, имена, комментарии, токены, идентификаторы заказов или payload платёжного провайдера. Если количество неожиданно, не запускайте сервис: сохраните вывод, проверьте резервную копию и разберите данные на отдельной копии PostgreSQL.

## 2. Включение после проверки

Профиль и имя сервиса указываются явно. `--no-deps` не перезапускает `web`, `api` или `db`:

```bash
docker compose -p pivdoner -f deploy/docker-compose.production.yml --profile retention up -d --no-deps retention
```

При старте сервис выполняет применение один раз, затем повторяет его каждые 86 400 секунд. Ошибка завершает контейнер; политика `unless-stopped` запускает его снова.

## 3. Проверка агрегированных логов

```bash
docker compose -p pivdoner -f deploy/docker-compose.production.yml --profile retention logs --tail=100 retention
```

После первого применения сравните агрегированные количества с принятым dry-run. Не копируйте персональные данные в общие журналы или отчёты.

## 4. Остановка только retention

```bash
docker compose -p pivdoner -f deploy/docker-compose.production.yml --profile retention stop retention
```

Команда не останавливает `web`, `api` или `db`. Для повторного запуска после нового dry-run используйте:

```bash
docker compose -p pivdoner -f deploy/docker-compose.production.yml --profile retention start retention
```
