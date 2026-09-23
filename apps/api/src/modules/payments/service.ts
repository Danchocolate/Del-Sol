import type { z } from 'zod';
import type { paymentSchema } from '@hotel/shared';
import { inventoryTransaction } from '../../lib/db.js';
import { assert } from '../../lib/errors.js';
import { audit } from '../audit/service.js';
export async function recordPayment(
  reservationId: string,
  input: z.infer<typeof paymentSchema>,
  actorId: string,
) {
  return inventoryTransaction(async (tx) => {
    const existing = await tx.payment.findUnique({
      where: { idempotencyKey: input.idempotencyKey },
    });
    if (existing) {
      assert(
        existing.reservationId === reservationId &&
          existing.amount === input.amount &&
          existing.method === input.method &&
          existing.receipt === input.receipt &&
          existing.paidAt.toISOString() === new Date(input.paidAt).toISOString() &&
          (existing.notes ?? '') === (input.notes ?? ''),
        409,
        'IDEMPOTENCY_CONFLICT',
        'Payment request key already used.',
      );
      return existing;
    }
    await tx.reservation.findUniqueOrThrow({ where: { id: reservationId } });
    assert(
      new Date(input.paidAt).getTime() <= Date.now() + 60000,
      400,
      'FUTURE_PAYMENT',
      'Payment date cannot be in the future.',
    );
    const payment = await tx.payment.create({
      data: { ...input, paidAt: new Date(input.paidAt), reservationId, recordedBy: actorId },
    });
    await audit(tx, actorId, 'PAYMENT_RECORDED', 'Payment', payment.id, {
      reservationId,
      amount: payment.amount,
      method: payment.method,
    });
    await tx.reservationEvent.create({
      data: {
        reservationId,
        kind: 'PAYMENT_RECORDED',
        metadata: { paymentId: payment.id, amount: payment.amount },
      },
    });
    return payment;
  });
}
export async function reversePayment(id: string, reason: string, actorId: string) {
  return inventoryTransaction(async (tx) => {
    const original = await tx.payment.findUniqueOrThrow({
      where: { id },
      include: { reversal: true },
    });
    if (original.reversal) return original.reversal;
    assert(
      !original.reversalOfId,
      409,
      'INVALID_REVERSAL',
      'A reversal cannot be reversed. Record a corrected payment.',
    );
    const reversal = await tx.payment.create({
      data: {
        reservationId: original.reservationId,
        idempotencyKey: `reverse:${id}`,
        amount: -original.amount,
        method: original.method,
        paidAt: new Date(),
        receipt: original.receipt,
        notes: reason,
        recordedBy: actorId,
        reversalOfId: id,
      },
    });
    await audit(tx, actorId, 'PAYMENT_CORRECTED', 'Payment', reversal.id, {
      originalPaymentId: id,
      amount: reversal.amount,
    });
    await tx.reservationEvent.create({
      data: {
        reservationId: original.reservationId,
        kind: 'PAYMENT_CORRECTED',
        metadata: { paymentId: reversal.id, originalPaymentId: id },
      },
    });
    return reversal;
  });
}
