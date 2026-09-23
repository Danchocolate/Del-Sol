import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import {
  bookingSchema,
  searchSchema,
  lookupSchema,
  tokenSchema,
  cancellationSchema,
  statuses,
} from '@hotel/shared';
import { db, inventoryTransaction } from '../../lib/db.js';
import { config } from '../../config.js';
import { staff } from '../auth/permissions.js';
import { emailQuota, verifyTurnstile } from '../auth/abuse.js';
import { findRooms, selectRooms, validateStay } from '../availability/service.js';
import { calculatePrice, eligiblePromotion } from '../promotions/pricing.js';
import {
  createReservation,
  exchangeToken,
  requestAccess,
  resolveGrant,
  cancelReservation,
  reservationDetails,
  staffTransition,
  expireHolds,
} from './service.js';
const rate = { config: { rateLimit: { max: 10, timeWindow: '1 minute' } } };
const idSchema = z.object({ id: z.string().uuid() });
const referenceSchema = z.object({ reference: lookupSchema.shape.reference });
export async function reservationRoutes(app: FastifyInstance) {
  app.get('/api/availability', async (request) => {
    const input = searchSchema.parse(request.query);
    return inventoryTransaction(async (tx) => {
      await expireHolds(tx);
      const settings = await tx.systemSettings.findUniqueOrThrow({ where: { id: 'hotel' } });
      const nights = validateStay(input, settings);
      const rooms = await findRooms(tx, input);
      const ids = [...new Set(rooms.map((r) => r.roomTypeId))];
      const results = [];
      for (const id of ids) {
        const group = rooms.filter((r) => r.roomTypeId === id);
        const selected = selectRooms(group, input.rooms, input.guests);
        if (!selected.length) continue;
        const promo = await eligiblePromotion(
          tx,
          input.promotionCode,
          selected,
          nights,
          input.checkIn,
          input.checkOut,
        );
        results.push({
          roomType: selected[0]!.roomType,
          available: group.length,
          nights,
          ...calculatePrice(
            selected.map((r) => r.basePrice ?? r.roomType.basePrice),
            nights,
            promo,
          ),
        });
      }
      return results;
    });
  });
  app.post('/api/reservations', rate, async (request, reply) => {
    const input = bookingSchema.parse(request.body);
    await verifyTurnstile(input.turnstileToken, request.ip);
    await emailQuota(input.email, 'booking', 5);
    const result = await createReservation(input);
    return reply.code(201).send(result);
  });
  app.post('/api/reservations/access', rate, async (request) => {
    const input = lookupSchema.parse(request.body);
    await verifyTurnstile(input.turnstileToken, request.ip);
    await emailQuota(input.email, 'access', 4);
    return requestAccess(input.reference, input.email);
  });
  app.post('/api/reservations/verify', rate, async (request, reply) => {
    const { token } = tokenSchema.parse(request.body);
    const result = await exchangeToken(token);
    reply.setCookie('hds_guest', result.grant, {
      path: '/api/reservations',
      httpOnly: true,
      secure: config.NODE_ENV === 'production',
      sameSite: 'strict',
      maxAge: 1800,
    });
    return { reference: result.reference };
  });
  app.get('/api/reservations/:reference', async (request) => {
    const { reference } = referenceSchema.parse(request.params);
    const reservation = await resolveGrant(request.cookies.hds_guest, reference);
    const detail = await reservationDetails(reservation.id);
    return {
      reference: detail.reference,
      status: detail.status,
      checkIn: detail.checkIn,
      checkOut: detail.checkOut,
      guestCount: detail.guestCount,
      roomCount: detail.roomCount,
      total: detail.total,
      subtotal: detail.subtotal,
      discount: detail.discount,
      currency: detail.currency,
      guest: { name: detail.guest.name, email: detail.guest.email },
      rooms: detail.rooms.map((r) => ({ roomName: r.roomName, nightlyRate: r.nightlyRate })),
      policy: detail.policySnapshot,
      history: detail.history.map((h) => ({ status: h.toStatus, createdAt: h.createdAt })),
      paid: detail.payments.reduce((s, p) => s + p.amount, 0),
    };
  });
  app.post('/api/reservations/:reference/cancel', rate, async (request) => {
    const { reference } = referenceSchema.parse(request.params);
    const input = cancellationSchema.parse(request.body);
    const reservation = await resolveGrant(request.cookies.hds_guest, reference);
    return cancelReservation(reservation.id, input.reason);
  });
  app.get('/api/admin/reservations', async (request) => {
    await staff(request, 'reservations:read');
    const query = z
      .object({
        q: z.string().max(100).optional(),
        status: z.enum(statuses).optional(),
        from: z.iso.date().optional(),
        to: z.iso.date().optional(),
        page: z.coerce.number().int().min(1).max(10000).default(1),
      })
      .strict()
      .parse(request.query);
    const where = {
      ...(query.status ? { status: query.status } : {}),
      ...(query.from || query.to
        ? {
            checkIn: {
              ...(query.from ? { gte: new Date(query.from) } : {}),
              ...(query.to ? { lte: new Date(query.to) } : {}),
            },
          }
        : {}),
      ...(query.q
        ? {
            OR: [
              { reference: { contains: query.q, mode: 'insensitive' as const } },
              { guest: { name: { contains: query.q, mode: 'insensitive' as const } } },
              { guest: { email: { contains: query.q, mode: 'insensitive' as const } } },
            ],
          }
        : {}),
    };
    const [items, total] = await Promise.all([
      db.reservation.findMany({
        where,
        include: {
          guest: true,
          rooms: { select: { roomName: true, room: { select: { number: true } } } },
        },
        orderBy: { createdAt: 'desc' },
        skip: (query.page - 1) * 30,
        take: 30,
      }),
      db.reservation.count({ where }),
    ]);
    return { items, total, page: query.page };
  });
  app.get('/api/admin/reservations/:id', async (request) => {
    await staff(request, 'reservations:read');
    return reservationDetails(idSchema.parse(request.params).id);
  });
  app.post('/api/admin/reservations', async (request) => {
    const user = await staff(request, 'reservations:write');
    const input = bookingSchema
      .safeExtend({ source: z.enum(['WALK_IN', 'PHONE']) })
      .parse(request.body);
    const { source, ...booking } = input;
    return createReservation(booking, source, user.id);
  });
  app.post('/api/admin/reservations/:id/status', async (request) => {
    const user = await staff(request, 'reservations:write');
    const { id } = idSchema.parse(request.params);
    const input = z
      .object({ status: z.enum(statuses), reason: z.string().max(500).optional() })
      .strict()
      .parse(request.body);
    return staffTransition(id, input.status, user.id, input.reason);
  });
}
