import type { NotificationProvider } from '../integrations/providers.js';
import { config } from '../../config.js';

/** Resend HTTP adapter uses a bounded request; credentials never enter outbox payloads. */
export const notificationProvider: NotificationProvider = {
  async send(input) {
    if (config.EMAIL_PROVIDER === 'development') return;
    const response = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${config.RESEND_API_KEY}`,
        'Content-Type': 'application/json',
        'Idempotency-Key': input.idempotencyKey,
      },
      body: JSON.stringify({
        from: config.EMAIL_FROM,
        to: input.to,
        subject: input.subject,
        text: input.text,
      }),
      signal: AbortSignal.timeout(15000),
    });
    if (!response.ok) throw new Error('EMAIL_DELIVERY_FAILED');
  },
};
