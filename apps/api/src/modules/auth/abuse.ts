import { z } from 'zod';
import { db } from '../../lib/db.js';
import { hash } from '../../lib/crypto.js';
import { assert, AppError } from '../../lib/errors.js';
import { config } from '../../config.js';
export async function emailQuota(email: string, action: string, max = 4) {
  const key = hash(`${action}:${email}`);
  const rows = await db.$queryRaw<
    { count: number }[]
  >`INSERT INTO "EmailQuota" (key,count,"resetAt") VALUES (${key},1,now()+interval '1 hour') ON CONFLICT (key) DO UPDATE SET count=CASE WHEN "EmailQuota"."resetAt"<now() THEN 1 ELSE "EmailQuota".count+1 END,"resetAt"=CASE WHEN "EmailQuota"."resetAt"<now() THEN now()+interval '1 hour' ELSE "EmailQuota"."resetAt" END RETURNING count`;
  assert(
    rows[0] && rows[0].count <= max,
    429,
    'EMAIL_RATE_LIMIT',
    'Too many requests. Please try again later.',
  );
}
export async function verifyTurnstile(token: string, ip: string) {
  let response: Response;
  try {
    response = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', {
      method: 'POST',
      body: new URLSearchParams({
        secret: config.TURNSTILE_SECRET_KEY,
        response: token,
        remoteip: ip,
      }),
      signal: AbortSignal.timeout(8000),
    });
  } catch {
    throw new AppError(
      503,
      'BOT_CHECK_UNAVAILABLE',
      'Verification is temporarily unavailable. Please try again.',
    );
  }
  const result = z
    .object({ success: z.boolean(), hostname: z.string().optional() })
    .parse(await response.json());
  const isTestKey =
    config.NODE_ENV !== 'production' &&
    config.TURNSTILE_SECRET_KEY === '1x0000000000000000000000000000000AA';
  assert(
    response.ok && result.success && (isTestKey || result.hostname === config.TURNSTILE_HOSTNAME),
    400,
    'BOT_CHECK_FAILED',
    'Please complete the security check again.',
  );
}
