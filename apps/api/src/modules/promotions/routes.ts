import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { promotionSchema } from '@hotel/shared';
import { db, inventoryTransaction } from '../../lib/db.js';
import { staff } from '../auth/permissions.js';
import { audit } from '../audit/service.js';
import { assert } from '../../lib/errors.js';
export async function promotionRoutes(app: FastifyInstance) {
  app.get('/api/admin/promotions', async (request) => {
    await staff(request, 'promotions:write');
    return db.promotion.findMany({
      include: {
        roomTypes: true,
        rooms: true,
        _count: { select: { redemptions: { where: { releasedAt: null } } } },
      },
      orderBy: { createdAt: 'desc' },
    });
  });
  for (const method of ['POST', 'PUT'] as const)
    app.route({
      method,
      url: `/api/admin/promotions${method === 'PUT' ? '/:id' : ''}`,
      handler: async (request) => {
        const user = await staff(request, 'promotions:write');
        const { roomTypeIds, roomIds, ...input } = promotionSchema.parse(request.body);
        const id =
          method === 'PUT'
            ? z.object({ id: z.string().uuid() }).parse(request.params).id
            : undefined;
        return inventoryTransaction(async (tx) => {
          if (id) {
            const used = await tx.promotionRedemption.count({
              where: { promotionId: id, releasedAt: null },
            });
            assert(
              input.usageLimit >= used,
              409,
              'USAGE_LIMIT',
              'Usage limit cannot be below existing redemptions.',
            );
            await tx.promotionRoomType.deleteMany({ where: { promotionId: id } });
            await tx.promotionRoom.deleteMany({ where: { promotionId: id } });
          }
          const data = {
            ...input,
            startsAt: new Date(input.startsAt),
            endsAt: new Date(input.endsAt),
            stayStartsAt: input.stayStartsAt ? new Date(input.stayStartsAt) : null,
            stayEndsAt: input.stayEndsAt ? new Date(input.stayEndsAt) : null,
            roomTypes: { create: [...new Set(roomTypeIds)].map((roomTypeId) => ({ roomTypeId })) },
            rooms: { create: [...new Set(roomIds)].map((roomId) => ({ roomId })) },
          };
          const promotion = id
            ? await tx.promotion.update({ where: { id }, data })
            : await tx.promotion.create({ data });
          await audit(
            tx,
            user.id,
            id ? 'PROMOTION_UPDATED' : 'PROMOTION_CREATED',
            'Promotion',
            promotion.id,
          );
          return promotion;
        });
      },
    });
}
