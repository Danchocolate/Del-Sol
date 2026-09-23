import { z } from 'zod';

export const statuses = [
  'PENDING_EMAIL_VERIFICATION',
  'PENDING_CONFIRMATION',
  'CONFIRMED',
  'CHECKED_IN',
  'CHECKED_OUT',
  'CANCELLED',
  'NO_SHOW',
  'EXPIRED',
] as const;
export const roles = ['SUPER_ADMIN', 'MANAGER', 'FRONT_DESK', 'CONTENT_EDITOR'] as const;
export const paymentMethods = [
  'CASH',
  'GCASH',
  'MAYA',
  'CARD_TERMINAL',
  'BANK_TRANSFER',
  'OTHER',
] as const;
export type Status = (typeof statuses)[number];
export type Role = (typeof roles)[number];
export const permissions = {
  SUPER_ADMIN: [
    'reservations:read',
    'reservations:write',
    'rooms:read',
    'rooms:write',
    'promotions:write',
    'payments:write',
    'reports:read',
    'content:write',
    'users:write',
    'settings:write',
    'audit:read',
  ],
  MANAGER: [
    'reservations:read',
    'reservations:write',
    'rooms:read',
    'rooms:write',
    'promotions:write',
    'payments:write',
    'reports:read',
    'settings:write',
    'audit:read',
  ],
  FRONT_DESK: ['reservations:read', 'reservations:write', 'rooms:read', 'payments:write'],
  CONTENT_EDITOR: ['content:write'],
} satisfies Record<Role, string[]>;
export type Permission = (typeof permissions.SUPER_ADMIN)[number];
export const hasPermission = (role: Role, permission: string) =>
  (permissions[role] as readonly string[]).includes(permission);
export const transitions: Record<Status, readonly Status[]> = {
  PENDING_EMAIL_VERIFICATION: ['PENDING_CONFIRMATION', 'CONFIRMED', 'CANCELLED', 'EXPIRED'],
  PENDING_CONFIRMATION: ['CONFIRMED', 'CANCELLED'],
  CONFIRMED: ['CHECKED_IN', 'CANCELLED', 'NO_SHOW'],
  CHECKED_IN: ['CHECKED_OUT'],
  CHECKED_OUT: [],
  CANCELLED: [],
  NO_SHOW: [],
  EXPIRED: [],
};
export const dateSchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/)
  .refine(
    (v) => !Number.isNaN(Date.parse(v)) && new Date(v).toISOString().slice(0, 10) === v,
    'Invalid calendar date',
  );
export const searchSchema = z
  .object({
    checkIn: dateSchema,
    checkOut: dateSchema,
    guests: z.coerce.number().int().min(1).max(40),
    rooms: z.coerce.number().int().min(1).max(10).default(1),
    promotionCode: z.string().trim().toUpperCase().max(40).optional(),
  })
  .strict()
  .refine((v) => v.checkOut > v.checkIn, 'Check-out must follow check-in')
  .refine((v) => v.guests >= v.rooms, 'At least one guest per room is required');
export const bookingSchema = searchSchema.safeExtend({
  roomTypeId: z.string().uuid(),
  name: z.string().trim().min(2).max(120),
  email: z
    .email()
    .max(254)
    .transform((v) => v.trim().toLowerCase()),
  mobile: z
    .string()
    .trim()
    .max(30)
    .regex(/^[+\d ()-]*$/)
    .optional(),
  turnstileToken: z.string().min(1).max(2048),
  idempotencyKey: z.string().uuid(),
});
export type SearchInput = z.infer<typeof searchSchema>;
export type BookingInput = z.infer<typeof bookingSchema>;
export const lookupSchema = z
  .object({
    reference: z.string().regex(/^HDS-[A-F0-9]{16}$/),
    email: z
      .email()
      .max(254)
      .transform((v) => v.trim().toLowerCase()),
    turnstileToken: z.string().min(1).max(2048),
  })
  .strict();
export const tokenSchema = z.object({ token: z.string().regex(/^[a-f0-9]{64}$/) }).strict();
export const cancellationSchema = z
  .object({ reason: z.string().trim().max(500).optional() })
  .strict();
export const roomTypeSchema = z
  .object({
    name: z.string().trim().min(2).max(100),
    slug: z
      .string()
      .regex(/^[a-z0-9-]+$/)
      .max(100),
    description: z.string().min(10).max(4000),
    capacity: z.number().int().min(1).max(10),
    basePrice: z.number().int().min(100).max(100000000),
    sizeSqm: z.number().int().min(1).max(1000),
    bed: z.string().min(1).max(100),
    active: z.boolean(),
    amenities: z.array(z.string().trim().min(1).max(80)).max(30),
  })
  .strict();
export const roomSchema = z
  .object({
    number: z.string().trim().min(1).max(20),
    roomTypeId: z.string().uuid(),
    capacity: z.number().int().min(1).max(10),
    basePrice: z.number().int().min(100).max(100000000).nullable(),
    active: z.boolean(),
  })
  .strict();
export const promotionSchema = z
  .object({
    code: z
      .string()
      .trim()
      .toUpperCase()
      .regex(/^[A-Z0-9-]+$/)
      .max(40),
    name: z.string().min(2).max(100),
    kind: z.enum(['PERCENTAGE', 'FIXED']),
    value: z.number().int().min(1).max(100000000),
    active: z.boolean(),
    startsAt: z.iso.datetime(),
    endsAt: z.iso.datetime(),
    stayStartsAt: dateSchema.nullable(),
    stayEndsAt: dateSchema.nullable(),
    minNights: z.number().int().min(1).max(365),
    usageLimit: z.number().int().min(1).max(1000000),
    perEmailLimit: z.number().int().min(1).max(100),
    allRooms: z.boolean(),
    roomTypeIds: z.array(z.string().uuid()).max(100),
    roomIds: z.array(z.string().uuid()).max(500),
  })
  .strict()
  .refine((v) => v.endsAt > v.startsAt, 'Invalid validity dates')
  .refine((v) => v.kind !== 'PERCENTAGE' || v.value <= 100, 'Percentage cannot exceed 100')
  .refine((v) => v.allRooms || v.roomTypeIds.length + v.roomIds.length > 0, 'Select eligible rooms')
  .refine(
    (v) => !v.stayStartsAt || !v.stayEndsAt || v.stayEndsAt > v.stayStartsAt,
    'Invalid stay dates',
  );
export const settingsSchema = z
  .object({
    emailVerificationRequired: z.boolean(),
    mobileRequired: z.boolean(),
    cancellationCutoffHours: z.number().int().min(0).max(720),
    unverifiedExpiryMinutes: z.number().int().min(5).max(120),
    maxRooms: z.number().int().min(1).max(10),
    maxStayNights: z.number().int().min(1).max(365),
    confirmationMode: z.enum(['MANUAL', 'AUTOMATIC']),
    timezone: z.string().refine((v) => {
      try {
        new Intl.DateTimeFormat('en', { timeZone: v });
        return true;
      } catch {
        return false;
      }
    }, 'Invalid timezone'),
    checkInHour: z.number().int().min(0).max(23),
  })
  .strict();
export const contentSchema = z
  .object({
    headline: z.string().min(1).max(150),
    introduction: z.string().min(1).max(300),
    about: z.string().min(1).max(4000),
    address: z.string().max(500),
    email: z.email(),
    phone: z.string().max(50),
    mapUrl: z.url().startsWith('https://').nullable(),
    amenities: z.array(z.string().max(100)).max(20),
  })
  .strict();
export const paymentSchema = z
  .object({
    amount: z.number().int().min(1).max(100000000),
    method: z.enum(paymentMethods),
    paidAt: z.iso.datetime(),
    receipt: z.string().trim().min(1).max(100),
    notes: z.string().max(500).optional(),
    idempotencyKey: z.string().uuid(),
  })
  .strict();
export const money = (minor: number) =>
  new Intl.NumberFormat('en-PH', {
    style: 'currency',
    currency: 'PHP',
    maximumFractionDigits: minor % 100 === 0 ? 0 : 2,
  }).format(minor / 100);
export const nightsBetween = (start: string, end: string) =>
  Math.round((Date.parse(end) - Date.parse(start)) / 86400000);
export interface RoomTypeView {
  id: string;
  slug: string;
  name: string;
  description: string;
  capacity: number;
  basePrice: number;
  sizeSqm: number;
  bed: string;
  active: boolean;
  images: { id: string; url: string; alt: string; position: number }[];
  amenities: { amenity: { name: string } }[];
}
export interface AvailabilityView {
  roomType: RoomTypeView;
  available: number;
  subtotal: number;
  discount: number;
  total: number;
  nights: number;
}
