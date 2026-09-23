import { randomBytes, createHash, createCipheriv, createDecipheriv } from 'node:crypto';
import { config } from '../config.js';
export const randomToken = () => randomBytes(32).toString('hex');
export const hash = (value: string) => createHash('sha256').update(value).digest('hex');
export const reference = () => `HDS-${randomBytes(8).toString('hex').toUpperCase()}`;
export function encrypt(value: unknown) {
  const iv = randomBytes(12);
  const cipher = createCipheriv(
    'aes-256-gcm',
    Buffer.from(config.OUTBOX_ENCRYPTION_KEY, 'hex'),
    iv,
  );
  const data = Buffer.concat([cipher.update(JSON.stringify(value), 'utf8'), cipher.final()]);
  return [iv, cipher.getAuthTag(), data].map((b) => b.toString('base64')).join('.');
}
export function decrypt(value: string): unknown {
  const [iv, tag, data] = value.split('.').map((b) => Buffer.from(b, 'base64'));
  if (!iv || !tag || !data) throw new Error('Invalid encrypted payload');
  const decipher = createDecipheriv(
    'aes-256-gcm',
    Buffer.from(config.OUTBOX_ENCRYPTION_KEY, 'hex'),
    iv,
  );
  decipher.setAuthTag(tag);
  return JSON.parse(
    Buffer.concat([decipher.update(data), decipher.final()]).toString('utf8'),
  ) as unknown;
}
