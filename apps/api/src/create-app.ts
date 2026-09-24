import Fastify, { LogController } from 'fastify';
import cors from '@fastify/cors';
import cookie from '@fastify/cookie';
import helmet from '@fastify/helmet';
import rateLimit from '@fastify/rate-limit';
import multipart from '@fastify/multipart';
import { fromNodeHeaders } from 'better-auth/node';
import { z, ZodError } from 'zod';
import { Prisma } from '@prisma/client';
import * as Sentry from '@sentry/node';
import { createHash, timingSafeEqual } from 'node:crypto';
import { config } from './config.js';
import { db } from './lib/db.js';
import { AppError, assert } from './lib/errors.js';
import { auth } from './modules/auth/auth.js';
import { roomInclude } from './modules/availability/service.js';
import { roomRoutes } from './modules/rooms/routes.js';
import { reservationRoutes } from './modules/reservations/routes.js';
import { paymentRoutes } from './modules/payments/routes.js';
import { promotionRoutes } from './modules/promotions/routes.js';
import { galleryRoutes } from './modules/gallery/routes.js';
import { userRoutes } from './modules/users/routes.js';
import { reportRoutes } from './modules/reports/routes.js';
import { runJobs } from './modules/notifications/worker.js';
export async function buildApp() {
  const app = Fastify({
    bodyLimit: 32768,
    trustProxy: false,
    logController: new LogController({ disableRequestLogging: true }),
    logger:
      config.NODE_ENV === 'test'
        ? false
        : {
            level: 'info',
            redact: [
              'req.headers.cookie',
              'req.headers.authorization',
              'req.body',
              'res.headers["set-cookie"]',
            ],
          },
  });
  await app.register(cookie);
  await app.register(cors, {
    origin: config.APP_ORIGIN,
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  });
  await app.register(helmet, {
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: ["'self'", 'https://challenges.cloudflare.com'],
        frameSrc: ['https://challenges.cloudflare.com'],
        frameAncestors: ["'none'"],
        styleSrc: ["'self'"],
        imgSrc: [
          "'self'",
          'data:',
          ...(config.STORAGE_PUBLIC_URL ? [new URL(config.STORAGE_PUBLIC_URL).origin] : []),
        ],
        connectSrc: ["'self'", 'https://challenges.cloudflare.com'],
        objectSrc: ["'none'"],
        baseUri: ["'self'"],
        formAction: ["'self'"],
      },
    },
    referrerPolicy: { policy: 'no-referrer' },
  });
  await app.register(rateLimit, { max: 100, timeWindow: '1 minute' });
  await app.register(multipart, { limits: { files: 1, fileSize: 8 * 1024 * 1024, fields: 0 } });
  app.addHook('onRequest', async (request, reply) => {
    reply.header('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
    if (
      request.url.startsWith('/api/admin') ||
      request.url.startsWith('/api/reservations') ||
      request.url.startsWith('/api/auth')
    )
      reply.header('Cache-Control', 'no-store');
    if (!['GET', 'HEAD', 'OPTIONS'].includes(request.method)) {
      if (request.url !== '/api/internal/jobs')
        assert(
          request.headers.origin === config.APP_ORIGIN,
          403,
          'INVALID_ORIGIN',
          'Request origin is not permitted.',
        );
      assert(
        request.headers['content-type']?.startsWith('application/json') ||
          request.headers['content-type']?.startsWith('multipart/form-data'),
        415,
        'UNSUPPORTED_MEDIA',
        'Use JSON or an image upload.',
      );
    }
  });
  app.addHook('onResponse', async (request, reply) => {
    if (reply.statusCode >= 400)
      app.log.warn({
        event:
          reply.statusCode === 403
            ? 'PERMISSION_FAILURE'
            : request.url.startsWith('/api/auth')
              ? 'AUTH_FAILURE'
              : 'REQUEST_FAILURE',
        status: reply.statusCode,
        requestId: request.id,
        route: request.routeOptions.url,
      });
  });
  app.setErrorHandler((error, request, reply) => {
    if (error instanceof ZodError)
      return reply.code(400).send({
        code: 'INVALID_INPUT',
        message: 'Check the submitted fields.',
        issues: error.issues.map((i) => ({ path: i.path.join('.'), message: i.message })),
      });
    if (error instanceof AppError)
      return reply.code(error.status).send({ code: error.code, message: error.message });
    if (error instanceof Prisma.PrismaClientKnownRequestError) {
      if (error.code === 'P2025')
        return reply.code(404).send({ code: 'NOT_FOUND', message: 'Record not found.' });
      if (['P2002', 'P2004', 'P2034'].includes(error.code))
        return reply.code(409).send({
          code: 'CONFLICT',
          message: 'This change conflicts with existing records. Refresh and try again.',
        });
    }
    const status =
      typeof error === 'object' &&
      error !== null &&
      'statusCode' in error &&
      typeof error.statusCode === 'number'
        ? error.statusCode
        : 500;
    if (status < 500)
      return reply.code(status).send({
        code: 'REQUEST_REJECTED',
        message:
          status === 429
            ? 'Too many requests. Please try again later.'
            : 'Request could not be processed.',
      });
    app.log.error({
      event: 'UNEXPECTED_SERVER_ERROR',
      requestId: request.id,
      errorType: error instanceof Error ? error.name : 'Unknown',
    });
    if (config.SENTRY_DSN)
      Sentry.captureMessage('Unexpected API error', {
        level: 'error',
        tags: { requestId: request.id, route: request.routeOptions.url },
      });
    return reply.code(500).send({
      code: 'INTERNAL_ERROR',
      message: 'Something went wrong. Please try again.',
      requestId: request.id,
    });
  });
  app.route({
    method: ['GET', 'POST'],
    url: '/api/auth/*',
    handler: async (request, reply) => {
      const response = await auth.handler(
        new Request(new URL(request.url, config.APP_ORIGIN), {
          method: request.method,
          headers: fromNodeHeaders(request.headers),
          ...(request.body ? { body: JSON.stringify(request.body) } : {}),
        }),
      );
      reply.code(response.status);
      response.headers.forEach((value, key) => {
        if (key !== 'set-cookie') reply.header(key, value);
      });
      const cookies = response.headers.getSetCookie();
      if (cookies.length) reply.header('set-cookie', cookies);
      return reply.send(await response.text());
    },
  });
  app.get('/api/ping', async () => ({ status: 'ok' }));
  app.get('/api/health', async () => {
    await db.$queryRaw`SELECT 1`;
    return { status: 'ok' };
  });
  app.post('/api/internal/jobs', { bodyLimit: 32 }, async (request, reply) => {
    assert(config.JOBS_SECRET, 503, 'JOBS_NOT_CONFIGURED', 'Jobs are not configured.');
    const provided = request.headers.authorization ?? '';
    const digest = (value: string) => createHash('sha256').update(value).digest();
    assert(
      provided.length <= 256 &&
        timingSafeEqual(digest(provided), digest(`Bearer ${config.JOBS_SECRET}`)),
      401,
      'UNAUTHORIZED',
      'Authentication required.',
    );
    z.object({}).strict().parse(request.body);
    reply.header('Cache-Control', 'no-store');
    return { processed: await runJobs() };
  });
  app.get('/api/public', async (_request, reply) => {
    reply.header('Cache-Control', 'public, max-age=0, must-revalidate');
    reply.header('Vercel-CDN-Cache-Control', 'public, s-maxage=30, stale-while-revalidate=120');
    const [content, rooms, gallery, promotions, settings] = await Promise.all([
      db.hotelContent.findUniqueOrThrow({ where: { id: 'hotel' } }),
      db.roomType.findMany({
        where: { active: true },
        include: roomInclude,
        orderBy: { basePrice: 'asc' },
      }),
      db.galleryItem.findMany({ where: { archived: false }, orderBy: { position: 'asc' } }),
      db.promotion.findMany({
        where: { active: true, startsAt: { lte: new Date() }, endsAt: { gte: new Date() } },
        select: { code: true, name: true, kind: true, value: true, minNights: true, endsAt: true },
      }),
      db.systemSettings.findUniqueOrThrow({
        where: { id: 'hotel' },
        select: {
          mobileRequired: true,
          maxRooms: true,
          maxStayNights: true,
          cancellationCutoffHours: true,
          timezone: true,
        },
      }),
    ]);
    return { content, rooms, gallery, promotions, settings };
  });
  await app.register(roomRoutes);
  await app.register(reservationRoutes);
  await app.register(paymentRoutes);
  await app.register(promotionRoutes);
  await app.register(galleryRoutes);
  await app.register(userRoutes);
  await app.register(reportRoutes);
  return app;
}
