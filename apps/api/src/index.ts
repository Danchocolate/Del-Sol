import * as Sentry from '@sentry/node';
import { config } from './config.js';
import { buildApp } from './create-app.js';
import { db } from './lib/db.js';
if (config.SENTRY_DSN)
  Sentry.init({
    dsn: config.SENTRY_DSN,
    sendDefaultPii: false,
    beforeSend: (event) => ({
      type: event.type,
      event_id: event.event_id,
      timestamp: event.timestamp,
      level: event.level,
      message: event.message,
      tags: event.tags,
    }),
  });
const app = await buildApp();
await app.listen({ port: config.PORT, host: process.env.VERCEL ? '0.0.0.0' : '127.0.0.1' });
const shutdown = async () => {
  await app.close();
  await db.$disconnect();
};
process.on('SIGTERM', () => {
  void shutdown();
});
process.on('SIGINT', () => {
  void shutdown();
});
