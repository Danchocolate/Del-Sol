import { betterAuth } from 'better-auth';
import { prismaAdapter } from 'better-auth/adapters/prisma';
import { db } from '../../lib/db.js';
import { config } from '../../config.js';
export const auth = betterAuth({
  database: prismaAdapter(db, { provider: 'postgresql' }),
  baseURL: config.APP_ORIGIN,
  secret: config.BETTER_AUTH_SECRET,
  trustedOrigins: [config.APP_ORIGIN],
  emailAndPassword: {
    enabled: true,
    disableSignUp: true,
    minPasswordLength: 12,
    maxPasswordLength: 128,
  },
  session: { expiresIn: 8 * 3600, updateAge: 1800, cookieCache: { enabled: false } },
  rateLimit: {
    enabled: true,
    storage: 'database',
    window: 60,
    max: 30,
    customRules: { '/sign-in/email': { window: 60, max: 5 } },
  },
  advanced: {
    useSecureCookies: config.NODE_ENV === 'production',
    defaultCookieAttributes: {
      httpOnly: true,
      sameSite: 'lax',
      secure: config.NODE_ENV === 'production',
    },
  },
  user: {
    additionalFields: {
      role: { type: 'string', required: false, defaultValue: 'FRONT_DESK', input: false },
      active: { type: 'boolean', required: false, defaultValue: true, input: false },
    },
  },
  databaseHooks: {
    session: {
      create: {
        before: async (session) => {
          const user = await db.user.findUnique({ where: { id: session.userId } });
          if (!user?.active) return false;
          return { data: session };
        },
      },
    },
  },
  logger: {
    level: 'error',
    log: () => {
      /* Auth errors are reported by sanitized API status counters. */
    },
  },
});
