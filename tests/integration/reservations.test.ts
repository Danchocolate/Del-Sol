import { randomUUID } from 'node:crypto';
import { beforeAll, afterAll, describe, it, expect, vi } from 'vitest';
import { PrismaClient } from '@prisma/client';
import type { BookingInput } from '@hotel/shared';
import {
  createReservation,
  exchangeToken,
  cancelReservation,
  requestAccess,
  resolveGrant,
  staffTransition,
  expireHolds,
} from '../../apps/api/src/modules/reservations/service.js';
import { db, inventoryTransaction } from '../../apps/api/src/lib/db.js';
import { decrypt, hash, encrypt } from '../../apps/api/src/lib/crypto.js';
import { notificationProvider } from '../../apps/api/src/modules/notifications/provider.js';
import { findRooms } from '../../apps/api/src/modules/availability/service.js';
import { recordPayment, reversePayment } from '../../apps/api/src/modules/payments/service.js';
import { runJobs } from '../../apps/api/src/modules/notifications/worker.js';
const date = (offset: number) =>
  new Date(Date.now() + offset * 86400000).toISOString().slice(0, 10);
async function fixture(quantity = 1) {
  const type = await db.roomType.create({
    data: {
      slug: randomUUID(),
      name: 'Integration Suite',
      description: 'Integration inventory',
      capacity: 2,
      basePrice: 450000,
      sizeSqm: 32,
      bed: 'King',
    },
  });
  for (let i = 0; i < quantity; i++)
    await db.room.create({ data: { number: randomUUID(), roomTypeId: type.id, capacity: 2 } });
  return type;
}
const booking = (roomTypeId: string, overrides: Partial<BookingInput> = {}): BookingInput => ({
  roomTypeId,
  checkIn: date(10),
  checkOut: date(12),
  guests: 2,
  rooms: 1,
  name: 'Integration Guest',
  email: `${randomUUID()}@example.test`,
  mobile: '+639171234567',
  turnstileToken: 'test-provider-boundary',
  idempotencyKey: randomUUID(),
  ...overrides,
});
async function stored(reference: string) {
  return db.reservation.findUniqueOrThrow({
    where: { reference },
    include: { rooms: true, guest: true },
  });
}
async function emailToken(reference: string) {
  const jobs = await db.outboxJob.findMany({ orderBy: { createdAt: 'desc' }, take: 1000 });
  for (const job of jobs) {
    const payload = decrypt(job.encryptedPayload) as { text: string };
    if (payload.text.includes(reference) && payload.text.includes('#token='))
      return payload.text.match(/#token=([a-f0-9]{64})/)![1]!;
  }
  throw new Error('Verification email missing');
}
beforeAll(async () => {
  await db.systemSettings.upsert({
    where: { id: 'hotel' },
    create: { id: 'hotel' },
    update: {
      emailVerificationRequired: true,
      confirmationMode: 'MANUAL',
      cancellationCutoffHours: 24,
    },
  });
});
afterAll(async () => db.$disconnect());
describe.sequential('real PostgreSQL reservation correctness', () => {
  it('creates a priced hold and verifies email only once', async () => {
    const type = await fixture();
    const input = booking(type.id);
    const created = await createReservation(input);
    expect(created.status).toBe('PENDING_EMAIL_VERIFICATION');
    const r = await stored(created.reference);
    expect(r.total).toBe(900000);
    expect(r.rooms).toHaveLength(1);
    expect(r.rooms[0]!.active).toBe(true);
    const token = await emailToken(created.reference);
    expect(await db.verificationToken.findUnique({ where: { tokenHash: token } })).toBeNull();
    const access = await exchangeToken(token);
    expect((await resolveGrant(access.grant)).id).toBe(r.id);
    expect((await stored(created.reference)).status).toBe('PENDING_CONFIRMATION');
    await expect(exchangeToken(token)).rejects.toMatchObject({ code: 'INVALID_TOKEN' });
    expect(await db.auditLog.count({ where: { entityId: r.id } })).toBe(2);
  });
  it('replays identical creation and rejects changed idempotency requests', async () => {
    const type = await fixture();
    const input = booking(type.id);
    const a = await createReservation(input);
    const b = await createReservation(input);
    expect(a).toEqual(b);
    await expect(createReservation({ ...input, guests: 1 })).rejects.toMatchObject({
      code: 'IDEMPOTENCY_CONFLICT',
    });
  });
  it('rejects expired verification and expires/reopens inventory', async () => {
    const type = await fixture();
    const input = booking(type.id);
    const created = await createReservation(input);
    const r = await stored(created.reference);
    const token = await emailToken(created.reference);
    await db.verificationToken.updateMany({
      where: { reservationId: r.id },
      data: { expiresAt: new Date(0) },
    });
    await expect(exchangeToken(token)).rejects.toMatchObject({ code: 'INVALID_TOKEN' });
    await db.reservation.update({ where: { id: r.id }, data: { expiresAt: new Date(0) } });
    await inventoryTransaction(expireHolds);
    expect((await stored(created.reference)).status).toBe('EXPIRED');
    expect(await db.reservationRoom.count({ where: { reservationId: r.id, active: true } })).toBe(
      0,
    );
    await expect(createReservation(booking(type.id))).resolves.toHaveProperty('reference');
  });
  it('prevents overlaps but permits checkout/check-in boundary', async () => {
    const type = await fixture();
    const input = booking(type.id);
    await createReservation(input);
    await expect(
      createReservation(booking(type.id, { checkIn: date(11), checkOut: date(13) })),
    ).rejects.toMatchObject({ code: 'INVENTORY_CONFLICT' });
    await expect(
      createReservation(booking(type.id, { checkIn: date(12), checkOut: date(13) })),
    ).resolves.toHaveProperty('reference');
  });
  it('cannot oversell the last room under 12 concurrent attempts', async () => {
    const type = await fixture();
    const attempts = await Promise.allSettled(
      Array.from({ length: 12 }, () => createReservation(booking(type.id))),
    );
    expect(attempts.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
    expect(attempts.filter((r) => r.status === 'rejected')).toHaveLength(11);
    expect(
      await db.reservationRoom.count({ where: { room: { roomTypeId: type.id }, active: true } }),
    ).toBe(1);
  });
  it('database exclusion constraint rejects bypassing the service lock', async () => {
    const type = await fixture(2);
    const first = await createReservation(booking(type.id));
    const second = await createReservation(booking(type.id));
    const a = await stored(first.reference);
    const b = await stored(second.reference);
    const isolated = new PrismaClient();
    try {
      await expect(
        isolated.reservationRoom.update({
          where: { id: b.rooms[0]!.id },
          data: { roomId: a.rooms[0]!.roomId },
        }),
      ).rejects.toBeTruthy();
    } finally {
      await isolated.$disconnect();
    }
  });
  it('respects multi-room quantity and total capacity', async () => {
    const type = await fixture(2);
    await expect(
      createReservation(booking(type.id, { rooms: 2, guests: 5 })),
    ).rejects.toMatchObject({ code: 'INVENTORY_CONFLICT' });
    const created = await createReservation(booking(type.id, { rooms: 2, guests: 4 }));
    expect((await stored(created.reference)).rooms).toHaveLength(2);
    await expect(createReservation(booking(type.id))).rejects.toMatchObject({
      code: 'INVENTORY_CONFLICT',
    });
  });
  it('cancels twice without corrupting inventory and retains history', async () => {
    const type = await fixture();
    const created = await createReservation(booking(type.id));
    const r = await stored(created.reference);
    await cancelReservation(r.id, 'Plans changed');
    await cancelReservation(r.id, 'Repeated');
    expect(
      await db.reservationStatusHistory.count({
        where: { reservationId: r.id, toStatus: 'CANCELLED' },
      }),
    ).toBe(1);
    expect((await stored(created.reference)).cancellationReason).toBe('Plans changed');
    expect(await db.reservationRoom.count({ where: { reservationId: r.id, active: true } })).toBe(
      0,
    );
    await expect(createReservation(booking(type.id))).resolves.toHaveProperty('reference');
  });
  it('requires email ownership for lookup and scopes grants to one booking', async () => {
    const type = await fixture(2);
    const first = await createReservation(booking(type.id));
    const second = await createReservation(booking(type.id));
    const a = await stored(first.reference);
    const wrong = await requestAccess(first.reference, 'wrong@example.test');
    expect(wrong.message).toContain('If the details match');
    await expect(resolveGrant(undefined, first.reference)).rejects.toMatchObject({ status: 401 });
    const access = await exchangeToken(await emailToken(first.reference));
    await expect(resolveGrant(access.grant, second.reference)).rejects.toMatchObject({
      status: 401,
    });
    await db.guestGrant.updateMany({
      where: { reservationId: a.id },
      data: { expiresAt: new Date(0) },
    });
    await expect(resolveGrant(access.grant)).rejects.toMatchObject({ status: 401 });
  });
  it('resend invalidates the previous verification token', async () => {
    const type = await fixture();
    const created = await createReservation(booking(type.id));
    const r = await stored(created.reference);
    const old = await emailToken(created.reference);
    await requestAccess(r.reference, r.guest.email);
    await expect(exchangeToken(old)).rejects.toMatchObject({ code: 'INVALID_TOKEN' });
    await expect(exchangeToken(await emailToken(created.reference))).resolves.toHaveProperty(
      'grant',
    );
  });
  it('promotion use cannot exceed its cap concurrently and cancellation restores it', async () => {
    const type = await fixture(3);
    const promo = await db.promotion.create({
      data: {
        code: randomUUID().toUpperCase(),
        name: 'Limit test',
        kind: 'PERCENTAGE',
        value: 10,
        startsAt: new Date(Date.now() - 86400000),
        endsAt: new Date(Date.now() + 86400000),
        usageLimit: 1,
        perEmailLimit: 1,
      },
    });
    const outcomes = await Promise.allSettled(
      Array.from({ length: 3 }, () =>
        createReservation(booking(type.id, { promotionCode: promo.code })),
      ),
    );
    const successes = outcomes.filter((r) => r.status === 'fulfilled');
    expect(successes).toHaveLength(1);
    const r = await stored(successes[0]!.value.reference);
    expect(r.discount).toBe(90000);
    await cancelReservation(r.id);
    await expect(
      createReservation(booking(type.id, { promotionCode: promo.code })),
    ).resolves.toHaveProperty('reference');
  });
  it('rejects expired promotions and email usage limits', async () => {
    const type = await fixture(3);
    const promo = await db.promotion.create({
      data: {
        code: randomUUID().toUpperCase(),
        name: 'Email limit test',
        kind: 'FIXED',
        value: 50000,
        startsAt: new Date(Date.now() - 86400000),
        endsAt: new Date(Date.now() + 86400000),
        usageLimit: 10,
        perEmailLimit: 1,
      },
    });
    const input = booking(type.id, { promotionCode: promo.code });
    await createReservation(input);
    await expect(
      createReservation({ ...input, idempotencyKey: randomUUID() }),
    ).rejects.toMatchObject({ code: 'PROMOTION_EXHAUSTED' });
    await db.promotion.update({
      where: { id: promo.id },
      data: { endsAt: new Date(Date.now() - 1000) },
    });
    await expect(
      createReservation(booking(type.id, { promotionCode: promo.code })),
    ).rejects.toMatchObject({ code: 'INVALID_PROMOTION' });
  });
  it('preserves historical pricing when room rates change', async () => {
    const type = await fixture();
    const created = await createReservation(booking(type.id));
    await db.roomType.update({ where: { id: type.id }, data: { basePrice: 999999 } });
    expect((await stored(created.reference)).total).toBe(900000);
  });
  it('enforces verification and legal check-in/out transitions', async () => {
    const type = await fixture();
    const created = await createReservation(
      booking(type.id, { checkIn: date(0), checkOut: date(1) }),
    );
    const r = await stored(created.reference);
    await expect(staffTransition(r.id, 'CONFIRMED', 'staff')).rejects.toMatchObject({
      code: 'EMAIL_UNVERIFIED',
    });
    await exchangeToken(await emailToken(r.reference));
    await staffTransition(r.id, 'CONFIRMED', 'staff');
    await expect(staffTransition(r.id, 'CHECKED_OUT', 'staff')).rejects.toMatchObject({
      code: 'INVALID_TRANSITION',
    });
    await staffTransition(r.id, 'CHECKED_IN', 'staff');
    await staffTransition(r.id, 'CHECKED_OUT', 'staff');
    expect((await stored(r.reference)).status).toBe('CHECKED_OUT');
    expect(await db.reservationRoom.count({ where: { reservationId: r.id, active: true } })).toBe(
      0,
    );
  });
  it('enforces the guest cancellation cutoff', async () => {
    const type = await fixture();
    const created = await createReservation(
      booking(type.id, { checkIn: date(0), checkOut: date(1) }),
    );
    await expect(cancelReservation((await stored(created.reference)).id)).rejects.toMatchObject({
      code: 'CANCELLATION_CUTOFF',
    });
  });
  it('records idempotent payments and append-only corrections with audit', async () => {
    const type = await fixture();
    const r = await stored((await createReservation(booking(type.id))).reference);
    const input = {
      amount: 10000,
      method: 'CASH' as const,
      paidAt: new Date().toISOString(),
      receipt: 'TEST-R1',
      idempotencyKey: randomUUID(),
    };
    const payment = await recordPayment(r.id, input, 'staff');
    expect((await recordPayment(r.id, input, 'staff')).id).toBe(payment.id);
    await expect(
      db.payment.update({ where: { id: payment.id }, data: { amount: 1 } }),
    ).rejects.toBeTruthy();
    const reversal = await reversePayment(payment.id, 'Entered twice', 'staff');
    expect((await reversePayment(payment.id, 'Repeat', 'staff')).id).toBe(reversal.id);
    expect(
      (await db.payment.aggregate({ where: { reservationId: r.id }, _sum: { amount: true } }))._sum
        .amount,
    ).toBe(0);
    expect(
      await db.auditLog.count({ where: { entityId: { in: [payment.id, reversal.id] } } }),
    ).toBe(2);
  });
  it('rejects destructive history edits at the database boundary', async () => {
    const entry = await db.auditLog.findFirstOrThrow();
    await expect(db.auditLog.delete({ where: { id: entry.id } })).rejects.toBeTruthy();
    const r = await db.reservation.findFirstOrThrow();
    await expect(db.reservation.delete({ where: { id: r.id } })).rejects.toBeTruthy();
  });
  it('availability respects maintenance blocks and disabled rooms', async () => {
    const type = await fixture();
    const room = await db.room.findFirstOrThrow({ where: { roomTypeId: type.id } });
    const input = booking(type.id);
    await db.roomBlock.create({
      data: {
        roomId: room.id,
        startDate: new Date(input.checkIn),
        endDate: new Date(input.checkOut),
        reason: 'Maintenance',
      },
    });
    expect(await findRooms(db, input, type.id)).toHaveLength(0);
    await expect(createReservation(input)).rejects.toMatchObject({ code: 'INVENTORY_CONFLICT' });
  });
  it('outbox jobs are claimed and completed idempotently', async () => {
    const job = await db.outboxJob.create({
      data: {
        kind: 'EMAIL',
        dedupeKey: randomUUID(),
        createdAt: new Date(0),
        encryptedPayload: encrypt({
          to: 'job@example.test',
          subject: 'Job fixture',
          text: 'Test message',
        }),
      },
    });
    await Promise.all([runJobs(), runJobs()]);
    const completed = await db.outboxJob.findUniqueOrThrow({ where: { id: job.id } });
    expect(completed.completedAt).not.toBeNull();
    expect(completed.attempts).toBe(1);
  });
  it('retries failed email delivery without losing its durable payload', async () => {
    const job = await db.outboxJob.create({
      data: {
        kind: 'EMAIL',
        dedupeKey: randomUUID(),
        createdAt: new Date(0),
        encryptedPayload: encrypt({
          to: 'retry@example.test',
          subject: 'Retry fixture',
          text: 'Test message',
        }),
      },
    });
    const provider = vi.spyOn(notificationProvider, 'send').mockImplementation(async (input) => {
      if (input.subject === 'Retry fixture') throw new Error('Simulated provider outage');
    });
    try {
      await runJobs();
    } finally {
      provider.mockRestore();
    }
    const failed = await db.outboxJob.findUniqueOrThrow({ where: { id: job.id } });
    expect(failed.completedAt).toBeNull();
    expect(failed.attempts).toBe(1);
    expect(failed.lastError).toBe('EMAIL_DELIVERY_FAILED');
    expect(failed.encryptedPayload).not.toBe('');
    await db.outboxJob.update({
      where: { id: job.id },
      data: { availableAt: new Date(0), lockedUntil: new Date(0) },
    });
    await runJobs();
    const recovered = await db.outboxJob.findUniqueOrThrow({ where: { id: job.id } });
    expect(recovered.completedAt).not.toBeNull();
    expect(recovered.attempts).toBe(2);
  });
  it('automatic confirmation still waits for required verification', async () => {
    await db.systemSettings.update({
      where: { id: 'hotel' },
      data: { confirmationMode: 'AUTOMATIC' },
    });
    try {
      const type = await fixture();
      const created = await createReservation(booking(type.id));
      expect(created.status).toBe('PENDING_EMAIL_VERIFICATION');
      await exchangeToken(await emailToken(created.reference));
      expect((await stored(created.reference)).status).toBe('CONFIRMED');
    } finally {
      await db.systemSettings.update({
        where: { id: 'hotel' },
        data: { confirmationMode: 'MANUAL' },
      });
    }
  });
  it('rejects promotion targeting and minimum stay mismatches', async () => {
    const type = await fixture();
    const other = await fixture();
    const promotion = await db.promotion.create({
      data: {
        code: randomUUID().toUpperCase(),
        name: 'Targeted test',
        kind: 'PERCENTAGE',
        value: 20,
        startsAt: new Date(Date.now() - 86400000),
        endsAt: new Date(Date.now() + 86400000),
        usageLimit: 5,
        allRooms: false,
        minNights: 3,
        roomTypes: { create: { roomTypeId: other.id } },
      },
    });
    await expect(
      createReservation(booking(type.id, { promotionCode: promotion.code })),
    ).rejects.toMatchObject({ code: 'INVALID_PROMOTION' });
    await expect(
      createReservation(booking(type.id, { promotionCode: promotion.code, checkOut: date(14) })),
    ).rejects.toMatchObject({ code: 'INVALID_PROMOTION' });
    const ok = await createReservation(
      booking(other.id, { promotionCode: promotion.code, checkOut: date(14) }),
    );
    expect((await stored(ok.reference)).discount).toBe(360000);
  });
  it('tokens have high entropy and only hashes persist in token table', async () => {
    const row = await db.verificationToken.findFirstOrThrow();
    expect(row.tokenHash).toMatch(/^[a-f0-9]{64}$/);
    expect(hash('short')).not.toBe(row.tokenHash);
  });
});
