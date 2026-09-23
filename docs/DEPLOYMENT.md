# Deployment and operational review

## Topology

Serve the Vite production bundle under one HTTPS origin and reverse-proxy `/api` to Fastify. Fastify currently listens on loopback, intended for a same-host trusted proxy. Configure a different bind address explicitly if containerizing; never expose the API directly to the Internet by accident. Use a supervised API process plus a separate supervised `node apps/api/dist/worker.js` process. All processes share PostgreSQL and the outbox encryption key. No Redis is required.

Build: `npm ci`, `npm run db:generate`, `npm run build`. Set server environment securely. Run `npm run db:migrate` as a dedicated migration role, then start `node apps/api/dist/index.js` and the worker. Do not run the development seed in production. Provision the first employee through a reviewed administrative bootstrap process using Better Auth's `hashPassword`; do not insert plaintext passwords. Require a strong unique password and verify the intended SUPER_ADMIN recipient.

Use separate non-owner runtime and schema-owner migration credentials. Restrict runtime table grants to required operations. Never grant the web process permission to disable triggers, truncate tables, alter schema or remove audit history. Password/account recovery currently needs an administrator-assisted operational procedure; add a verified employee recovery flow and MFA before a broad production rollout.

## Proxy and browser headers

The API enforces CSP, nosniff, Referrer-Policy, Permissions-Policy and framing restrictions. The **static web host must apply equivalent headers to HTML**, because API response headers do not protect the page document. Adapt `deploy/nginx.conf.example`, replacing domain and storage hostname placeholders. SPA routes must fall back to `index.html`, but `/api` must never fall back to HTML. Avoid logging query strings and cookies on auth/guest endpoints. Never log response bodies from the development inbox.

The API intentionally has `trustProxy: false`. Behind a proxy this means the API's IP quota is a conservative aggregate quota for that proxy; it is not a correct per-client quota until trusted forwarding is configured. Before launch, enforce per-client limits at the edge and configure Fastify to trust **only** the actual proxy subnet. Do not use blanket `trustProxy: true` on an exposed listener. Multi-replica deployments require global edge IP throttling; the database email and auth quotas remain shared. Load-test quota thresholds using legitimate hotel traffic.

## Email jobs and failures

The worker expires unverified holds in transactions and claims outbox records with `FOR UPDATE SKIP LOCKED`, leases and retry backoff. Five bounded sends execute concurrently within a 60-second lease; each provider request times out after 15 seconds. Resend receives the job UUID as its idempotency key. After eight failed attempts the job is marked failed. Monitor `/api/admin/job-health` using an authorized reports account or use database operational monitoring. Alert on failed jobs, queue age, worker heartbeat, repeated auth failures and inventory conflicts.

Delivery is at-least-once with provider idempotency, not an exactly-once guarantee. A process crash after delivery but before completion can cause a retry. Respect Resend's idempotency retention window before manually replaying very old jobs. The current retry schedule stays within one day. Retain the encryption key until queued payloads have drained; key rotation needs a versioned keyring/migration procedure. Successful production payloads are cleared. Failed payloads require a documented retention and support policy. Database tokens/grants/quotas are cleaned after a seven-day grace period.

## Media

R2 or another S3-compatible object store must be configured. Supabase Storage can be introduced by implementing `StorageProvider`; it is not a bundled live provider. Use a dedicated public media bucket/domain with least-privilege server write credentials. CORS must match the site. Validation happens before object creation. A database failure after successful upload may leave an orphaned object: configure a reviewed lifecycle/reconciliation job. Archive keeps existing historical references valid. Uploaded media is never kept permanently on the app server.

## Backups and migrations

The initial migration only creates objects; the second adds the overlap constraint and append-only triggers. No schema reset, destructive migration or production data deletion command is part of setup. New migrations must be reviewed and tested on a restored staging copy, with a tested recovery path. Enable encrypted backups, point-in-time recovery, retention and scheduled restore drills. Preserve both database state and the outbox encryption key in separate protected backup systems.

## Business assumptions needing acceptance

- All-in PHP room pricing; taxes, deposits and refunds need explicit hotel policy before launch.
- One room type per booking, up to configured quantities; no split-stay reassignment or mixed room types.
- Manager/manual confirmation by default. Verified pending requests have no automatic hold expiry; staff must process them promptly.
- Check-in/no-show date rules are hotel-local. Early checkout releases the remaining stay; no automatic refund is implied.
- Cancellation cutoff is snapshotted on creation. Staff overrides are audited. Cancelled or expired promotion redemptions release capacity.
- Operational allocation includes pending holds. Historical charts describe booked room nights, not sensor-level actual occupancy; historical room inventory changes are not reconstructed. Reports should be reconciled with official hotel accounts.
- Notifications currently have a shared hotel read state rather than per-employee read receipts.
- Staff list and room/catalog queries are intended for a single small hotel. Long-term report volumes require SQL aggregation/pagination tuning.
- Final imagery, real amenities, address, contact data and privacy terms must be approved. Seed content is explicitly illustrative.

## Required production verification

Independently review threat boundaries, live headers/CSP/CSRF, cookie attributes, employee recovery, deployment roles, logs and vendor configuration. Test Resend SPF/DKIM/domain deliverability, real Turnstile behavior, R2 uploads, Sentry alerts, worker crash/retry, database restore, mobile accessibility and real front-desk acceptance. The local tests demonstrate behavior under their test conditions; they do not certify production readiness.
