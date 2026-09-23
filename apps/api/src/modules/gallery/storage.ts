import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';
import type { StorageProvider } from '../integrations/providers.js';
import { config } from '../../config.js';
import { AppError } from '../../lib/errors.js';
export const storage: StorageProvider = {
  async put({ key, body, contentType }) {
    if (
      !config.STORAGE_ENDPOINT ||
      !config.STORAGE_BUCKET ||
      !config.STORAGE_ACCESS_KEY_ID ||
      !config.STORAGE_SECRET_ACCESS_KEY ||
      !config.STORAGE_PUBLIC_URL
    )
      throw new AppError(
        503,
        'STORAGE_UNCONFIGURED',
        'Object storage must be configured before uploading images.',
      );
    const client = new S3Client({
      endpoint: config.STORAGE_ENDPOINT,
      region: config.STORAGE_REGION,
      credentials: {
        accessKeyId: config.STORAGE_ACCESS_KEY_ID,
        secretAccessKey: config.STORAGE_SECRET_ACCESS_KEY,
      },
    });
    await client.send(
      new PutObjectCommand({
        Bucket: config.STORAGE_BUCKET,
        Key: key,
        Body: body,
        ContentType: contentType,
        CacheControl: 'public,max-age=31536000,immutable',
      }),
      { abortSignal: AbortSignal.timeout(15000) },
    );
    return { key, url: `${config.STORAGE_PUBLIC_URL.replace(/\/$/, '')}/${key}` };
  },
};
