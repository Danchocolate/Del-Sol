import { randomUUID } from 'node:crypto';
import { hashPassword } from 'better-auth/crypto';
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { roles, settingsSchema } from '@hotel/shared';
import { db, inventoryTransaction } from '../../lib/db.js';
import { staff } from '../auth/permissions.js';
import { audit } from '../audit/service.js';
import { assert } from '../../lib/errors.js';
export async function userRoutes(app: FastifyInstance) {
  app.get('/api/admin/me', async (request) => staff(request));
  app.get('/api/admin/users', async (request) => {
    await staff(request, 'users:write');
    return db.user.findMany({
      select: { id: true, name: true, email: true, role: true, active: true, createdAt: true },
      orderBy: { name: 'asc' },
    });
  });
  app.post('/api/admin/users', async (request) => {
    const actor = await staff(request, 'users:write');
    const input = z
      .object({
        name: z.string().min(2).max(100),
        email: z.email().transform((v) => v.toLowerCase()),
        password: z.string().min(12).max(128),
        role: z.enum(roles),
      })
      .strict()
      .parse(request.body);
    const password = await hashPassword(input.password);
    return inventoryTransaction(async (tx) => {
      const user = await tx.user.create({
        data: {
          id: randomUUID(),
          name: input.name,
          email: input.email,
          emailVerified: true,
          role: input.role,
          accounts: {
            create: {
              id: randomUUID(),
              accountId: input.email,
              providerId: 'credential',
              password,
            },
          },
        },
        select: { id: true, name: true, email: true, role: true, active: true },
      });
      await tx.account.updateMany({ where: { userId: user.id }, data: { accountId: user.id } });
      await audit(tx, actor.id, 'USER_CREATED', 'User', user.id, { role: user.role });
      return user;
    });
  });
  app.put('/api/admin/users/:id', async (request) => {
    const actor = await staff(request, 'users:write');
    const { id } = z.object({ id: z.string().min(1).max(100) }).parse(request.params);
    const input = z
      .object({ role: z.enum(roles), active: z.boolean() })
      .strict()
      .parse(request.body);
    assert(
      id !== actor.id,
      400,
      'SELF_CHANGE',
      'Another super administrator must change your account permissions.',
    );
    return inventoryTransaction(async (tx) => {
      const before = await tx.user.findUniqueOrThrow({ where: { id } });
      if (before.role === 'SUPER_ADMIN' && (!input.active || input.role !== 'SUPER_ADMIN')) {
        const count = await tx.user.count({ where: { role: 'SUPER_ADMIN', active: true } });
        assert(
          count > 1,
          409,
          'LAST_ADMIN',
          'At least one active super administrator is required.',
        );
      }
      const user = await tx.user.update({
        where: { id },
        data: input,
        select: { id: true, name: true, email: true, role: true, active: true },
      });
      await tx.session.deleteMany({ where: { userId: id } });
      await audit(tx, actor.id, input.active ? 'USER_UPDATED' : 'USER_DISABLED', 'User', id, {
        role: input.role,
      });
      return user;
    });
  });
  app.get('/api/admin/settings', async (request) => {
    await staff(request, 'settings:write');
    return db.systemSettings.findUniqueOrThrow({ where: { id: 'hotel' } });
  });
  app.put('/api/admin/settings', async (request) => {
    const actor = await staff(request, 'settings:write');
    const input = settingsSchema.parse(request.body);
    return inventoryTransaction(async (tx) => {
      if (actor.role !== 'SUPER_ADMIN') {
        const existing = await tx.systemSettings.findUniqueOrThrow({ where: { id: 'hotel' } });
        assert(
          existing.emailVerificationRequired === input.emailVerificationRequired,
          403,
          'FORBIDDEN',
          'Only a super administrator may change email verification policy.',
        );
      }
      const result = await tx.systemSettings.update({ where: { id: 'hotel' }, data: input });
      await audit(tx, actor.id, 'SYSTEM_SETTING_CHANGED', 'SystemSettings', 'hotel', input);
      return result;
    });
  });
  app.get('/api/admin/audit', async (request) => {
    await staff(request, 'audit:read');
    const query = z
      .object({ page: z.coerce.number().int().min(1).max(10000).default(1) })
      .strict()
      .parse(request.query);
    return db.auditLog.findMany({
      orderBy: { createdAt: 'desc' },
      take: 50,
      skip: (query.page - 1) * 50,
    });
  });
}
