# Hotel Del Sol

A hotel website, direct reservation service and employee operations dashboard. React + TypeScript + Vite + Tailwind CSS v4 + React Router + Chart.js, backed by Fastify + Zod + PostgreSQL + Prisma. Better Auth manages employee passwords and server sessions. Guests use reservation-scoped email links, without accounts.

This is a working first implementation for local evaluation, **not a production-readiness certification**. Final hotel content, infrastructure, provider credentials, security verification and user acceptance remain launch requirements.

## Local setup

Use Node.js 24 LTS, npm and PostgreSQL 16+. The declared runtime range also allows Node 22.13+ within the 22.x line. The database needs the `btree_gist` extension. This implementation pins Prisma 6.19.3; upgrade deliberately and preserve the custom SQL constraints and triggers.

```sh
npm ci
```

On this Windows machine, PostgreSQL 18 is already installed. The following creates an isolated cluster **inside `.local/postgres`**, listening only on `127.0.0.1:55432`. It does not reset or alter the existing PostgreSQL service. It generates random local credentials in ignored `.env` and creates separate development, integration and browser-test databases.

```sh
npm run dev:setup
npm run db:generate
npm run db:migrate
npm run db:seed
npm run dev
```

Open [the hotel website](http://127.0.0.1:5173) or [staff sign-in](http://127.0.0.1:5173/admin). The API is on `127.0.0.1:3001`. `npm run dev` starts the API, web app and outbox/expiration worker. Use the `SEED_ADMIN_EMAIL` and `SEED_ADMIN_PASSWORD` values in your local `.env`; credentials are never printed by the setup or seed scripts. The seed is repeatable, restricted to localhost, and does not overwrite existing edits or reset passwords.

For an existing local PostgreSQL installation elsewhere, copy `.env.example` to `.env`, create the three empty databases and supply your connection URLs. Generate distinct strong auth and outbox secrets. Do not run `dev:setup` against non-local URLs. `PG_BIN` can select the PostgreSQL binary directory. The local cluster can be stopped with `pg_ctl -D .local/postgres stop -m fast` using the installed PostgreSQL binary.

## Commands

| Command                    | Purpose                                              |
| -------------------------- | ---------------------------------------------------- |
| `npm run dev`              | API, Vite and background worker                      |
| `npm run build`            | Shared contracts, API and production web bundle      |
| `npm run typecheck`        | All workspace TypeScript checks                      |
| `npm run lint`             | ESLint; explicit `any` prohibited                    |
| `npm run format:check`     | Prettier verification                                |
| `npm test`                 | Domain and React tests                               |
| `npm run test:integration` | Real PostgreSQL/API/concurrency tests                |
| `npm run test:e2e`         | Playwright guest, staff and responsive journeys      |
| `npm run db:generate`      | Regenerate Prisma client                             |
| `npm run db:migrate`       | Apply reviewed committed migrations                  |
| `npm run db:seed`          | Local rooms, content, promotion and initial employee |
| `npm audit`                | Dependency advisory check                            |

Install the browser used by E2E once. In PowerShell:

```powershell
$env:PLAYWRIGHT_BROWSERS_PATH = Join-Path (Get-Location) '.local\browsers'
npm exec playwright install chromium
npm run test:e2e
```

On POSIX: `PLAYWRIGHT_BROWSERS_PATH="$PWD/.local/browsers" npx playwright install chromium`.

Playwright starts isolated API/web servers on ports 3002/5174. Test configuration refuses non-local database URLs or database names without `_test`. Tests retain history and append unique fixtures; they never reset a schema. Browser tests replace only the Turnstile **client widget** and use Cloudflare's official test token with the real server-side Siteverify endpoint. They therefore need network access to Cloudflare. Provider-failure tests mock the provider boundary, never disable production controls.

## Architecture and directory overview

```text
apps/
  api/
    prisma/                 # Normalized schema, additive SQL migrations, dev seed
    src/
      app.ts                # Fastify composition, security hooks, safe errors
      config.ts             # Validated environment; production fails closed
      lib/                  # DB transactions, token hashing, outbox encryption
      modules/
        auth/               # Better Auth, permissions, Turnstile, email quotas
        availability/       # Hotel dates, capacity and physical room selection
        reservations/       # Booking, verification, grants, transitions, cancellation
        rooms/              # Types, amenities, physical inventory and date blocks
        promotions/         # Server pricing, redemption limits and management
        payments/           # Immutable external-payment ledger and reversals
        gallery/            # CMS, image validation and S3-compatible object storage
        users/              # Employee access, policy settings, audit queries
        notifications/      # Encrypted outbox and bounded Resend delivery
        reports/            # Operations, payment revenue, trends, notifications
        audit/              # Append-oriented audit writer
        integrations/       # Provider contracts only
      worker.ts             # Idempotent expiration and outbox loop
  web/src/
    pages/                  # Hotel, rooms, gallery, contact, booking and guest access
    admin/                  # Staff shell, tables, forms, reports and management
    components/             # Reusable navigation, fields, room/search components
    lib/                    # Typed API client, shared view types
packages/shared/            # Strict Zod contracts, statuses, roles, permissions
tests/                      # Unit, PostgreSQL integration and Playwright tests
docs/                       # Architecture, design, deployment and verification notes
scripts/                    # Local PostgreSQL setup
```

The database contains employee auth users/accounts/sessions, guests, room types/physical rooms/images/amenities, maintenance blocks, reservations/allocations/status history/events, hashed verification tokens and access grants, payments/reversals, promotions/targets/redemptions, gallery/content, notifications, settings, append-only audits, encrypted outbox jobs and quotas. Future integration/property/room/rate mappings, sync logs and deduplicated webhook records are schema-only extension points. External credentials would be stored in a secret manager and referenced by identifier, never plaintext columns.

See [architecture decisions](docs/ARCHITECTURE.md), [project rules](AGENTS.md), [deployment notes](docs/DEPLOYMENT.md), [Vercel setup](docs/VERCEL.md), [Supabase transition plan](docs/SUPABASE.md) and [verification notes](docs/VERIFICATION.md).

## Reservation correctness

- One room type per reservation, with multiple physical rooms allocated for the **whole** stay. Total physical capacity must fit all guests.
- Calendar dates use the hotel timezone and half-open intervals `[check-in, check-out)`. Checkout does not block a same-day arrival.
- Mutations take a property-level PostgreSQL transaction advisory lock; a GiST exclusion constraint independently rejects overlapping active physical-room allocations. This favors auditable correctness over high write throughput.
- The server calculates integer-centavo pricing and discounts. Historical rate and policy snapshots survive later edits. One promotion per booking; limits and per-email redemptions are checked inside the allocation transaction.
- Unverified reservations hold inventory for a configurable period. Verification links expire in 15 minutes or at hold expiry, whichever occurs first. A resend invalidates prior verification links. The hold's original expiry does not extend on resend.
- Status transitions are explicit. Verification precedes confirmation when required. Confirmation is manual by default. Check-in must occur during the booked stay. No-show is allowed from the arrival date.
- Cancellation and expiration release allocation and promotion redemption in the same transaction, retain the reservation and create history/audit/email records. Repeated cancellation is harmless. Staff may override guest cancellation cutoffs, with an audit trail.
- Creation and external-payment recording accept idempotency keys; reuse with a different payload conflicts.

## Security controls

Every protected endpoint authenticates an active employee and checks centralized permissions. Public staff signup is disabled. Role changes revoke sessions. Better Auth handles password hashing and session cookies; no admin secrets enter browser storage. Guest lookup never reveals booking details from a reference alone. A single-use email token is exchanged by POST for an expiring HttpOnly reservation-scoped cookie. Raw tokens are SHA-256 hashed in token/grant tables; email payloads are AES-256-GCM encrypted while queued. Email links use URL fragments and `no-referrer` to avoid token exposure in request logs.

Exact Origin checks protect state-changing requests, including auth and multipart upload endpoints. Exact CORS, HttpOnly/SameSite cookies, production Secure cookies, request limits, security headers, Zod validation, per-IP rate limiting, database-backed auth limits and email quotas are enforced. Turnstile is validated by the server; production rejects test keys. Only parameterized Prisma/SQL queries are used. Guest content is rendered as text, never unsafe HTML.

Images are size-limited, signature-checked, decoded with a pixel ceiling, stripped of metadata, resized and re-encoded to WebP. Objects use generated keys and external storage; unconfigured storage returns an explicit error. No permanent upload files are written to the API server. Gallery removal is archive-only. Database triggers prevent edits/deletion of payments, audit entries and status/event history. Reservations cannot be deleted.

No card numbers, CVV, banking passwords or payment credentials are accepted. Payment methods describe money collected externally. Corrections are signed reversal entries; reports total posted payments net of reversals.

## Environment

Only `VITE_TURNSTILE_SITE_KEY` is public. Never prefix a secret with `VITE_`.

| Variables                                                                  | Use                                                     |
| -------------------------------------------------------------------------- | ------------------------------------------------------- |
| `DATABASE_URL`                                                             | Runtime PostgreSQL URL                                  |
| `TEST_DATABASE_URL`, `E2E_DATABASE_URL`                                    | Separate localhost test databases                       |
| `APP_ORIGIN`, `PORT`, `NODE_ENV`                                           | Exact web origin, API port, runtime mode                |
| `BETTER_AUTH_SECRET`                                                       | At least 32 random bytes for auth integrity             |
| `OUTBOX_ENCRYPTION_KEY`                                                    | 32 random bytes encoded as 64 hex characters            |
| `EMAIL_PROVIDER`                                                           | `development` or `resend`; production requires `resend` |
| `RESEND_API_KEY`, `EMAIL_FROM`                                             | Verified Resend sender/domain and secret                |
| `TURNSTILE_SECRET_KEY`, `TURNSTILE_HOSTNAME`                               | Server validation and expected hostname                 |
| `VITE_TURNSTILE_SITE_KEY`                                                  | Public Turnstile site key; supplied at build time       |
| `STORAGE_ENDPOINT`, `STORAGE_REGION`, `STORAGE_BUCKET`                     | S3-compatible storage, e.g. R2                          |
| `STORAGE_ACCESS_KEY_ID`, `STORAGE_SECRET_ACCESS_KEY`, `STORAGE_PUBLIC_URL` | Scoped storage credentials and public media base        |
| `SENTRY_DSN`                                                               | Optional sanitized server error monitoring              |
| `SEED_ADMIN_EMAIL`, `SEED_ADMIN_PASSWORD`                                  | Development bootstrap only                              |

Development emails appear in **Staff → Development inbox**, restricted to SUPER_ADMIN and unavailable in production. No real email is sent in this mode. The `.env.example` Turnstile values are public vendor test keys, not live credentials.

## Implemented and deferred

Implemented: premium responsive hotel pages; room details; live availability and multi-room requests; pricing/promotions; verification/status email templates; secure lookup/cancellation; staff login/RBAC; room types/rooms/date blocks/images/amenities; reservation actions/history; payment ledger/corrections; operational dashboard and Chart.js reports; notifications; CMS/gallery; staff access management; policy settings; immutable audits; PostgreSQL jobs; storage/notification/channel extension points; sanitized Sentry preparation.

**Not part of this base build:** Agoda integration, Booking.com integration, Airbnb integration, Expedia integration, channel-manager integration, payment gateway integration, POS integration, accounting integration, and SMS integration. No fake connectivity is provided.

Before production: configure real property details/photos/rates, legal/privacy and tax policy, HTTPS/domain/static headers, restricted database roles and backups, Resend domain verification, real Turnstile keys, object storage and lifecycle cleanup, Sentry/alerting, worker supervision, edge rate limits, independent security verification, accessibility review and real-world user acceptance. Live Resend/R2/Sentry delivery was not exercised without production credentials. The security plugin's scan initialization failed; no completed plugin audit is claimed. See the deployment and verification documents for concrete limitations.
