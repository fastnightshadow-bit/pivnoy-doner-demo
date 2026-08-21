# Stage acceptance — 21 August 2026

- Application commit: `3c61776`
- Stage URL: `https://stage.pivdoner.ru`
- Backup: `/root/backups/pivdoner-stage/20260821T162426Z`

## Automated evidence

- Client tests: 226 passed, 0 failed.
- Server tests: 123 passed, 0 failed.
- End-to-end order-flow test: 1 passed, 0 failed.
- Git patch check: clean.

## Stage smoke check

- `GET /api/health`: database is up.
- `GET /api/catalog-status`: all four availability arrays are present.
- Kitchen PWA serves release `2026082102` and the full-screen menu view.
- Kitchen disabled the `tasty` sauce, the public API reflected it, and the sauce was restored immediately.
- Final stage state: no stopped sauces or add-ons; the pre-existing stopped beef setting was preserved.

## Scope note

The refund implementation was not changed in this release. Its full-refund, idempotency,
provider-verification, retry, and role restrictions are covered by the passing server suite.
No additional real-money refund was initiated during this deployment.
