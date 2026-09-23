import { randomBytes, randomUUID } from 'node:crypto';
import { mkdirSync, writeFileSync, unlinkSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { PrismaClient } from '@prisma/client';
import { hashPassword } from 'better-auth/crypto';

const email = process.env.BOOTSTRAP_ADMIN_EMAIL?.trim().toLowerCase();
if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))
  throw new Error('Set BOOTSTRAP_ADMIN_EMAIL to an email address you control');
const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) throw new Error('Set DATABASE_URL for the intended database');
const target = new URL(databaseUrl);
if (!['localhost', '127.0.0.1', '[::1]'].includes(target.hostname)) {
  if (
    !target.hostname.endsWith('.pooler.supabase.com') ||
    target.searchParams.get('sslmode') !== 'require'
  )
    throw new Error('Remote bootstrap requires a Supabase Session pooler URL with sslmode=require');
}
const credentialFile = resolve(
  process.env.BOOTSTRAP_CREDENTIAL_FILE ?? '.local/admin-credentials.txt',
);
const password = randomBytes(24).toString('base64url');
const passwordHash = await hashPassword(password);
const db = new PrismaClient();
let credentialWritten = false;
try {
  if (await db.user.count({ where: { role: 'SUPER_ADMIN' } }))
    throw new Error('A super administrator already exists; bootstrap will not alter it');
  if (await db.user.count({ where: { email } }))
    throw new Error('This email already belongs to a staff account');
  mkdirSync(dirname(credentialFile), { recursive: true });
  writeFileSync(
    credentialFile,
    `Hotel Del Sol initial administrator\nEmail: ${email}\nPassword: ${password}\n`,
    {
      flag: 'wx',
      mode: 0o600,
    },
  );
  credentialWritten = true;
  await db.$transaction(
    async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(877439102)`;
      if (await tx.user.count({ where: { role: 'SUPER_ADMIN' } }))
        throw new Error('A super administrator was created concurrently');
      await tx.systemSettings.upsert({
        where: { id: 'hotel' },
        create: { id: 'hotel' },
        update: {},
      });
      await tx.hotelContent.upsert({
        where: { id: 'hotel' },
        create: {
          id: 'hotel',
          about: 'Hotel details are being prepared for launch.',
          address: 'Address pending verification',
          email: 'reservations@example.invalid',
          phone: 'Contact number pending verification',
          amenities: [],
        },
        update: {},
      });
      const id = randomUUID();
      await tx.user.create({
        data: {
          id,
          name: 'Admin',
          email,
          emailVerified: true,
          role: 'SUPER_ADMIN',
          accounts: {
            create: {
              id: randomUUID(),
              accountId: id,
              providerId: 'credential',
              password: passwordHash,
            },
          },
        },
      });
      await tx.auditLog.create({
        data: {
          action: 'INITIAL_ADMIN_BOOTSTRAPPED',
          entityType: 'User',
          entityId: id,
          metadata: { role: 'SUPER_ADMIN' },
          source: 'BOOTSTRAP',
        },
      });
    },
    { maxWait: 10000, timeout: 30000 },
  );
  console.log(
    `Initial Admin account created. Credentials saved to ignored file: ${credentialFile}`,
  );
} catch (error) {
  if (credentialWritten) unlinkSync(credentialFile);
  console.error(error instanceof Error ? error.message : 'Admin bootstrap failed');
  process.exitCode = 1;
} finally {
  await db.$disconnect();
}
