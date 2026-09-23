import { PrismaClient, Prisma } from '@prisma/client';
export const db = new PrismaClient();
export type Tx = Prisma.TransactionClient;
export async function inventoryTransaction<T>(fn: (tx: Tx) => Promise<T>): Promise<T> {
  return db.$transaction(
    async (tx) => {
      // Single property serialization, with constraint-level defense in depth.
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(73194201)`;
      return fn(tx);
    },
    { timeout: 15000, maxWait: 15000 },
  );
}
