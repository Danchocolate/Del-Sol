# Hotel Del Sol engineering rules

## Architecture

- Strict TypeScript npm workspaces: `apps/web`, `apps/api`, `packages/shared`.
- React/Vite/Tailwind v4/React Router/Chart.js; Fastify/Zod/Prisma/PostgreSQL.
- Domain services own business decisions; routes validate/authorize; database access stays on the server.
- Shared contracts contain no secrets or database clients. Integrations use provider interfaces.
- No OTA, channel manager, payment gateway, POS, accounting, or SMS connectivity in the base application.

## Reservation invariants

- Dates are hotel-local calendar dates, represented as ISO dates; stays are half-open [check-in, check-out).
- Allocate physical rooms transactionally for the entire stay. PostgreSQL exclusion constraints prevent active overlaps even under concurrent requests.
- Server computes price in integer minor units, capacity, quantity, promotion eligibility and limits; persist immutable price snapshots.
- Explicit legal state transitions only; persist history, events and audits in the same transaction.
- Verification is required before confirmation when enabled. Tokens are random, hashed, expiring and single use. Lookup/cancellation require email ownership.
- Cancellation/expiration atomically release allocation and are idempotent. Retain reservations and historical rooms permanently.
- Payment records describe money collected externally. Never accept card numbers, CVV or payment credentials. Corrections are append-only. Reports use posted payments.
- Pending holds consume inventory until explicit expiration. Failed email delivery never silently confirms a booking.

## Security

- Validate all inputs with Zod; use exact origins, secure headers, body limits, rate limits and Turnstile verification.
- Maintained auth library manages passwords and server sessions. Staff registration is closed. HttpOnly, production Secure, SameSite cookies; verify Origin on state-changing cookie requests.
- Server permission checks on every staff endpoint and object-level guest grants. Never store admin secrets in browser storage.
- Parameterized SQL only. No unsafe HTML. No open redirects. Do not log secrets, tokens, passwords, email bodies or unnecessary guest PII.
- Uploads require permission, size checks, signature checks and decoding; generated names; external object storage only.
- Secrets belong in environment/secret manager. Examples contain placeholders only. Fail closed in production for missing security configuration.
- Audit, status, payment and reservation event records are append-oriented. Normal admin APIs cannot delete them.

## Quality and operations

- Unit, PostgreSQL integration/concurrency and Playwright E2E tests are mandatory for critical flows.
- Before completion: install, lint, formatting, typecheck, backend/frontend tests, integration/concurrency, build, E2E and browser/security review. Report blocked checks honestly.
- Never disable security or weaken tests for a green build. Do not reset or destructively migrate production data.
- PostgreSQL jobs use leases/retries/idempotency. Email delivery uses an outbox and provider idempotency.
- Accessible responsive public and staff interfaces with explicit loading/error/empty states.
- Placeholder imagery/content must be identifiable and replaceable; do not invent verified hotel claims.
- Production requires credentials, HTTPS/domain configuration, backups, monitoring, security verification and user acceptance.
