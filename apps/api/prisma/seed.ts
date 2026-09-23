import { PrismaClient } from '@prisma/client';
import { randomUUID } from 'node:crypto';
import { hashPassword } from 'better-auth/crypto';
if (process.env.NODE_ENV === 'production')
  throw new Error('Development seed is forbidden in production');
const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl || !['localhost', '127.0.0.1', '[::1]'].includes(new URL(databaseUrl).hostname))
  throw new Error('Development seed is restricted to a localhost database');
const db = new PrismaClient();
const email = process.env.SEED_ADMIN_EMAIL;
const password = process.env.SEED_ADMIN_PASSWORD;
if (!email || !password || password.length < 12 || password.startsWith('REPLACE'))
  throw new Error('Configure seed admin credentials in .env');
await db.systemSettings.upsert({ where: { id: 'hotel' }, create: { id: 'hotel' }, update: {} });
await db.hotelContent.upsert({
  where: { id: 'hotel' },
  create: {
    id: 'hotel',
    about:
      'From sunlit courtyards to quiet corners, Hotel Del Sol is a place to reconnect with what matters, and with yourself. Settle in, slow down, and make room for a different pace.',
    address: 'Property address to be confirmed',
    email: 'reservations@example.com',
    phone: 'Contact number to be confirmed',
    amenities: [
      'Courtyard pool',
      'Thoughtful spaces',
      'Garden surroundings',
      'Wi-Fi throughout',
      'Personal hospitality',
    ],
  },
  update: {},
});
const types = [
  {
    slug: 'deluxe-king',
    name: 'Deluxe King',
    description:
      'A light-filled retreat with natural textures, a generous king bed, and space to make yourself at home. Open the curtains and let the day arrive at your pace.',
    capacity: 2,
    basePrice: 450000,
    sizeSqm: 32,
    bed: '1 king bed',
    image: '/images/deluxe.webp',
    numbers: ['101', '102', '103', '104'],
  },
  {
    slug: 'garden-suite',
    name: 'Garden Suite',
    description:
      'A spacious suite with a separate sitting area, warm finishes, and a quieter outlook. A little more room for longer stays and slower mornings.',
    capacity: 3,
    basePrice: 680000,
    sizeSqm: 52,
    bed: '1 king bed + daybed',
    image: '/images/suite.webp',
    numbers: ['201', '202'],
  },
  {
    slug: 'family-retreat',
    name: 'Family Retreat',
    description:
      'Comfortable shared space for time together, with two queen beds and considered details for everyone in your party.',
    capacity: 4,
    basePrice: 820000,
    sizeSqm: 58,
    bed: '2 queen beds',
    image: '/images/deluxe.webp',
    numbers: ['301', '302'],
  },
];
for (const item of types) {
  const { image, numbers, ...data } = item;
  const type = await db.roomType.upsert({ where: { slug: data.slug }, create: data, update: {} });
  for (const number of numbers)
    await db.room.upsert({
      where: { number },
      create: { number, roomTypeId: type.id, capacity: type.capacity },
      update: {},
    });
  if (!(await db.roomImage.count({ where: { roomTypeId: type.id } })))
    await db.roomImage.create({
      data: {
        roomTypeId: type.id,
        objectKey: `seed/${data.slug}`,
        url: image,
        alt: `Illustrative ${data.name} interior`,
        position: 0,
      },
    });
  for (const name of ['Air conditioning', 'Wi-Fi', 'Private bathroom', 'Fresh linens']) {
    const amenity = await db.amenity.upsert({ where: { name }, create: { name }, update: {} });
    await db.roomAmenity.upsert({
      where: { roomTypeId_amenityId: { roomTypeId: type.id, amenityId: amenity.id } },
      create: { roomTypeId: type.id, amenityId: amenity.id },
      update: {},
    });
  }
}
if (!(await db.galleryItem.count()))
  await db.galleryItem.createMany({
    data: [
      {
        url: '/images/courtyard.webp',
        objectKey: 'seed/courtyard',
        alt: 'Illustrative sunlit courtyard pool',
        caption: 'A slower kind of afternoon',
        position: 0,
      },
      {
        url: '/images/deluxe.webp',
        objectKey: 'seed/deluxe',
        alt: 'Illustrative warm and inviting king room',
        caption: 'Space to settle in',
        position: 1,
      },
      {
        url: '/images/suite.webp',
        objectKey: 'seed/suite',
        alt: 'Illustrative suite lounge',
        caption: 'Your own quiet corner',
        position: 2,
      },
    ],
  });
await db.promotion.upsert({
  where: { code: 'SLOWDAYS' },
  create: {
    code: 'SLOWDAYS',
    name: 'Stay a little longer',
    kind: 'PERCENTAGE',
    value: 10,
    startsAt: new Date('2026-01-01'),
    endsAt: new Date('2030-12-31'),
    minNights: 3,
    usageLimit: 100,
    perEmailLimit: 1,
    allRooms: true,
  },
  update: {},
});
if (!(await db.user.findUnique({ where: { email } }))) {
  const id = randomUUID();
  await db.user.create({
    data: {
      id,
      name: 'Hotel Administrator',
      email,
      emailVerified: true,
      role: 'SUPER_ADMIN',
      accounts: {
        create: {
          id: randomUUID(),
          accountId: id,
          providerId: 'credential',
          password: await hashPassword(password),
        },
      },
    },
  });
}
console.log(
  'Development seed complete. Admin credentials are read from your ignored .env. No bookings or payments are fabricated.',
);
await db.$disconnect();
