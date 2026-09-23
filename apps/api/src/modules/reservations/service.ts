import { randomUUID } from 'node:crypto';
import { fromZonedTime } from 'date-fns-tz';
import { transitions, type BookingInput, type Status } from '@hotel/shared';
import type { Reservation, ReservationSource } from '@prisma/client';
import { db, inventoryTransaction, type Tx } from '../../lib/db.js';
import { assert } from '../../lib/errors.js';
import { hash, randomToken, reference } from '../../lib/crypto.js';
import { audit } from '../audit/service.js';
import { findRooms, selectRooms, validateStay, hotelToday } from '../availability/service.js';
import { calculatePrice, eligiblePromotion } from '../promotions/pricing.js';
import { queueEmail } from '../notifications/service.js';

export async function issueToken(
  tx: Tx,
  reservation: Reservation,
  email: string,
  purpose: 'VERIFY' | 'LOOKUP',
) {
  await tx.verificationToken.updateMany({
    where: { reservationId: reservation.id, purpose, usedAt: null },
    data: { usedAt: new Date() },
  });
  const token = randomToken();
  const limit = purpose === 'VERIFY' ? reservation.expiresAt?.getTime() : undefined;
  const expiresAt = new Date(Math.min(Date.now() + 15 * 60000, limit ?? Infinity));
  await tx.verificationToken.create({
    data: { reservationId: reservation.id, purpose, tokenHash: hash(token), expiresAt },
  });
  await queueEmail(tx, {
    to: email,
    reference: reservation.reference,
    kind: purpose,
    token,
    dedupeKey: `token:${randomUUID()}`,
  });
}
export async function changeStatus(
  tx: Tx,
  reservation: Reservation,
  next: Status,
  actorId: string | null,
  reason?: string,
) {
  if (reservation.status === next) return reservation;
  assert(
    transitions[reservation.status].includes(next),
    409,
    'INVALID_TRANSITION',
    `Cannot change ${reservation.status} to ${next}.`,
  );
  if (next === 'CONFIRMED') {
    const policy = reservation.policySnapshot as { emailVerificationRequired: boolean };
    assert(
      !policy.emailVerificationRequired || reservation.emailVerifiedAt,
      409,
      'EMAIL_UNVERIFIED',
      'Email verification is required before confirmation.',
    );
  }
  const now = new Date();
  const updated = await tx.reservation.update({
    where: { id: reservation.id },
    data: {
      status: next,
      ...(next === 'CANCELLED' ? { cancelledAt: now, cancellationReason: reason } : {}),
      ...(next !== 'PENDING_EMAIL_VERIFICATION' ? { expiresAt: null } : {}),
    },
  });
  if (['CANCELLED', 'EXPIRED', 'CHECKED_OUT', 'NO_SHOW'].includes(next))
    await tx.reservationRoom.updateMany({
      where: { reservationId: reservation.id, active: true },
      data: { active: false },
    });
  if (['CANCELLED', 'EXPIRED'].includes(next))
    await tx.promotionRedemption.updateMany({
      where: { reservationId: reservation.id, releasedAt: null },
      data: { releasedAt: now },
    });
  if (['CANCELLED', 'EXPIRED'].includes(next))
    await tx.verificationToken.updateMany({
      where: { reservationId: reservation.id, purpose: 'VERIFY', usedAt: null },
      data: { usedAt: now },
    });
  await tx.reservationStatusHistory.create({
    data: {
      reservationId: reservation.id,
      fromStatus: reservation.status,
      toStatus: next,
      actorId,
      reason,
    },
  });
  await tx.reservationEvent.create({
    data: { reservationId: reservation.id, kind: next, metadata: { actorId } },
  });
  await audit(tx, actorId, `RESERVATION_${next}`, 'Reservation', reservation.id, {
    from: reservation.status,
    to: next,
  });
  const guest = await tx.guest.findUniqueOrThrow({ where: { id: reservation.guestId } });
  await queueEmail(tx, {
    to: guest.email,
    reference: reservation.reference,
    kind: ['CONFIRMED', 'CANCELLED', 'EXPIRED'].includes(next)
      ? next
      : next === 'PENDING_CONFIRMATION'
        ? 'RECEIVED'
        : 'STATUS',
    dedupeKey: `status:${reservation.id}:${next}`,
  });
  if (['PENDING_CONFIRMATION', 'CONFIRMED'].includes(next))
    await tx.notification.create({
      data: {
        title: `${reservation.reference} · ${next === 'CONFIRMED' ? 'Confirmed reservation' : 'New verified reservation'}`,
        reservationId: reservation.id,
      },
    });
  return updated;
}
export async function expireHolds(tx: Tx) {
  const due = await tx.reservation.findMany({
    where: { status: 'PENDING_EMAIL_VERIFICATION', expiresAt: { lte: new Date() } },
    take: 200,
  });
  for (const reservation of due) await changeStatus(tx, reservation, 'EXPIRED', null);
  return due.length;
}
export async function createReservation(
  input: BookingInput,
  source: ReservationSource = 'DIRECT',
  actorId: string | null = null,
) {
  const { turnstileToken: _turnstile, ...canonical } = input;
  const requestHash = hash(JSON.stringify({ ...canonical, source }));
  return inventoryTransaction(async (tx) => {
    const existing = await tx.reservation.findUnique({
      where: { idempotencyKey: input.idempotencyKey },
    });
    if (existing) {
      assert(
        existing.requestHash === requestHash,
        409,
        'IDEMPOTENCY_CONFLICT',
        'This request key was already used for another reservation.',
      );
      return { reference: existing.reference, status: existing.status };
    }
    await expireHolds(tx);
    const settings = await tx.systemSettings.findUniqueOrThrow({ where: { id: 'hotel' } });
    const nights = validateStay(input, settings);
    assert(
      !settings.mobileRequired || (input.mobile && input.mobile.replace(/\D/g, '').length >= 7),
      400,
      'MOBILE_REQUIRED',
      'A valid mobile number is required.',
    );
    const selected = selectRooms(
      await findRooms(tx, input, input.roomTypeId),
      input.rooms,
      input.guests,
    );
    assert(
      selected.length === input.rooms,
      409,
      'INVENTORY_CONFLICT',
      'These rooms are no longer available. Please refresh your search.',
    );
    const promo = await eligiblePromotion(
      tx,
      input.promotionCode,
      selected,
      nights,
      input.checkIn,
      input.checkOut,
      input.email,
    );
    const rates = selected.map((r) => r.basePrice ?? r.roomType.basePrice);
    const price = calculatePrice(rates, nights, promo);
    const guest = await tx.guest.create({
      data: { name: input.name, email: input.email, mobile: input.mobile },
    });
    const status: Status = settings.emailVerificationRequired
      ? 'PENDING_EMAIL_VERIFICATION'
      : settings.confirmationMode === 'AUTOMATIC'
        ? 'CONFIRMED'
        : 'PENDING_CONFIRMATION';
    const reservation = await tx.reservation.create({
      data: {
        reference: reference(),
        idempotencyKey: input.idempotencyKey,
        requestHash,
        guestId: guest.id,
        status,
        source,
        checkIn: new Date(input.checkIn),
        checkOut: new Date(input.checkOut),
        guestCount: input.guests,
        roomCount: input.rooms,
        ...price,
        priceSnapshot: {
          nights,
          rates,
          currency: 'PHP',
          promotion: promo ? { code: promo.code, kind: promo.kind, value: promo.value } : null,
        },
        policySnapshot: {
          emailVerificationRequired: settings.emailVerificationRequired,
          cancellationCutoffHours: settings.cancellationCutoffHours,
          timezone: settings.timezone,
          checkInHour: settings.checkInHour,
          confirmationMode: settings.confirmationMode,
        },
        expiresAt: settings.emailVerificationRequired
          ? new Date(Date.now() + settings.unverifiedExpiryMinutes * 60000)
          : null,
        rooms: {
          create: selected.map((r, i) => ({
            roomId: r.id,
            checkIn: new Date(input.checkIn),
            checkOut: new Date(input.checkOut),
            nightlyRate: rates[i]!,
            roomName: r.roomType.name,
          })),
        },
        history: { create: { toStatus: status, actorId } },
        events: { create: { kind: 'CREATED', metadata: { source } } },
      },
    });
    if (promo)
      await tx.promotionRedemption.create({
        data: {
          promotionId: promo.id,
          reservationId: reservation.id,
          emailHash: hash(input.email),
          amount: price.discount,
        },
      });
    await audit(tx, actorId, 'RESERVATION_CREATED', 'Reservation', reservation.id, {
      source,
      roomCount: input.rooms,
      total: price.total,
    });
    if (settings.emailVerificationRequired)
      await issueToken(tx, reservation, input.email, 'VERIFY');
    else {
      await queueEmail(tx, {
        to: input.email,
        reference: reservation.reference,
        kind: status === 'CONFIRMED' ? 'CONFIRMED' : 'RECEIVED',
        dedupeKey: `received:${reservation.id}`,
      });
      await tx.notification.create({
        data: {
          title: `${reservation.reference} · New reservation`,
          reservationId: reservation.id,
        },
      });
    }
    return { reference: reservation.reference, status };
  });
}
export async function exchangeToken(token: string) {
  return inventoryTransaction(async (tx) => {
    const record = await tx.verificationToken.findUnique({
      where: { tokenHash: hash(token) },
      include: { reservation: true },
    });
    assert(
      record && !record.usedAt && record.expiresAt > new Date(),
      400,
      'INVALID_TOKEN',
      'This link is invalid, used, or expired. Request a new email.',
    );
    if (record.purpose === 'VERIFY') {
      assert(
        record.reservation.status === 'PENDING_EMAIL_VERIFICATION' &&
          record.reservation.expiresAt &&
          record.reservation.expiresAt > new Date(),
        400,
        'EXPIRED_HOLD',
        'This reservation hold has expired.',
      );
      const verified = await tx.reservation.update({
        where: { id: record.reservationId },
        data: { emailVerifiedAt: new Date() },
      });
      const policy = verified.policySnapshot as { confirmationMode: string };
      await changeStatus(
        tx,
        verified,
        policy.confirmationMode === 'AUTOMATIC' ? 'CONFIRMED' : 'PENDING_CONFIRMATION',
        null,
      );
    }
    await tx.verificationToken.update({ where: { id: record.id }, data: { usedAt: new Date() } });
    const grant = randomToken();
    await tx.guestGrant.create({
      data: {
        reservationId: record.reservationId,
        tokenHash: hash(grant),
        expiresAt: new Date(Date.now() + 30 * 60000),
      },
    });
    return { grant, reference: record.reservation.reference };
  });
}
export async function requestAccess(reference: string, email: string) {
  await inventoryTransaction(async (tx) => {
    await expireHolds(tx);
    const reservation = await tx.reservation.findUnique({
      where: { reference },
      include: { guest: true },
    });
    if (!reservation || reservation.guest.email !== email) return;
    await issueToken(
      tx,
      reservation,
      email,
      reservation.status === 'PENDING_EMAIL_VERIFICATION' ? 'VERIFY' : 'LOOKUP',
    );
  });
  return { message: 'If the details match a reservation, a secure email will arrive shortly.' };
}
export async function resolveGrant(token: string | undefined, reference?: string) {
  assert(token, 401, 'ACCESS_REQUIRED', 'Use a secure email link to access this reservation.');
  const grant = await db.guestGrant.findUnique({
    where: { tokenHash: hash(token) },
    include: { reservation: true },
  });
  assert(
    grant &&
      grant.expiresAt > new Date() &&
      (!reference || grant.reservation.reference === reference),
    401,
    'ACCESS_REQUIRED',
    'Your reservation access has expired. Request another email.',
  );
  return grant.reservation;
}
export async function cancelReservation(
  id: string,
  reason?: string,
  actorId: string | null = null,
) {
  return inventoryTransaction(async (tx) => {
    const reservation = await tx.reservation.findUniqueOrThrow({ where: { id } });
    if (reservation.status === 'CANCELLED') return { status: reservation.status };
    if (!actorId) {
      const policy = reservation.policySnapshot as {
        cancellationCutoffHours: number;
        timezone: string;
        checkInHour: number;
      };
      const checkIn = fromZonedTime(
        `${reservation.checkIn.toISOString().slice(0, 10)}T${String(policy.checkInHour).padStart(2, '0')}:00:00`,
        policy.timezone,
      );
      assert(
        Date.now() <= checkIn.getTime() - policy.cancellationCutoffHours * 3600000,
        409,
        'CANCELLATION_CUTOFF',
        'The cancellation cutoff has passed. Please contact the hotel.',
      );
    }
    const updated = await changeStatus(tx, reservation, 'CANCELLED', actorId, reason);
    return { status: updated.status };
  });
}
export async function staffTransition(id: string, next: Status, actorId: string, reason?: string) {
  return inventoryTransaction(async (tx) => {
    const reservation = await tx.reservation.findUniqueOrThrow({ where: { id } });
    assert(
      !['PENDING_EMAIL_VERIFICATION', 'PENDING_CONFIRMATION', 'EXPIRED'].includes(next),
      400,
      'INVALID_TRANSITION',
      'This transition is managed by the system.',
    );
    const settings = await tx.systemSettings.findUniqueOrThrow({ where: { id: 'hotel' } });
    const today = hotelToday(settings.timezone);
    if (next === 'CHECKED_IN')
      assert(
        reservation.checkIn.toISOString().slice(0, 10) <= today &&
          reservation.checkOut.toISOString().slice(0, 10) > today,
        409,
        'INVALID_CHECK_IN',
        'Check-in must occur during the booked stay.',
      );
    if (next === 'NO_SHOW')
      assert(
        today >= reservation.checkIn.toISOString().slice(0, 10),
        409,
        'INVALID_NO_SHOW',
        'No-show is only allowed on or after arrival date.',
      );
    return changeStatus(tx, reservation, next, actorId, reason);
  });
}
export const reservationDetails = (id: string) =>
  db.reservation.findUniqueOrThrow({
    where: { id },
    include: {
      guest: true,
      rooms: { include: { room: { select: { number: true } } } },
      history: { orderBy: { createdAt: 'asc' } },
      payments: { orderBy: { createdAt: 'asc' } },
      events: { orderBy: { createdAt: 'asc' } },
    },
  });
