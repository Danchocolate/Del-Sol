# Vercel + Supabase demo deployment

Hotel Del Sol already uses Vite for the React site. The root `vercel.json` deploys the Vite site and Fastify API as two [Vercel Services](https://vercel.com/docs/services) in **one Vercel project and one HTTPS origin**. The API runs as a Function when called; no always-on Node host is needed. Services are currently labeled Beta and are available on all plans. The existing PostgreSQL booking transactions, server-side authorization, and email outbox remain in place.

## Set up the Vercel project

1. Import `Danchocolate/Del-Sol` from GitHub with the **repository root** as the Root Directory. In Build and Deployment settings, select **Services** as the Framework Preset; this is required for the `services` block in `vercel.json` to take effect. Do not set a separate build command or output directory in the dashboard. The file has both service builds and same-origin `/api` routing. The web service keeps Vite's SPA deep-link rewrite.
2. Use the project's stable production `https://…vercel.app` URL. A custom domain is not needed for the presentation. Put the exact origin, with no path or trailing slash, in `APP_ORIGIN`. Put its hostname alone in `TURNSTILE_HOSTNAME`, and register that exact hostname in Cloudflare Turnstile. If the first deploy is needed to discover the actual URL, set the variables after it and redeploy before testing the API. Preview URLs are different origins and need their own isolated configuration; do not point previews at the live database.
3. Add the environment variables below in **Vercel → Project → Settings → Environment Variables**, scoped to Production. Only `VITE_TURNSTILE_SITE_KEY` is public. Never prefix the other variables with `VITE_`.

Keep the repository's service install commands in `vercel.json`. They explicitly install build-time dependencies even when `NODE_ENV=production`; otherwise Vite, TypeScript and React type declarations are missing during the build.

The API service generates Prisma Client and builds the shared workspace, then lets Vercel compile its Fastify `src/index.ts` entrypoint. Do not add the API TypeScript build to this service: emitting `dist/app.js` during Vercel's build can make Fastify detection load the library module as a CommonJS function instead of the server entrypoint.

| Variable                  | Value                                                                                                                           |
| ------------------------- | ------------------------------------------------------------------------------------------------------------------------------- |
| `NODE_ENV`                | `production`                                                                                                                    |
| `APP_ORIGIN`              | Exact `https://…vercel.app` production origin                                                                                   |
| `DATABASE_URL`            | New Supabase **Transaction pooler** URL, port `6543`, with `sslmode=require&pgbouncer=true&connection_limit=1` query parameters |
| `BETTER_AUTH_SECRET`      | Unique random string, at least 32 characters                                                                                    |
| `OUTBOX_ENCRYPTION_KEY`   | Unique random **64-character hex** string; preserve it across redeploys                                                         |
| `JOBS_SECRET`             | Unique random string, at least 32 characters; also store the same value in Supabase Vault                                       |
| `EMAIL_PROVIDER`          | `resend`                                                                                                                        |
| `RESEND_API_KEY`          | Secret key from Resend                                                                                                          |
| `EMAIL_FROM`              | Sender address Resend permits, for example `Hotel Del Sol <reservations@YOUR-VERIFIED-DOMAIN>`                                  |
| `TURNSTILE_SECRET_KEY`    | Cloudflare Turnstile secret for the production hostname                                                                         |
| `TURNSTILE_HOSTNAME`      | The hostname in `APP_ORIGIN`, without `https://`                                                                                |
| `VITE_TURNSTILE_SITE_KEY` | Public Turnstile site key for that hostname                                                                                     |

Optional `STORAGE_*` variables enable image uploads; optional `SENTRY_DSN` enables error reporting. See `.env.example`. Use random secret generators, never reuse the database password. Rotate the Supabase database password previously shared in chat before putting the new URL in Vercel. URL-encode reserved characters in the password. The Transaction pooler and single-connection Prisma setting are [Supabase's recommendation for serverless functions](https://supabase.com/docs/guides/database/connecting-to-postgres). Use the Session pooler (port `5432`) or direct connection for Prisma migrations, not the Transaction pooler. The current Supabase schema was already migrated; do not run the development seed or reset it.

Resend's testing sender can be useful for a presentation, but it cannot be treated as guest email delivery for a real hotel. Verify a sending domain and confirm delivery to external addresses before accepting real reservations. The website can use the Vercel URL even when the email sender uses a different verified domain.

If the site reports an API error, open `/api/ping` on the production URL first. It returns `{"status":"ok"}` once the API starts and does not query PostgreSQL. Then open `/api/health`, which makes a database query. If ping works and health fails, check the Supabase connection URL and Vercel runtime logs. If ping fails too, check startup errors and confirm the latest commit and environment variables were included in the deployed version.

## Schedule retries and hold expiry

Booking and access requests attempt queued email delivery as soon as their database transaction commits. The outbox retains failed attempts. The API exposes `POST /api/internal/jobs`, protected by `JOBS_SECRET`, to retry email, expire holds, and clean up expired grants. Unlike Vercel Hobby Cron, [Supabase Cron](https://supabase.com/docs/guides/cron) can call it every minute. This invokes a Function briefly each time; there is no continuously running worker. It still consumes Vercel Function and Supabase usage, so monitor plan limits. A delivery time under one minute is a target, not a guarantee when providers fail or queues grow.

After the Vercel URL responds to `/api/health`, enable Supabase Cron and `pg_net` in the Supabase Dashboard. Create **two Vault secrets** in the Dashboard:

- `hotel_del_sol_jobs_url` = `https://YOUR-PRODUCTION-VERCEL-URL/api/internal/jobs`
- `hotel_del_sol_jobs_secret` = the exact Vercel `JOBS_SECRET` value

Then run this SQL in the Supabase SQL Editor (it stores only Vault secret names in the Cron job):

```sql
select cron.schedule(
  'hotel-del-sol-jobs',
  '* * * * *',
  $$
  select net.http_post(
    url := (select decrypted_secret from vault.decrypted_secrets where name = 'hotel_del_sol_jobs_url'),
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'hotel_del_sol_jobs_secret')
    ),
    body := '{}'::jsonb,
    timeout_milliseconds := 30000
  );
  $$
);
```

After a minute, check the Cron run history and the app's staff **Job health** page. Confirm the HTTP response was successful; a Cron entry can succeed in queueing an HTTP call even when the remote API rejects it. A `401` means the Vault and Vercel secrets differ. Do not expose `JOBS_SECRET` in the browser or use a public Cron endpoint without the bearer secret.

## Before real bookings

The Admin account already exists in Supabase. Its generated initial password is stored only in the ignored local `.local/supabase-admin-credentials.txt` file; use **Your account** to change it after sign-in. Enter the hotel's actual inventory, rates, policies, contact details, and approved content. Test booking, verification email, cancellation, staff sign-in, outbox retries, and expiry through the exact production URL. Configure off-site database backups, monitoring, and a restore drill. A free demo project is not a production handoff. Vercel [Hobby is for personal, non-commercial use](https://vercel.com/docs/plans/hobby); use a commercial-eligible plan or host before operating the hotel's business site.
