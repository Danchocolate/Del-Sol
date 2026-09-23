import { z } from 'zod';
const schema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  DATABASE_URL: z.string().min(1),
  APP_ORIGIN: z.url(),
  PORT: z.coerce.number().default(3001),
  BETTER_AUTH_SECRET: z.string().min(32),
  OUTBOX_ENCRYPTION_KEY: z.string().regex(/^[a-f0-9]{64}$/),
  EMAIL_PROVIDER: z.enum(['development', 'resend']).default('development'),
  RESEND_API_KEY: z.string().optional(),
  EMAIL_FROM: z.string().default('Hotel Del Sol <reservations@example.com>'),
  TURNSTILE_SECRET_KEY: z.string().min(1),
  TURNSTILE_HOSTNAME: z.string().min(1),
  STORAGE_ENDPOINT: z.string().optional(),
  STORAGE_REGION: z.string().default('auto'),
  STORAGE_BUCKET: z.string().optional(),
  STORAGE_ACCESS_KEY_ID: z.string().optional(),
  STORAGE_SECRET_ACCESS_KEY: z.string().optional(),
  STORAGE_PUBLIC_URL: z.string().optional(),
  SENTRY_DSN: z.string().optional(),
});
export const config = schema.parse(process.env);
if (new URL(config.APP_ORIGIN).origin !== config.APP_ORIGIN)
  throw new Error('APP_ORIGIN must be an exact origin without a path');
if (config.NODE_ENV === 'production') {
  if (
    !config.APP_ORIGIN.startsWith('https://') ||
    config.EMAIL_PROVIDER !== 'resend' ||
    !config.RESEND_API_KEY ||
    config.BETTER_AUTH_SECRET.startsWith('REPLACE') ||
    config.EMAIL_FROM.includes('example.com') ||
    config.TURNSTILE_SECRET_KEY.startsWith('1x') ||
    config.TURNSTILE_SECRET_KEY.startsWith('2x') ||
    config.TURNSTILE_SECRET_KEY.startsWith('3x')
  )
    throw new Error('Production requires HTTPS, Resend and a real Turnstile secret');
}
