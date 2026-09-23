import { describe, it, expect } from 'vitest';
import {
  bookingSchema,
  searchSchema,
  dateSchema,
  hasPermission,
  transitions,
  nightsBetween,
  paymentSchema,
} from '@hotel/shared';
import { calculatePrice } from '../../apps/api/src/modules/promotions/pricing.js';
import { selectRooms, validateStay } from '../../apps/api/src/modules/availability/service.js';
import type { SystemSettings } from '@prisma/client';
const settings: SystemSettings = {
  id: 'hotel',
  emailVerificationRequired: true,
  mobileRequired: true,
  cancellationCutoffHours: 24,
  unverifiedExpiryMinutes: 30,
  maxRooms: 4,
  maxStayNights: 30,
  confirmationMode: 'MANUAL',
  timezone: 'Asia/Manila',
  checkInHour: 14,
  updatedAt: new Date(),
};
describe('reservation invariants', () => {
  it('uses calendar nights across leap day', () =>
    expect(nightsBetween('2028-02-28', '2028-03-01')).toBe(2));
  it('rejects impossible dates, same-day stays, and reversed dates', () => {
    expect(dateSchema.safeParse('2027-02-29').success).toBe(false);
    for (const checkOut of ['2027-01-01', '2026-12-31'])
      expect(searchSchema.safeParse({ checkIn: '2027-01-01', checkOut, guests: 2 }).success).toBe(
        false,
      );
  });
  it('rejects client prices and statuses', () =>
    expect(bookingSchema.safeParse({ total: 1, status: 'CONFIRMED' }).success).toBe(false));
  it('limits stay length and room quantity', () => {
    expect(() =>
      validateStay(
        { checkIn: '2027-01-01', checkOut: '2027-03-01', guests: 2, rooms: 1 },
        settings,
        new Date('2026-12-01'),
      ),
    ).toThrow();
    expect(() =>
      validateStay(
        { checkIn: '2027-01-01', checkOut: '2027-01-02', guests: 5, rooms: 5 },
        settings,
        new Date('2026-12-01'),
      ),
    ).toThrow();
  });
  it('chooses enough physical capacity for room quantity', () => {
    expect(selectRooms([{ capacity: 1 }, { capacity: 3 }, { capacity: 2 }], 2, 5)).toHaveLength(2);
    expect(selectRooms([{ capacity: 2 }], 2, 3)).toEqual([]);
    expect(selectRooms([{ capacity: 2 }, { capacity: 2 }], 2, 5)).toEqual([]);
  });
  it('computes server-side rates and caps fixed discount', () => {
    expect(calculatePrice([450000, 450000], 3, { kind: 'PERCENTAGE', value: 10 })).toEqual({
      subtotal: 2700000,
      discount: 270000,
      total: 2430000,
    });
    expect(calculatePrice([100], 1, { kind: 'FIXED', value: 1000 }).total).toBe(0);
  });
  it('rounds percentages deterministically in minor units', () =>
    expect(calculatePrice([101], 1, { kind: 'PERCENTAGE', value: 15 }).discount).toBe(15));
  it('prevents illegal terminal transitions', () => {
    expect(transitions.CHECKED_OUT).toEqual([]);
    expect(transitions.CANCELLED).toEqual([]);
    expect(transitions.CONFIRMED).not.toContain('CHECKED_OUT');
  });
  it('separates staff permissions', () => {
    expect(hasPermission('CONTENT_EDITOR', 'reservations:read')).toBe(false);
    expect(hasPermission('FRONT_DESK', 'users:write')).toBe(false);
    expect(hasPermission('MANAGER', 'reports:read')).toBe(true);
  });
  it('never accepts card credentials in payment input', () =>
    expect(
      paymentSchema.safeParse({
        amount: 100,
        method: 'CASH',
        paidAt: new Date().toISOString(),
        receipt: 'R1',
        idempotencyKey: crypto.randomUUID(),
        cardNumber: '4111111111111111',
      }).success,
    ).toBe(false));
});
