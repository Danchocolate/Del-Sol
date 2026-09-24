import type { SearchInput } from '@hotel/shared';
import { nightsBetween } from '@hotel/shared';
import type { SystemSettings } from '@prisma/client';
import type { Tx } from '../../lib/db.js';
import { assert } from '../../lib/errors.js';
export function hotelToday(timezone: string, now = new Date()) {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: timezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(now);
}
export function validateStay(input: SearchInput, settings: SystemSettings, now = new Date()) {
  const nights = nightsBetween(input.checkIn, input.checkOut);
  assert(
    Number.isInteger(nights) && nights > 0 && nights <= settings.maxStayNights,
    400,
    'INVALID_STAY',
    `Stay must be between 1 and ${settings.maxStayNights} nights.`,
  );
  assert(
    input.checkIn >= hotelToday(settings.timezone, now),
    400,
    'PAST_DATE',
    'Check-in cannot be in the past.',
  );
  assert(
    input.checkIn <= new Date(now.getTime() + 730 * 86400000).toISOString().slice(0, 10),
    400,
    'DATE_LIMIT',
    'Bookings are accepted up to two years ahead.',
  );
  assert(
    input.rooms <= settings.maxRooms && input.guests >= input.rooms,
    400,
    'ROOM_LIMIT',
    'Requested room quantity is not permitted.',
  );
  return nights;
}
export const roomInclude = {
  images: {
    where: { archived: false },
    orderBy: [{ position: 'asc' as const }, { id: 'asc' as const }],
  },
  amenities: { include: { amenity: true } },
};
export async function findRooms(tx: Tx, input: SearchInput, roomTypeId?: string) {
  return tx.room.findMany({
    where: {
      active: true,
      roomType: { active: true },
      ...(roomTypeId ? { roomTypeId } : {}),
      allocations: {
        none: {
          active: true,
          checkIn: { lt: new Date(input.checkOut) },
          checkOut: { gt: new Date(input.checkIn) },
        },
      },
      blocks: {
        none: {
          active: true,
          startDate: { lt: new Date(input.checkOut) },
          endDate: { gt: new Date(input.checkIn) },
        },
      },
    },
    include: { roomType: { include: roomInclude } },
    orderBy: [{ basePrice: 'asc' }, { number: 'asc' }],
  });
}
export function selectRooms<T extends { capacity: number }>(
  rooms: T[],
  quantity: number,
  guests: number,
): T[] {
  // Deterministically choose largest capacity first so valid multi-room stays are not missed.
  const selected = [...rooms].sort((a, b) => b.capacity - a.capacity).slice(0, quantity);
  return selected.length === quantity && selected.reduce((sum, r) => sum + r.capacity, 0) >= guests
    ? selected
    : [];
}
