import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { paymentSchema } from '@hotel/shared';
import { staff } from '../auth/permissions.js';
import { recordPayment, reversePayment } from './service.js';
export async function paymentRoutes(app: FastifyInstance) {
  app.post('/api/admin/reservations/:id/payments', async (request) => {
    const user = await staff(request, 'payments:write');
    const { id } = z.object({ id: z.string().uuid() }).parse(request.params);
    return recordPayment(id, paymentSchema.parse(request.body), user.id);
  });
  app.post('/api/admin/payments/:id/reverse', async (request) => {
    const user = await staff(request, 'payments:write');
    const { id } = z.object({ id: z.string().uuid() }).parse(request.params);
    const { reason } = z
      .object({ reason: z.string().min(3).max(500) })
      .strict()
      .parse(request.body);
    return reversePayment(id, reason, user.id);
  });
}
