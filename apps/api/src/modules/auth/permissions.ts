import type { FastifyRequest } from 'fastify';
import { fromNodeHeaders } from 'better-auth/node';
import { hasPermission } from '@hotel/shared';
import { auth } from './auth.js';
import { db } from '../../lib/db.js';
import { assert } from '../../lib/errors.js';
export async function staff(request: FastifyRequest, permission?: string) {
  const session = await auth.api.getSession({ headers: fromNodeHeaders(request.headers) });
  assert(session, 401, 'UNAUTHENTICATED', 'Sign in to continue.');
  const user = await db.user.findUnique({
    where: { id: session.user.id },
    select: { id: true, name: true, email: true, role: true, active: true },
  });
  assert(user?.active, 401, 'UNAUTHENTICATED', 'This account is unavailable.');
  assert(
    !permission || hasPermission(user.role, permission),
    403,
    'FORBIDDEN',
    'You do not have permission for this action.',
  );
  return user;
}
