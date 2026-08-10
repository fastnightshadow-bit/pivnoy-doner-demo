# Восстановление «Пивного Донора»

1. Остановить только новый проект: `docker compose -p pivdoner -f /opt/pivdoner/deploy/docker-compose.production.yml down`.
2. Старые контейнеры и их volumes не удалять. При необходимости запустить их прежней командой Compose.
3. Проверить архив: `cd /root/backups/pivdoner-migration/<UTC-время> && sha256sum -c SHA256SUMS`.
4. Восстановить новый PostgreSQL только в пустой volume командой `pg_restore` из файла `pivdoner-postgres.dump`.
5. Перед изменением Caddy проверить конфигурацию: `docker exec caddy caddy validate --config /etc/caddy/Caddyfile`.
6. После восстановления проверить `/api/health`, клиент, кухню и один тестовый заказ.

Переключение на старую систему выполняется без удаления `/opt/pivdoner` и `pivdoner_pg_data`, чтобы сохранить возможность разбора причины и повторного запуска.
