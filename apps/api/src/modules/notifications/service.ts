import type { Tx } from '../../lib/db.js';
import { encrypt } from '../../lib/crypto.js';
import { config } from '../../config.js';
export async function queueEmail(
  tx: Tx,
  input: { to: string; reference: string; kind: string; token?: string; dedupeKey: string },
) {
  const subject: Record<string, string> = {
    VERIFY: 'Verify your reservation email',
    LOOKUP: 'Access your reservation',
    RECEIVED: 'Your reservation request was received',
    CONFIRMED: 'Your reservation is confirmed',
    CANCELLED: 'Your reservation was cancelled',
    EXPIRED: 'Your reservation hold expired',
    STATUS: 'Your reservation status changed',
  };
  const link = input.token ? `${config.APP_ORIGIN}/reservation/access#token=${input.token}` : null;
  const text = `Hotel Del Sol\n\n${subject[input.kind] ?? subject.STATUS}\nReference: ${input.reference}\n\n${link ? `Open this secure link to continue: ${link}\nThis single-use link expires. If you did not request it, ignore this email.` : 'Visit the website and use Your reservation to securely view the current details.'}\n\nPayments are collected directly by the hotel. We will never ask for card details through this application.`;
  await tx.outboxJob.create({
    data: {
      kind: 'EMAIL',
      dedupeKey: input.dedupeKey,
      encryptedPayload: encrypt({
        to: input.to,
        subject: `Hotel Del Sol — ${subject[input.kind] ?? subject.STATUS}`,
        text,
      }),
    },
  });
}
