# Verification record

Verified locally on 23 September 2026 on Windows, Node 25.5.0, PostgreSQL 18 and Playwright Chromium. Node 24 LTS is recommended for deployment; that runtime and the actual production host still need staging validation.

## Executed gates

| Gate                                 | Result                                                                                                                                             |
| ------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------- |
| Dependency installation and lockfile | Installed successfully; versions pinned; workspace dependency inspection completed                                                                 |
| Dependency advisory check            | `npm audit`: zero reported vulnerabilities at verification time                                                                                    |
| ESLint                               | Passed                                                                                                                                             |
| Prettier                             | Passed                                                                                                                                             |
| Strict TypeScript                    | API, web, shared package, tests and test configuration passed                                                                                      |
| Unit and React tests                 | 13 passed                                                                                                                                          |
| PostgreSQL/API integration tests     | 41 passed, including staff password rotation                                                                                                       |
| Production build                     | Shared package, API and Vite web bundle passed                                                                                                     |
| Database migrations                  | Three additive migrations applied; development and Supabase schemas up to date                                                                     |
| Playwright                           | 3 journeys passed, including guest and staff operations and responsive smoke checks                                                                |
| Browser inspection                   | Correct page identity; meaningful content; no framework error overlay; no relevant console warnings/errors; real interaction and screenshot checks |
| Codex Security plugin scan           | **Incomplete**: initialization failed in the plugin's internal workbench command, before a scan was created                                        |

These are 57 passing tests, not a quantitative coverage percentage or a production security certification. The simulated failed-email test deliberately emits a sanitized `EMAIL_DELIVERY_FAILED` event and then verifies successful durable retry.

## Critical behaviors exercised

- Twelve simultaneous requests for the last room produce one successful allocation. Direct database overlap insertion is independently rejected by the exclusion constraint. Same-day checkout/arrival and multi-room capacity are covered.
- Creation/payment idempotency, immutable rate and cancellation-policy snapshots, promotion expiry/targeting/minimum stay/per-email and concurrent aggregate caps, and released redemptions are tested.
- Verification expiry, replay, resend invalidation, email-owned lookup, reservation-scoped grants, repeated cancellation, inventory release, hold expiration, manual/automatic confirmation, check-in/out and no-show transitions are tested.
- Authentication, role checks, closed signup, disabled staff, self-permission changes, Origin enforcement, headers, body/input validation, email/IP quotas, rejected Turnstile tokens and reference-only privacy are tested.
- Payments and reversal records, database-enforced historical immutability, audit creation, outbox leasing/idempotency/retry, image signature validation and WebP re-encoding are tested.
- Reports use recorded payments. A timezone regression case verifies that a payment at 00:30 Manila time on the first report day is included, while a payment at 23:30 on the previous local day is excluded. Active versus archived inventory and maintenance blocks are covered.

## Browser journeys and visual checks

The guest journey starts on the homepage, selects dates and a room, submits a reservation, exchanges the development email token, requests a fresh lookup link and cancels. The staff journey signs in, creates a phone/walk-in reservation, verifies the guest email, confirms, records an external payment, checks in/out and sees the audit event.

The visual smoke journey visits all principal staff surfaces, checks image loading, checks mobile overflow and records desktop (1440 pixels) and mobile (390 pixels) screenshots. Public and staff screenshots were visually inspected for spacing, clipping, typography and content. The in-app browser separately verified the homepage promotion button opens a three-night search and displays the computed discount. Temporary browser artifacts are written under the OS temporary directory, outside source control.

Repeated E2E execution exposed a test selector that could choose an old guest with the same fixture name while the table refreshed. It now waits for a uniquely named guest. Windows sandbox process teardown also required an elevated local Playwright run; the final run exited normally with all three journeys passing. No security controls or tests were disabled.

## Security review boundary

Manual review and executable tests cover authentication, authorization, guest-token handling, input and upload boundaries, transaction invariants, payment/audit immutability and logs. Final review moved the email-verification policy permission check inside the serialized settings transaction and bounded outbound email requests within the job lease. This work does not replace the unavailable independent plugin scan or a deployment review.

The Codex Security start tool failed in its internal `workbench_db.py start-prompt-only-scan` command. No scan identifier or findings report was returned. It must be rerun after the plugin is repaired; there is no claim of a clean plugin audit.

## Remaining validation

Live Resend, R2/S3, production Turnstile and Sentry were not exercised without production credentials. E2E replaces only the client Turnstile widget and validates the official test token through the actual server-side Siteverify endpoint. Storage integration tests mock the external storage boundary after real image decoding/re-encoding.

Before launch, validate the chosen Node LTS runtime, real vendor configuration, HTTPS/static CSP/cookies, trusted proxy and edge quotas, restricted database roles, backup restoration, worker crash recovery and alerts, employee recovery/MFA, screen readers and other browsers, approved property/legal/tax content, and real front-desk user acceptance. Historical occupancy is booked room nights rather than reconstructed actual presence. See [deployment notes](DEPLOYMENT.md) for operating assumptions and limitations.
