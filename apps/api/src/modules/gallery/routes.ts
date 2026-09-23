import { randomUUID } from 'node:crypto';
import type { FastifyInstance } from 'fastify';
import sharp from 'sharp';
import { z } from 'zod';
import { contentSchema } from '@hotel/shared';
import { db, inventoryTransaction } from '../../lib/db.js';
import { assert, AppError } from '../../lib/errors.js';
import { staff } from '../auth/permissions.js';
import { audit } from '../audit/service.js';
import { storage } from './storage.js';
export async function galleryRoutes(app: FastifyInstance) {
  app.get('/api/admin/content', async (request) => {
    await staff(request, 'content:write');
    return db.hotelContent.findUniqueOrThrow({ where: { id: 'hotel' } });
  });
  app.put('/api/admin/content', async (request) => {
    const user = await staff(request, 'content:write');
    const input = contentSchema.parse(request.body);
    return inventoryTransaction(async (tx) => {
      const content = await tx.hotelContent.update({ where: { id: 'hotel' }, data: input });
      await audit(tx, user.id, 'CONTENT_UPDATED', 'HotelContent', 'hotel');
      return content;
    });
  });
  app.get('/api/admin/gallery', async (request) => {
    await staff(request, 'content:write');
    return db.galleryItem.findMany({ orderBy: { position: 'asc' } });
  });
  app.post('/api/admin/media', async (request) => {
    const query = z
      .object({
        roomTypeId: z.string().uuid().optional(),
        alt: z.string().min(2).max(200),
        caption: z.string().max(500).default(''),
      })
      .strict()
      .parse(request.query);
    const user = await staff(request, query.roomTypeId ? 'rooms:write' : 'content:write');
    if (query.roomTypeId) await db.roomType.findUniqueOrThrow({ where: { id: query.roomTypeId } });
    const file = await request.file({ limits: { fileSize: 8 * 1024 * 1024, files: 1, fields: 0 } });
    assert(file, 400, 'IMAGE_REQUIRED', 'Choose an image to upload.');
    assert(
      ['image/jpeg', 'image/png', 'image/webp'].includes(file.mimetype),
      400,
      'INVALID_IMAGE',
      'Only JPEG, PNG and WebP are supported.',
    );
    const buffer = await file.toBuffer();
    assert(!file.file.truncated, 413, 'IMAGE_TOO_LARGE', 'Maximum image size is 8 MB.');
    const signature = buffer.subarray(0, 12);
    const jpeg = signature[0] === 255 && signature[1] === 216 && signature[2] === 255;
    const png = signature.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]));
    const webp =
      signature.subarray(0, 4).toString() === 'RIFF' &&
      signature.subarray(8, 12).toString() === 'WEBP';
    assert(jpeg || png || webp, 400, 'INVALID_IMAGE', 'The image signature is not supported.');
    let clean: Buffer;
    try {
      clean = await sharp(buffer, { limitInputPixels: 40000000, animated: false })
        .rotate()
        .resize({ width: 2400, height: 2400, fit: 'inside', withoutEnlargement: true })
        .webp({ quality: 85 })
        .toBuffer();
    } catch {
      throw new AppError(
        400,
        'INVALID_IMAGE',
        'The image could not be decoded. Choose a valid JPEG, PNG or WebP.',
      );
    }
    const object = await storage.put({
      key: `hotel/${randomUUID()}.webp`,
      body: clean,
      contentType: 'image/webp',
    });
    return inventoryTransaction(async (tx) => {
      const item = query.roomTypeId
        ? await tx.roomImage.create({
            data: {
              roomTypeId: query.roomTypeId,
              objectKey: object.key,
              url: object.url,
              alt: query.alt,
            },
          })
        : await tx.galleryItem.create({
            data: {
              objectKey: object.key,
              url: object.url,
              alt: query.alt,
              caption: query.caption,
            },
          });
      await audit(
        tx,
        user.id,
        'IMAGE_UPLOADED',
        query.roomTypeId ? 'RoomImage' : 'GalleryItem',
        item.id,
      );
      return item;
    });
  });
  app.put('/api/admin/media/:kind/:id', async (request) => {
    const { kind, id } = z
      .object({ kind: z.enum(['room', 'gallery']), id: z.string().uuid() })
      .parse(request.params);
    const user = await staff(request, kind === 'room' ? 'rooms:write' : 'content:write');
    const input = z
      .object({
        alt: z.string().min(2).max(200),
        caption: z.string().max(500).optional(),
        position: z.number().int().min(0).max(10000),
        archived: z.boolean(),
      })
      .strict()
      .parse(request.body);
    return inventoryTransaction(async (tx) => {
      const item =
        kind === 'room'
          ? await tx.roomImage.update({
              where: { id },
              data: { alt: input.alt, position: input.position, archived: input.archived },
            })
          : await tx.galleryItem.update({ where: { id }, data: input });
      await audit(tx, user.id, 'IMAGE_UPDATED', kind === 'room' ? 'RoomImage' : 'GalleryItem', id);
      return item;
    });
  });
}
