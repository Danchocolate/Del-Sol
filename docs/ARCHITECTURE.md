# Architecture and implementation plan

1. Establish workspace tooling, shared Zod contracts, PostgreSQL schema and additive migrations.
2. Implement inventory, pricing, promotions and reservation transitions as transactional services; prove concurrency invariants against PostgreSQL.
3. Add Better Auth staff sessions, centralized permissions, guest email grants, anti-abuse controls, outbox/expiration worker and audit records.
4. Implement room/CMS/media/promotion/user/settings/payment/report operations through authorized APIs.
5. Build the public hotel experience, booking/verification/lookup flows and operational staff dashboard.
6. Run quality gates, browser checks and security review; document deployment requirements and remaining limitations.

## Model

Staff User/Account/Session/Verification are managed by Better Auth. Guest records belong to reservations and never become staff accounts. RoomType groups physical Room inventory; amenities and ordered images describe it. Reservation owns immutable room/night price snapshots, allocations, history/events, email tokens and short-lived guest access grants. Promotions have explicit targeting and transactionally counted redemptions. Payments are immutable signed ledger entries, with reversals referencing originals. Gallery, content/settings, notifications, audit records and leased email outbox jobs support operations. Future integration mappings contain secret-manager references only.

## Trust boundaries

Browser input is untrusted. API validates and recalculates. Staff sessions authorize permissions; guest grants authorize one reservation. PostgreSQL is the inventory authority. Resend, Turnstile and object storage are external providers with bounded requests. Email tokens are never logged; durable delivery payloads containing tokens are encrypted using a deployment-provided key and standard authenticated encryption.

## Defaults and assumptions

- PHP currency, Asia/Manila hotel timezone, 14:00 check-in, 12:00 check-out; configurable property content. No taxes/fees invented: stored rates are all-in; real tax policy needs hotel acceptance.
- One room type per reservation; quantity supports multiple physical rooms of that type. Guests must fit total capacity and at least one guest per selected room.
- Unverified hold: 30 minutes; verified booking: manual confirmation by default. Maximum 4 rooms and 30 nights. Cancellation cutoff: 24 hours before configured local check-in.
- Pending/confirmed/checked-in allocations block dates. Checked-out/no-show/cancelled/expired release allocations while preserving records.
- One promotion per reservation. Redemption consumes a use at hold creation and releases on cancellation/expiration; per-email limit checked transactionally. Targeted room promotions apply only if every allocated room matches.
- Lookup links issue short-lived HttpOnly reservation-scoped sessions after explicit POST exchange. Links use fragments so tokens do not reach URL access logs or Referer headers.
- Deploy API and web under one HTTPS origin; Vite proxies `/api` locally. State-changing browser requests require the exact allowed Origin and JSON (uploads use multipart with Origin enforcement).
- Single API process rate limiter supplemented by PostgreSQL email quotas; production replicas need an edge/global IP limiter. Auth library uses database rate-limit storage.
- Development email transport captures encrypted outbox into a protected local development inbox; never available in production. No fake external provider connectivity.
- Reservation mutations take a shared hotel inventory advisory lock for predictable correctness at V1 scale; a database exclusion constraint remains the final overlap guard. This intentionally trades write throughput for a simple auditable correctness model.

## Data safety

No delete endpoints for reservations, room inventory, staff, payments or audits. Initial migration only creates new objects. Subsequent changes require reviewed additive migrations, backup/restore tests and separately approved destructive steps.
