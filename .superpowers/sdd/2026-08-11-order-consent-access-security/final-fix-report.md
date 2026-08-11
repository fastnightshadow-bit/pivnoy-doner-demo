# Final order consent and access security fix report

Status: **DONE**

Date: 2026-08-12

Scope: one consolidated final-review fix wave. No deployment was attempted, and no stage database, main domain, legacy bot, or legacy site was changed.

Implementation commit: `292321327c0346ff0aa7015ecf202f661d8c4776` (`fix: close final order access security gaps`)

## TDD RED/GREEN evidence

The baseline was green before the regression tests were added: root 131/131 and server 60/60.

| Finding | RED evidence captured before implementation | GREEN evidence after implementation |
| --- | --- | --- |
| 1. Staff-safe order representation | `server/tests/staff-orders-security.test.mjs`: 0/2 passed. A staff response contained credential/proof fields, and the repository query still selected `o.*`. | 2/2 passed. Staff SQL and serialization now use explicit allowlists; idempotency keys, access-token hashes, consent proofs, and other internals are absent. |
| 2. Payment ownership and provider-result validation | Focused payment regressions: 0/4 passed. There was no pre-provider reservation, a forced race made two provider calls, a mismatched provider result was accepted, and an orphan/colliding provider ID was accepted. | 4/4 passed. Ownership is atomically reserved before provider creation, cross-order reuse fails before the provider call, and provider ID/order/amount/currency are validated before conditional finalization. |
| 3. Complete immutable cache graph | Focused deployment regression: 0/1 passed because customer entry/dependency URLs used stale release keys. | 1/1 passed. The full `home`, `checkout`, and `order` module graph uses release key `2026081202`; the test rejects stale keys. |
| 4. Polling lifecycle and privacy disclosure | Focused polling regressions: 0/2 passed because timers remained active after terminal status and permanent 401/403/404 errors. Focused legal regression: 0/1 passed because local secret-token storage was not disclosed. | Polling 2/2 and legal disclosure 1/1 passed. Permanent/terminal polling stops, while stored credentials remain available for completed-order reviews. Privacy text discloses local order ID and secret-token storage and states that the token is not put in the URL. |
| 5. Secret rotation retry behavior | Focused order regression: 0/1 passed because a retry after `ORDER_ACCESS_SECRET` rotation returned 200 with a token that did not match the stored hash. | 1/1 passed. A recovered token is checked against the stored hash; an unrecoverable rotated-secret retry returns explicit 409 `ORDER_ACCESS_TOKEN_UNAVAILABLE`. |
| 6. Idempotent representation parity | Focused production-shaped repository regression: 0/1 passed because the recovery path did not perform an item-aware read and serialized `items: []`. | 1/1 passed. Recovery reloads through `findById`, returning the original item-aware public representation. |

Total new regression evidence: 12 expected RED failures across all six findings, followed by 12/12 GREEN.

## Implementation summary

- Added a strict staff-order domain serializer and replaced broad SQL row/JSON selection with explicit safe fields.
- Added payment idempotency reservation and conditional completion, including race, ownership, provider mismatch, and provider-ID collision handling. The mock provider now models idempotent provider behavior.
- Made idempotent order recovery item-aware and rejected tokens that cannot be reproduced after secret rotation.
- Updated the complete customer module cache-busting graph to one coherent release key.
- Stopped polling on terminal order states and permanent authorization/not-found failures without deleting review credentials.
- Added the required browser-credential disclosure to the privacy page.

## Verification

Focused and affected suites:

- Staff security: 2/2 passed.
- Payment ownership/provider validation: 4/4 passed.
- Cache graph: 1/1 passed.
- Rotation and item parity: 2/2 passed.
- Polling lifecycle: 2/2 passed.
- Privacy disclosure: 1/1 passed.
- Affected server test group: 33/33 passed.
- Affected client test group: 54/54 passed.

Full suites, run from the final current tree with the bundled Node/pnpm runtime:

- Root command: `pnpm test` -> 134 tests, 134 passed, 0 failed.
- Server command: `pnpm --dir server test` -> 66 tests, 66 passed, 0 failed.
- Syntax command: `node --check` over all 20 changed JavaScript/MJS files -> `syntax-ok 20 files`.
- `git diff --check` -> exit 0, no whitespace errors.

Targeted audits:

- No sensitive-token/idempotency-key console logging was found.
- Every customer entry and transitive module URL in scope uses `2026081202`.
- Staff SQL/serializer audit found no `o.*`, `idempotency_key`, `access_token_hash`, `personal_data_consent*`, or `offer_version` exposure.
- Remaining access-token/idempotency-key references were reviewed as intentional internal authorization, hashing, repository, or provider-idempotency uses; none are returned in staff/review responses or put in URLs.

## Changed files

- `checkout.html`
- `checkout.js`
- `client-api.js`
- `home.html`
- `home.js`
- `order-demo.js`
- `order.html`
- `order.js`
- `privacy.html`
- `server/src/domain/staff-order.js`
- `server/src/payments/mock-provider.js`
- `server/src/repositories/payments.js`
- `server/src/repositories/staff-orders.js`
- `server/src/routes/orders.js`
- `server/src/routes/staff-orders.js`
- `server/src/services/orders.js`
- `server/src/services/payments.js`
- `server/tests/order-flow.test.mjs`
- `server/tests/orders.test.mjs`
- `server/tests/payments.test.mjs`
- `server/tests/staff-orders-security.test.mjs`
- `tests/client-api.test.mjs`
- `tests/deployment.test.mjs`
- `tests/legal-pages.test.mjs`

## Self-review

- Staff output is allowlist-based at both query and serialization boundaries, so adding a private database column cannot silently expose it.
- Payment ownership is established before external side effects. Cross-order collisions stop before provider creation; same-order recovery reuses the provider idempotency key; conditional completion prevents a losing request from overwriting the reservation.
- Provider results must contain a non-empty ID and exactly match the target order, amount, and RUB currency. Existing provider IDs are accepted only when their local ownership/result identity matches.
- Secret-rotation retries never return a bearer token unless it matches the persisted hash, and idempotent hits reload the original items.
- Polling stops for completed/cancelled and permanent 401/403/404 outcomes, but credentials are deliberately retained for review submission. Expiry remains deferred to the separate retention plan.
- Cache keys are coherent across entries and transitive imports, and automated tests cover the entire graph.
- No unrelated dependency artifacts or lockfile were committed. No deployment or external-system mutation occurred.

An additional scoped independent re-review is being performed by the controller after this handoff, as requested; this report records the implementation self-review and verification evidence.
