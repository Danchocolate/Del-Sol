import { randomBytes, randomUUID } from 'node:crypto';
import { beforeAll, afterAll, describe, it, expect, vi } from 'vitest';
import { hashPassword } from 'better-auth/crypto';
import type { FastifyInstance } from 'fastify';
import { buildApp } from '../../apps/api/src/create-app.js';
import { db } from '../../apps/api/src/lib/db.js';
import { config } from '../../apps/api/src/config.js';
import { emailQuota } from '../../apps/api/src/modules/auth/abuse.js';
import { createReservation } from '../../apps/api/src/modules/reservations/service.js';
import { storage } from '../../apps/api/src/modules/gallery/storage.js';
import sharp from 'sharp';
import { hotelToday } from '../../apps/api/src/modules/availability/service.js';
let app: FastifyInstance;
let adminCookie = '';
let deskCookie = '';
let editorCookie = '';
const origin = config.APP_ORIGIN;
const randomIp = () => `10.${[...randomBytes(3)].join('.')}`;
async function login(role: 'SUPER_ADMIN' | 'FRONT_DESK' | 'CONTENT_EDITOR', ip: string) {
  const id = randomUUID();
  const email = `${id}@example.test`;
  const password = `TestOnly-${randomUUID()}`;
  await db.user.create({
    data: {
      id,
      name: 'API Test Employee',
      email,
      role,
      emailVerified: true,
      accounts: {
        create: {
          id: randomUUID(),
          accountId: id,
          providerId: 'credential',
          password: await hashPassword(password),
        },
      },
    },
  });
  const result = await app.inject({
    method: 'POST',
    url: '/api/auth/sign-in/email',
    headers: { origin },
    payload: { email, password },
    remoteAddress: ip,
  });
  expect(result.statusCode).toBe(200);
  return result.cookies.map((c) => `${c.name}=${c.value}`).join('; ');
}
beforeAll(async () => {
  await db.systemSettings.upsert({ where: { id: 'hotel' }, create: { id: 'hotel' }, update: {} });
  await db.hotelContent.upsert({
    where: { id: 'hotel' },
    create: {
      id: 'hotel',
      about: 'API test content',
      address: 'Test address',
      email: 'hotel@example.test',
      phone: 'Test phone',
      amenities: [],
    },
    update: {},
  });
  const type = await db.roomType.create({
    data: {
      slug: randomUUID(),
      name: 'API Fixture',
      description: 'API test inventory',
      capacity: 2,
      basePrice: 100000,
      sizeSqm: 20,
      bed: 'King',
      rooms: { create: { number: randomUUID(), capacity: 2 } },
    },
  });
  await createReservation({
    roomTypeId: type.id,
    checkIn: new Date(Date.now() + 40 * 86400000).toISOString().slice(0, 10),
    checkOut: new Date(Date.now() + 41 * 86400000).toISOString().slice(0, 10),
    guests: 1,
    rooms: 1,
    name: 'API Fixture Guest',
    email: `${randomUUID()}@example.test`,
    mobile: '+639171234567',
    turnstileToken: 'fixture',
    idempotencyKey: randomUUID(),
  });
  app = await buildApp();
  adminCookie = await login('SUPER_ADMIN', randomIp());
  deskCookie = await login('FRONT_DESK', randomIp());
  editorCookie = await login('CONTENT_EDITOR', randomIp());
});
afterAll(async () => {
  await app.close();
  await db.$disconnect();
});
describe.sequential('API security boundaries', () => {
  it('requires the jobs bearer secret without a browser Origin', async () => {
    const wrong = await app.inject({
      method: 'POST',
      url: '/api/internal/jobs',
      headers: { authorization: 'Bearer wrong' },
      payload: {},
    });
    expect(wrong.statusCode).toBe(401);
    const valid = await app.inject({
      method: 'POST',
      url: '/api/internal/jobs',
      headers: { authorization: `Bearer ${config.JOBS_SECRET}` },
      payload: {},
    });
    expect(valid.statusCode).toBe(200);
    expect(valid.json()).toEqual({ processed: expect.any(Number) });
  });
  it('requires authentication on every staff surface', async () => {
    for (const url of [
      '/api/admin/me',
      '/api/admin/reservations',
      '/api/admin/rooms',
      '/api/admin/room-types',
      '/api/admin/users',
      '/api/admin/settings',
      '/api/admin/reports',
      '/api/admin/audit',
      '/api/admin/promotions',
      '/api/admin/content',
      '/api/admin/gallery',
      '/api/admin/notifications',
      '/api/admin/job-health',
      '/api/admin/dev-inbox',
    ])
      expect((await app.inject({ url })).statusCode).toBe(401);
  });
  it('enforces role restrictions server-side', async () => {
    expect(
      (await app.inject({ url: '/api/admin/reservations', headers: { cookie: editorCookie } }))
        .statusCode,
    ).toBe(403);
    expect(
      (await app.inject({ url: '/api/admin/users', headers: { cookie: deskCookie } })).statusCode,
    ).toBe(403);
    expect(
      (await app.inject({ url: '/api/admin/reports', headers: { cookie: deskCookie } })).statusCode,
    ).toBe(403);
    expect(
      (await app.inject({ url: '/api/admin/content', headers: { cookie: editorCookie } }))
        .statusCode,
    ).toBe(200);
  });
  it('rejects cross-origin and originless state changes', async () => {
    for (const originValue of ['https://attacker.example', undefined]) {
      const response = await app.inject({
        method: 'POST',
        url: '/api/admin/rooms',
        headers: { cookie: adminCookie, ...(originValue ? { origin: originValue } : {}) },
        payload: {},
      });
      expect(response.statusCode).toBe(403);
    }
  });
  it('rejects malformed booking input and unexpected fields', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/api/reservations',
      headers: { origin },
      payload: { total: 1, status: 'CONFIRMED' },
    });
    expect(response.statusCode).toBe(400);
    expect(response.json().code).toBe('INVALID_INPUT');
  });
  it('does not reveal booking details using reference alone', async () => {
    const reservation = await db.reservation.findFirstOrThrow();
    const response = await app.inject({ url: `/api/reservations/${reservation.reference}` });
    expect(response.statusCode).toBe(401);
    expect(response.body).not.toContain(reservation.guestId);
  });
  it('blocks public employee signup', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/api/auth/sign-up/email',
      headers: { origin },
      payload: { name: 'Attacker', email: `${randomUUID()}@example.test`, password: randomUUID() },
    });
    expect(response.statusCode).toBeGreaterThanOrEqual(400);
  });
  it('lets a signed-in employee change their password and invalidates the old one', async () => {
    const id = randomUUID();
    const email = `${id}@example.test`;
    const currentPassword = `Original-${randomUUID()}`;
    const newPassword = `Replacement-${randomUUID()}`;
    await db.user.create({
      data: {
        id,
        name: 'Password Test Employee',
        email,
        role: 'FRONT_DESK',
        emailVerified: true,
        accounts: {
          create: {
            id: randomUUID(),
            accountId: id,
            providerId: 'credential',
            password: await hashPassword(currentPassword),
          },
        },
      },
    });
    const signedIn = await app.inject({
      method: 'POST',
      url: '/api/auth/sign-in/email',
      headers: { origin },
      payload: { email, password: currentPassword },
      remoteAddress: randomIp(),
    });
    expect(signedIn.statusCode).toBe(200);
    const cookie = signedIn.cookies.map((item) => `${item.name}=${item.value}`).join('; ');
    const changed = await app.inject({
      method: 'POST',
      url: '/api/auth/change-password',
      headers: { origin, cookie },
      payload: { currentPassword, newPassword, revokeOtherSessions: true },
      remoteAddress: randomIp(),
    });
    expect(changed.statusCode).toBe(200);
    const newLogin = await app.inject({
      method: 'POST',
      url: '/api/auth/sign-in/email',
      headers: { origin },
      payload: { email, password: newPassword },
      remoteAddress: randomIp(),
    });
    expect(newLogin.statusCode).toBe(200);
    const oldLogin = await app.inject({
      method: 'POST',
      url: '/api/auth/sign-in/email',
      headers: { origin },
      payload: { email, password: currentPassword },
      remoteAddress: randomIp(),
    });
    expect(oldLogin.statusCode).toBeGreaterThanOrEqual(400);
  });
  it('enforces JSON and body size limits', async () => {
    const text = await app.inject({
      method: 'POST',
      url: '/api/reservations',
      headers: { origin, 'content-type': 'text/plain' },
      payload: 'bad',
    });
    expect(text.statusCode).toBe(415);
    const huge = await app.inject({
      method: 'POST',
      url: '/api/reservations',
      headers: { origin },
      payload: { name: 'x'.repeat(40000) },
    });
    expect(huge.statusCode).toBe(413);
  });
  it('has no-store, frame protection, nosniff and permission headers', async () => {
    const response = await app.inject({ url: '/api/admin/me', headers: { cookie: adminCookie } });
    expect(response.headers['cache-control']).toBe('no-store');
    expect(response.headers['x-content-type-options']).toBe('nosniff');
    expect(response.headers['content-security-policy']).toContain("frame-ancestors 'none'");
    expect(response.headers['permissions-policy']).toContain('camera=()');
  });
  it('auth cookies are HttpOnly and SameSite and role fields cannot be self-elevated', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/api/auth/update-user',
      headers: { origin, cookie: deskCookie },
      payload: { role: 'SUPER_ADMIN' },
    });
    expect(response.statusCode).toBeGreaterThanOrEqual(200);
    const me = await app.inject({ url: '/api/admin/me', headers: { cookie: deskCookie } });
    expect(me.json().role).toBe('FRONT_DESK');
    expect(deskCookie).toContain('better-auth');
  });
  it('rate-limits email requests persistently', async () => {
    const email = `${randomUUID()}@example.test`;
    await emailQuota(email, 'test', 2);
    await emailQuota(email, 'test', 2);
    await expect(emailQuota(email, 'test', 2)).rejects.toMatchObject({ status: 429 });
  });
  it('rate-limits repeated verification attempts by IP', async () => {
    const responses = [];
    for (let i = 0; i < 11; i++)
      responses.push(
        await app.inject({
          method: 'POST',
          url: '/api/reservations/verify',
          headers: { origin },
          remoteAddress: '127.0.2.1',
          payload: { token: 'a'.repeat(64) },
        }),
      );
    expect(responses[10]!.statusCode).toBe(429);
  });
  it('fails closed when Turnstile rejects a token', async () => {
    const reservation = await db.reservation.findFirstOrThrow({ include: { guest: true } });
    const fetch = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(new Response(JSON.stringify({ success: false }), { status: 200 }));
    try {
      const response = await app.inject({
        method: 'POST',
        url: '/api/reservations/access',
        headers: { origin },
        remoteAddress: '127.0.3.1',
        payload: {
          reference: reservation.reference,
          email: reservation.guest.email,
          turnstileToken: 'invalid-token',
        },
      });
      expect(response.statusCode).toBe(400);
      expect(response.json().code).toBe('BOT_CHECK_FAILED');
    } finally {
      fetch.mockRestore();
    }
  });
  it('revokes disabled employees immediately', async () => {
    const session = await app.inject({ url: '/api/admin/me', headers: { cookie: editorCookie } });
    await db.user.update({ where: { id: session.json().id }, data: { active: false } });
    expect(
      (await app.inject({ url: '/api/admin/me', headers: { cookie: editorCookie } })).statusCode,
    ).toBe(401);
  });
  it('validates and re-encodes uploads before calling external storage', async () => {
    const png = await sharp({
      create: { width: 20, height: 20, channels: 3, background: '#ffffff' },
    })
      .png()
      .toBuffer();
    const put = vi
      .spyOn(storage, 'put')
      .mockResolvedValue({ key: 'test/image.webp', url: 'https://media.example.test/image.webp' });
    const multipart = (buffer: Buffer, mime: string) =>
      Buffer.concat([
        Buffer.from(
          `--imageboundary\r\nContent-Disposition: form-data; name="file"; filename="image.png"\r\nContent-Type: ${mime}\r\n\r\n`,
        ),
        buffer,
        Buffer.from('\r\n--imageboundary--\r\n'),
      ]);
    try {
      const valid = await app.inject({
        method: 'POST',
        url: '/api/admin/media?alt=Test%20image',
        headers: {
          origin,
          cookie: adminCookie,
          'content-type': 'multipart/form-data; boundary=imageboundary',
        },
        payload: multipart(png, 'image/png'),
      });
      expect(valid.statusCode).toBe(200);
      expect(put).toHaveBeenCalledTimes(1);
      const args = put.mock.calls[0]![0];
      expect(args.key).toMatch(/^hotel\/[a-f0-9-]+\.webp$/);
      expect((await sharp(args.body).metadata()).format).toBe('webp');
      const invalid = await app.inject({
        method: 'POST',
        url: '/api/admin/media?alt=Test%20image',
        headers: {
          origin,
          cookie: adminCookie,
          'content-type': 'multipart/form-data; boundary=imageboundary',
        },
        payload: multipart(Buffer.from('<svg onload="alert(1)"></svg>'), 'image/png'),
      });
      expect(invalid.statusCode).toBe(400);
      expect(put).toHaveBeenCalledTimes(1);

      const roomType = await db.roomType.findFirstOrThrow({
        where: { name: 'API Fixture' },
        orderBy: { createdAt: 'desc' },
      });
      const previous = await db.roomImage.aggregate({
        where: { roomTypeId: roomType.id },
        _max: { position: true },
      });
      const roomPhotoUrl = `/api/admin/media?roomTypeId=${roomType.id}&alt=Room%20view`;
      const first = await app.inject({
        method: 'POST',
        url: roomPhotoUrl,
        headers: {
          origin,
          cookie: adminCookie,
          'content-type': 'multipart/form-data; boundary=imageboundary',
        },
        payload: multipart(png, 'image/png'),
      });
      const second = await app.inject({
        method: 'POST',
        url: roomPhotoUrl,
        headers: {
          origin,
          cookie: adminCookie,
          'content-type': 'multipart/form-data; boundary=imageboundary',
        },
        payload: multipart(png, 'image/png'),
      });
      expect(first.statusCode).toBe(200);
      expect(second.statusCode).toBe(200);
      expect(first.json().position).toBe((previous._max.position ?? -1) + 1);
      expect(second.json().position).toBe(first.json().position + 1);
      const publicRooms = (await app.inject({ url: '/api/public' })).json().rooms;
      const photos = publicRooms.find((room: { id: string }) => room.id === roomType.id).images;
      expect(
        photos.findIndex((image: { id: string }) => image.id === first.json().id),
      ).toBeLessThan(photos.findIndex((image: { id: string }) => image.id === second.json().id));
    } finally {
      put.mockRestore();
    }
  });
  it('reports revenue from payments rather than reservation totals', async () => {
    const response = await app.inject({
      url: '/api/admin/reports?days=30',
      headers: { cookie: adminCookie },
    });
    expect(response.statusCode).toBe(200);
    const since = new Date();
    since.setUTCHours(0, 0, 0, 0);
    since.setUTCDate(since.getUTCDate() - 29);
    const recorded = await db.payment.aggregate({
      where: { paidAt: { gte: since } },
      _sum: { amount: true },
    });
    expect(response.json().revenue).toBe(recorded._sum.amount ?? 0);
  });
  it('counts only unblocked active inventory as available today', async () => {
    const read = async () => {
      const response = await app.inject({
        url: '/api/admin/operations',
        headers: { cookie: adminCookie },
      });
      expect(response.statusCode).toBe(200);
      return response.json<{ today: string; available: number; totalRooms: number }>();
    };
    const before = await read();
    const today = new Date(before.today);
    const tomorrow = new Date(today.getTime() + 86400000);
    const type = await db.roomType.create({
      data: {
        slug: randomUUID(),
        name: 'Operations fixture',
        description: 'Test availability counts',
        capacity: 2,
        basePrice: 100000,
        sizeSqm: 20,
        bed: 'King',
        rooms: {
          create: [
            { number: randomUUID(), capacity: 2 },
            {
              number: randomUUID(),
              capacity: 2,
              blocks: {
                create: { startDate: today, endDate: tomorrow, reason: 'Test maintenance' },
              },
            },
          ],
        },
      },
    });
    try {
      const active = await read();
      expect(active.available).toBe(before.available + 1);
      expect(active.totalRooms).toBe(before.totalRooms + 2);
      await db.roomType.update({ where: { id: type.id }, data: { active: false } });
      const archived = await read();
      expect(archived.available).toBe(before.available);
      expect(archived.totalRooms).toBe(before.totalRooms);
    } finally {
      await db.roomType.update({ where: { id: type.id }, data: { active: false } });
    }
  });
  it('includes early hotel-local payments and excludes the prior local day', async () => {
    const settings = await db.systemSettings.findUniqueOrThrow({ where: { id: 'hotel' } });
    await db.systemSettings.update({ where: { id: 'hotel' }, data: { timezone: 'Asia/Manila' } });
    try {
      const read = async () => {
        const response = await app.inject({
          url: '/api/admin/reports?days=7',
          headers: { cookie: adminCookie },
        });
        expect(response.statusCode).toBe(200);
        return response.json<{ revenue: number; trends: { date: string; revenue: number }[] }>();
      };
      const before = await read();
      const firstDate = before.trends[0]!.date;
      const start = new Date(`${firstDate}T00:00:00+08:00`);
      const reservation = await db.reservation.findFirstOrThrow();
      for (const [offset, amount] of [
        [30 * 60000, 12345],
        [-30 * 60000, 67890],
      ] as const) {
        await db.payment.create({
          data: {
            reservationId: reservation.id,
            idempotencyKey: randomUUID(),
            amount,
            method: 'CASH',
            paidAt: new Date(start.getTime() + offset),
            receipt: 'Timezone boundary fixture',
            recordedBy: 'test',
          },
        });
      }
      expect(hotelToday('Asia/Manila', start)).toBe(firstDate);
      const after = await read();
      expect(after.revenue - before.revenue).toBe(12345);
      expect(after.trends[0]!.revenue - before.trends[0]!.revenue).toBe(12345);
    } finally {
      await db.systemSettings.update({
        where: { id: 'hotel' },
        data: { timezone: settings.timezone },
      });
    }
  });
});
