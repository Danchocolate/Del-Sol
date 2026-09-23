import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { roomSchema, roomTypeSchema, dateSchema } from '@hotel/shared';
import { db, inventoryTransaction } from '../../lib/db.js';
import { staff } from '../auth/permissions.js';
import { audit } from '../audit/service.js';
import { assert } from '../../lib/errors.js';
import { roomInclude } from '../availability/service.js';
const idSchema = z.object({ id: z.string().uuid() });
export async function roomRoutes(app: FastifyInstance) {
  app.get('/api/admin/room-types', async (request) => {
    await staff(request, 'rooms:read');
    return db.roomType.findMany({
      include: { ...roomInclude, rooms: true },
      orderBy: { name: 'asc' },
    });
  });
  app.post('/api/admin/room-types', async (request) => {
    const user = await staff(request, 'rooms:write');
    const { amenities, ...input } = roomTypeSchema.parse(request.body);
    return inventoryTransaction(async (tx) => {
      const room = await tx.roomType.create({ data: input });
      for (const name of new Set(amenities)) {
        const amenity = await tx.amenity.upsert({ where: { name }, create: { name }, update: {} });
        await tx.roomAmenity.create({ data: { roomTypeId: room.id, amenityId: amenity.id } });
      }
      await audit(tx, user.id, 'ROOM_TYPE_CREATED', 'RoomType', room.id);
      return room;
    });
  });
  app.put('/api/admin/room-types/:id', async (request) => {
    const user = await staff(request, 'rooms:write');
    const { id } = idSchema.parse(request.params);
    const { amenities, ...input } = roomTypeSchema.parse(request.body);
    return inventoryTransaction(async (tx) => {
      const room = await tx.roomType.update({ where: { id }, data: input });
      await tx.roomAmenity.deleteMany({ where: { roomTypeId: id } });
      for (const name of new Set(amenities)) {
        const amenity = await tx.amenity.upsert({ where: { name }, create: { name }, update: {} });
        await tx.roomAmenity.create({ data: { roomTypeId: id, amenityId: amenity.id } });
      }
      await audit(tx, user.id, 'ROOM_TYPE_UPDATED', 'RoomType', id);
      return room;
    });
  });
  app.get('/api/admin/rooms', async (request) => {
    await staff(request, 'rooms:read');
    return db.room.findMany({
      include: { roomType: true, blocks: { where: { active: true } } },
      orderBy: { number: 'asc' },
    });
  });
  app.post('/api/admin/rooms', async (request) => {
    const user = await staff(request, 'rooms:write');
    const input = roomSchema.parse(request.body);
    return inventoryTransaction(async (tx) => {
      const room = await tx.room.create({ data: input });
      await audit(tx, user.id, 'ROOM_CREATED', 'Room', room.id);
      return room;
    });
  });
  app.put('/api/admin/rooms/:id', async (request) => {
    const user = await staff(request, 'rooms:write');
    const { id } = idSchema.parse(request.params);
    const input = roomSchema.parse(request.body);
    return inventoryTransaction(async (tx) => {
      const before = await tx.room.findUniqueOrThrow({ where: { id } });
      if (input.capacity < before.capacity || input.roomTypeId !== before.roomTypeId) {
        const allocations = await tx.reservationRoom.count({ where: { roomId: id, active: true } });
        assert(
          allocations === 0,
          409,
          'ROOM_IN_USE',
          'Capacity and room type cannot change while this room has active reservations.',
        );
      }
      const room = await tx.room.update({ where: { id }, data: input });
      await audit(tx, user.id, 'ROOM_UPDATED', 'Room', id, { active: input.active });
      return room;
    });
  });
  app.post('/api/admin/rooms/:id/blocks', async (request) => {
    const user = await staff(request, 'rooms:write');
    const { id } = idSchema.parse(request.params);
    const input = z
      .object({ startDate: dateSchema, endDate: dateSchema, reason: z.string().min(2).max(500) })
      .strict()
      .refine((v) => v.endDate > v.startDate)
      .parse(request.body);
    return inventoryTransaction(async (tx) => {
      const overlap = await tx.reservationRoom.count({
        where: {
          roomId: id,
          active: true,
          checkIn: { lt: new Date(input.endDate) },
          checkOut: { gt: new Date(input.startDate) },
        },
      });
      assert(overlap === 0, 409, 'ROOM_IN_USE', 'This block overlaps an active reservation.');
      const block = await tx.roomBlock.create({
        data: {
          roomId: id,
          ...input,
          startDate: new Date(input.startDate),
          endDate: new Date(input.endDate),
        },
      });
      await audit(tx, user.id, 'ROOM_BLOCKED', 'Room', id, { blockId: block.id });
      return block;
    });
  });
  app.delete('/api/admin/room-blocks/:id', async (request) => {
    const user = await staff(request, 'rooms:write');
    const { id } = idSchema.parse(request.params);
    return inventoryTransaction(async (tx) => {
      const block = await tx.roomBlock.update({ where: { id }, data: { active: false } });
      await audit(tx, user.id, 'ROOM_BLOCK_RELEASED', 'Room', block.roomId, { blockId: id });
      return { ok: true };
    });
  });
}
