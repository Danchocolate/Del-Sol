import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { db } from '../../lib/db.js';
import { staff } from '../auth/permissions.js';
import { hotelToday } from '../availability/service.js';
import { config } from '../../config.js';
import { decrypt } from '../../lib/crypto.js';
export async function reportRoutes(app: FastifyInstance) {
  app.get('/api/admin/operations', async (request) => {
    await staff(request, 'reservations:read');
    const settings = await db.systemSettings.findUniqueOrThrow({ where: { id: 'hotel' } });
    const today = new Date(hotelToday(settings.timezone));
    const [
      arrivals,
      departures,
      allocated,
      totalRooms,
      pending,
      confirmed,
      cancelled,
      available,
      occupied,
    ] = await Promise.all([
      db.reservation.findMany({
        where: { checkIn: today, status: { in: ['CONFIRMED', 'PENDING_CONFIRMATION'] } },
        include: { guest: true },
      }),
      db.reservation.findMany({
        where: { checkOut: today, status: 'CHECKED_IN' },
        include: { guest: true },
      }),
      db.reservationRoom.count({
        where: { active: true, checkIn: { lte: today }, checkOut: { gt: today } },
      }),
      db.room.count({ where: { active: true, roomType: { active: true } } }),
      db.reservation.count({
        where: { status: { in: ['PENDING_CONFIRMATION', 'PENDING_EMAIL_VERIFICATION'] } },
      }),
      db.reservation.count({ where: { status: 'CONFIRMED' } }),
      db.reservation.count({ where: { status: 'CANCELLED' } }),
      db.room.count({
        where: {
          active: true,
          roomType: { active: true },
          blocks: { none: { active: true, startDate: { lte: today }, endDate: { gt: today } } },
          allocations: { none: { active: true, checkIn: { lte: today }, checkOut: { gt: today } } },
        },
      }),
      db.reservationRoom.count({
        where: { active: true, reservation: { status: 'CHECKED_IN' } },
      }),
    ]);
    return {
      today: today.toISOString().slice(0, 10),
      arrivals,
      departures,
      occupied,
      allocated,
      totalRooms,
      available,
      pending,
      confirmed,
      cancelled,
    };
  });
  app.get('/api/admin/reports', async (request) => {
    await staff(request, 'reports:read');
    const query = z
      .object({ days: z.coerce.number().int().min(7).max(365).default(30) })
      .strict()
      .parse(request.query);
    const settings = await db.systemSettings.findUniqueOrThrow({ where: { id: 'hotel' } });
    const today = new Date(hotelToday(settings.timezone));
    const since = new Date(today.getTime() - (query.days - 1) * 86400000);
    // Calendar dates are hotel-local; include the UTC margin, then bucket by hotel date.
    const scanSince = new Date(since.getTime() - 86400000);
    const firstDate = since.toISOString().slice(0, 10);
    const lastDate = today.toISOString().slice(0, 10);
    const [payments, reservations, allocations, roomCount, promotions, cancellations] =
      await Promise.all([
        db.payment.findMany({
          where: { paidAt: { gte: scanSince } },
          select: { amount: true, paidAt: true },
        }),
        db.reservation.findMany({
          where: { createdAt: { gte: scanSince } },
          select: { createdAt: true, status: true, source: true, cancelledAt: true },
        }),
        db.reservationRoom.findMany({
          where: {
            checkOut: { gt: since },
            checkIn: { lte: today },
            reservation: { status: { in: ['CONFIRMED', 'CHECKED_IN', 'CHECKED_OUT'] } },
          },
          select: { checkIn: true, checkOut: true, roomName: true },
        }),
        db.room.count({ where: { active: true } }),
        db.promotion.findMany({
          select: {
            code: true,
            name: true,
            _count: { select: { redemptions: { where: { releasedAt: null } } } },
          },
        }),
        db.reservation.findMany({
          where: { cancelledAt: { gte: scanSince } },
          select: { cancelledAt: true },
        }),
      ]);
    const trends = Array.from({ length: query.days }, (_, i) => {
      const date = new Date(since.getTime() + i * 86400000).toISOString().slice(0, 10);
      return {
        date,
        revenue: payments
          .filter((p) => hotelToday(settings.timezone, p.paidAt) === date)
          .reduce((s, p) => s + p.amount, 0),
        bookings: reservations.filter((r) => hotelToday(settings.timezone, r.createdAt) === date)
          .length,
        cancellations: cancellations.filter(
          (r) => r.cancelledAt && hotelToday(settings.timezone, r.cancelledAt) === date,
        ).length,
        occupancy: allocations.filter(
          (a) =>
            a.checkIn.toISOString().slice(0, 10) <= date &&
            a.checkOut.toISOString().slice(0, 10) > date,
        ).length,
      };
    });
    const reportReservations = reservations.filter((r) => {
      const date = hotelToday(settings.timezone, r.createdAt);
      return date >= firstDate && date <= lastDate;
    });
    const sources = Object.entries(Object.groupBy(reportReservations, (r) => r.source)).map(
      ([name, items]) => ({ name, value: items?.length ?? 0 }),
    );
    const popularRooms = Object.entries(Object.groupBy(allocations, (r) => r.roomName))
      .map(([name, items]) => ({ name, value: items?.length ?? 0 }))
      .sort((a, b) => b.value - a.value);
    return {
      revenue: trends.reduce((sum, day) => sum + day.revenue, 0),
      trends,
      roomCount,
      sources,
      popularRooms,
      promotions,
      occupancyBasis:
        'Booked room nights; historical physical inventory changes are not reconstructed.',
    };
  });
  app.get('/api/admin/notifications', async (request) => {
    await staff(request, 'reservations:read');
    return db.notification.findMany({ orderBy: { createdAt: 'desc' }, take: 30 });
  });
  app.post('/api/admin/notifications/:id/read', async (request) => {
    await staff(request, 'reservations:read');
    const { id } = z.object({ id: z.string().uuid() }).parse(request.params);
    return db.notification.update({ where: { id }, data: { readAt: new Date() } });
  });
  if (config.NODE_ENV !== 'production' && config.EMAIL_PROVIDER === 'development')
    app.get('/api/admin/dev-inbox', async (request) => {
      await staff(request, 'users:write');
      const jobs = await db.outboxJob.findMany({
        where: { kind: 'EMAIL' },
        orderBy: { createdAt: 'desc' },
        take: 30,
      });
      return jobs.map((j) => ({
        id: j.id,
        createdAt: j.createdAt,
        ...z
          .object({ to: z.string(), subject: z.string(), text: z.string() })
          .parse(decrypt(j.encryptedPayload)),
      }));
    });
  app.get('/api/admin/job-health', async (request) => {
    await staff(request, 'reports:read');
    return {
      pending: await db.outboxJob.count({ where: { completedAt: null, failedAt: null } }),
      failed: await db.outboxJob.count({ where: { failedAt: { not: null } } }),
    };
  });
}
