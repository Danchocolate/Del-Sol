import type { Promotion, Room } from '@prisma/client';
import type { Tx } from '../../lib/db.js';
import { assert } from '../../lib/errors.js';
import { hash } from '../../lib/crypto.js';
export function calculatePrice(
  rates: number[],
  nights: number,
  promotion: Pick<Promotion, 'kind' | 'value'> | null,
) {
  const subtotal = rates.reduce((s, r) => s + r * nights, 0);
  const discount = promotion
    ? Math.min(
        subtotal,
        promotion.kind === 'PERCENTAGE'
          ? Math.floor((subtotal * promotion.value) / 100)
          : promotion.value,
      )
    : 0;
  assert(
    Number.isSafeInteger(subtotal) && subtotal <= 2000000000,
    400,
    'PRICE_LIMIT',
    'Reservation total exceeds the permitted limit.',
  );
  return { subtotal, discount, total: subtotal - discount };
}
export async function eligiblePromotion(
  tx: Tx,
  code: string | undefined,
  rooms: Room[],
  nights: number,
  checkIn: string,
  checkOut: string,
  email?: string,
) {
  if (!code) return null;
  const promo = await tx.promotion.findUnique({
    where: { code },
    include: { rooms: true, roomTypes: true },
  });
  const now = new Date();
  assert(
    promo &&
      promo.active &&
      promo.startsAt <= now &&
      promo.endsAt >= now &&
      nights >= promo.minNights,
    400,
    'INVALID_PROMOTION',
    'This promotion is not applicable to this stay.',
  );
  assert(
    (!promo.stayStartsAt || new Date(checkIn) >= promo.stayStartsAt) &&
      (!promo.stayEndsAt || new Date(checkOut) <= promo.stayEndsAt),
    400,
    'INVALID_PROMOTION',
    'Stay dates do not qualify for this promotion.',
  );
  assert(
    promo.allRooms ||
      rooms.every(
        (r) =>
          promo.rooms.some((p) => p.roomId === r.id) ||
          promo.roomTypes.some((p) => p.roomTypeId === r.roomTypeId),
      ),
    400,
    'INVALID_PROMOTION',
    'Selected rooms do not qualify for this promotion.',
  );
  const used = await tx.promotionRedemption.count({
    where: { promotionId: promo.id, releasedAt: null },
  });
  assert(
    used < promo.usageLimit,
    409,
    'PROMOTION_EXHAUSTED',
    'This promotion has reached its redemption limit.',
  );
  if (email) {
    const own = await tx.promotionRedemption.count({
      where: { promotionId: promo.id, emailHash: hash(email), releasedAt: null },
    });
    assert(
      own < promo.perEmailLimit,
      409,
      'PROMOTION_EXHAUSTED',
      'The email redemption limit has been reached.',
    );
  }
  return promo;
}
