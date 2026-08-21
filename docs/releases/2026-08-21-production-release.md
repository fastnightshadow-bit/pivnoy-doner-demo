# Production release — 21 August 2026

- Application commit: `3c61776`
- Customer URL: `https://pivdoner.ru`
- Kitchen URL: `https://kitchen.pivdoner.ru`
- Production database backup: `/root/backups/pivdoner-migration/20260821T162925Z`
- Previous application files backup: `/root/backups/pivdoner-stage/20260821T162426Z/pivdoner-files.tar.gz`

## Smoke check

- Production API and web containers are healthy.
- `GET /api/health` reports `database: up`.
- Public catalog status returns products, meat, sauces, and add-ons.
- Kitchen subdomain serves the new full-screen availability interface.
- A production sauce availability toggle propagated to the public API and was restored.
- Final production catalog state has no stopped products, meats, sauces, or add-ons.

## Rollback

The release did not require a database migration, so an application rollback does not need a
database restore. Run on the server:

```bash
tar -xzf /root/backups/pivdoner-stage/20260821T162426Z/pivdoner-files.tar.gz -C /opt
cd /opt/pivdoner
docker compose --env-file deploy/.env -p pivdoner -f deploy/docker-compose.production.yml up -d --build
```
