import type { ReservationSource } from '@prisma/client';
export interface NotificationProvider {
  send(input: { to: string; subject: string; text: string; idempotencyKey: string }): Promise<void>;
}
export interface StorageProvider {
  put(input: {
    key: string;
    body: Buffer;
    contentType: string;
  }): Promise<{ key: string; url: string }>;
}
export interface ReservationChannelProvider {
  readonly source: ReservationSource;
  publishAvailability(
    input: { roomTypeId: string; date: string; available: number }[],
  ): Promise<void>;
}
/** Reserved capability marker only. This base application never accepts payment credentials. */
export interface FuturePaymentProvider {
  readonly providerName: string;
}
