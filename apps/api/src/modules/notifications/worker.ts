import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import { notificationProvider } from './provider.js';
import { db, inventoryTransaction } from '../../lib/db.js';
import { decrypt } from '../../lib/crypto.js';
import { config } from '../../config.js';
import { expireHolds } from '../reservations/service.js';
const payloadSchema = z.object({ to: z.email(), subject: z.string(), text: z.string() });
export async function runJobs() {
  await inventoryTransaction(expireHolds);
  const count = await deliverOutboxBatch();
  // Tokens, grants and quotas have no historical value after retention window.
  const retention = new Date(Date.now() - 7 * 86400000);
  await db.verificationToken.deleteMany({ where: { expiresAt: { lt: retention } } });
  await db.guestGrant.deleteMany({ where: { expiresAt: { lt: retention } } });
  await db.emailQuota.deleteMany({ where: { resetAt: { lt: retention } } });
  return count;
}
export async function deliverOutboxBatch() {
  const leaseId = randomUUID();
  const rows = await db.$queryRaw<
    { id: string; encryptedPayload: string; attempts: number; dedupeKey: string }[]
  >`UPDATE "OutboxJob" SET "lockedUntil"=now()+interval '60 seconds',"leaseId"=${leaseId},attempts=attempts+1 WHERE id IN (SELECT id FROM "OutboxJob" WHERE "completedAt" IS NULL AND "failedAt" IS NULL AND "availableAt"<=now() AND ("lockedUntil" IS NULL OR "lockedUntil"<now()) ORDER BY "createdAt" LIMIT 5 FOR UPDATE SKIP LOCKED) RETURNING id,"encryptedPayload",attempts,"dedupeKey"`;
  await Promise.all(
    rows.map(async (job) => {
      try {
        const payload = payloadSchema.parse(decrypt(job.encryptedPayload));
        await notificationProvider.send({ ...payload, idempotencyKey: job.id });
        // Development delivery remains encrypted in the outbox; a staff-only inbox decrypts on demand.
        await db.outboxJob.updateMany({
          where: { id: job.id, leaseId },
          data: {
            completedAt: new Date(),
            lockedUntil: null,
            leaseId: null,
            ...(config.EMAIL_PROVIDER === 'resend' ? { encryptedPayload: '' } : {}),
          },
        });
      } catch {
        await db.outboxJob.updateMany({
          where: { id: job.id, leaseId },
          data: {
            lockedUntil: null,
            leaseId: null,
            lastError: 'EMAIL_DELIVERY_FAILED',
            availableAt: new Date(Date.now() + Math.min(3600000, 2 ** job.attempts * 10000)),
            ...(job.attempts >= 8 ? { failedAt: new Date() } : {}),
          },
        });
        process.stderr.write(
          JSON.stringify({
            level: 'error',
            event: 'EMAIL_DELIVERY_FAILED',
            jobId: job.id,
            attempt: job.attempts,
          }) + '\n',
        );
      }
    }),
  );
  return rows.length;
}
