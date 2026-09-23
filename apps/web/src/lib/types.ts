import type { Role, RoomTypeView, Status } from '@hotel/shared';
export interface PublicData {
  content: {
    headline: string;
    introduction: string;
    about: string;
    address: string;
    email: string;
    phone: string;
    mapUrl: string | null;
    amenities: string[];
  };
  rooms: RoomTypeView[];
  gallery: { id: string; url: string; alt: string; caption: string }[];
  promotions: {
    code: string;
    name: string;
    kind: string;
    value: number;
    minNights: number;
    endsAt: string;
  }[];
  settings: {
    mobileRequired: boolean;
    maxRooms: number;
    maxStayNights: number;
    cancellationCutoffHours: number;
    timezone: string;
  };
}
export interface StaffUser {
  id: string;
  name: string;
  email: string;
  role: Role;
  active: boolean;
}
export interface Reservation {
  id: string;
  reference: string;
  status: Status;
  source: string;
  checkIn: string;
  checkOut: string;
  guestCount: number;
  roomCount: number;
  subtotal: number;
  discount: number;
  total: number;
  createdAt: string;
  guest: { name: string; email: string; mobile?: string };
  rooms: { roomName: string; nightlyRate: number; room?: { number: string } }[];
  history: { id: string; toStatus: Status; createdAt: string; reason?: string }[];
  payments: Payment[];
  events: { id: string; kind: string; createdAt: string }[];
}
export interface Payment {
  id: string;
  amount: number;
  method: string;
  paidAt: string;
  receipt: string;
  notes?: string;
  reversalOfId?: string;
}
export const dateLabel = (value: string) =>
  new Intl.DateTimeFormat('en-PH', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    timeZone: 'UTC',
  }).format(new Date(value));
export const statusLabel = (value: string) => value.toLowerCase().replaceAll('_', ' ');
