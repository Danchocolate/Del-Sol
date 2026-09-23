import type { Prisma } from '@prisma/client';
import type { Tx } from '../../lib/db.js';
export const audit = (
  tx: Tx,
  actorId: string | null,
  action: string,
  entityType: string,
  entityId: string,
  metadata: Prisma.InputJsonObject = {},
) => tx.auditLog.create({ data: { actorId, action, entityType, entityId, metadata } });
