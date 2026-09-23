import { test, expect, type Page } from '@playwright/test';
import { PrismaClient } from '@prisma/client';
import { createDecipheriv, randomUUID } from 'node:crypto';
import { mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
const qaDirectory = join(tmpdir(), 'hotel-del-sol-qa');
const db = new PrismaClient({ datasources: { db: { url: process.env.E2E_DATABASE_URL } } });
const date = (offset: number) =>
  new Date(Date.now() + offset * 86400000).toISOString().slice(0, 10);
// Only the client widget is replaced. The real API validates the official Cloudflare
// test token against Siteverify; production rejects test keys at startup.
async function testWidget(page: Page) {
  await page.route(
    'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit',
    (route) =>
      route.fulfill({
        contentType: 'application/javascript',
        body: 'window.turnstile={render:(el,o)=>{el.textContent="Development security check";setTimeout(()=>o.callback("XXXX.DUMMY.TOKEN.XXXX"),50);return "test-widget"},remove:()=>{}};',
      }),
  );
}
async function login(page: Page) {
  await page.goto('/admin');
  await page.getByLabel('Work email').fill(process.env.SEED_ADMIN_EMAIL!);
  await page.getByLabel('Password', { exact: true }).fill(process.env.SEED_ADMIN_PASSWORD!);
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Today at Del Sol' })).toBeVisible();
}
async function verificationUrl(reference: string) {
  const jobs = await db.outboxJob.findMany({ orderBy: { createdAt: 'desc' }, take: 500 });
  for (const job of jobs) {
    if (!job.encryptedPayload) continue;
    const [iv, tag, payload] = job.encryptedPayload.split('.').map((v) => Buffer.from(v, 'base64'));
    const decipher = createDecipheriv(
      'aes-256-gcm',
      Buffer.from(process.env.OUTBOX_ENCRYPTION_KEY!, 'hex'),
      iv!,
    );
    decipher.setAuthTag(tag!);
    const mail = JSON.parse(
      Buffer.concat([decipher.update(payload!), decipher.final()]).toString(),
    ) as { text: string };
    if (mail.text.includes(reference)) {
      const link = mail.text.match(
        /http:\/\/127\.0\.0\.1:5174\/reservation\/access#token=[a-f0-9]+/,
      )?.[0];
      if (link) return link;
    }
  }
  throw new Error('Expected test verification email not found');
}
test.afterAll(async () => db.$disconnect());
test('guest homepage → dates → available room → reservation → verification → lookup → cancellation', async ({
  page,
}) => {
  await testWidget(page);
  await page.goto('/');
  await expect(page).toHaveTitle(/Hotel Del Sol/);
  await page.getByLabel('Check-in', { exact: true }).fill(date(20));
  await page.getByLabel('Check-out', { exact: true }).fill(date(22));
  await page.getByRole('button', { name: 'Find a room', exact: true }).click();
  const room = page
    .locator('article')
    .filter({ has: page.getByRole('heading', { name: 'Deluxe King', exact: true }) });
  await room.getByRole('button', { name: 'Choose room' }).click();
  await page.getByLabel('Full name', { exact: true }).fill('E2E Guest');
  const email = `guest-${randomUUID()}@example.test`;
  await page.getByLabel('Email address').fill(email);
  await page.getByLabel('Mobile number', { exact: true }).fill('+639171234567');
  await page.getByRole('checkbox').check();
  await page.getByRole('button', { name: 'Request reservation' }).click();
  await expect(page.getByRole('heading', { name: 'Check your inbox.' })).toBeVisible({
    timeout: 15000,
  });
  const reference = new URL(page.url()).searchParams.get('reference')!;
  await page.goto(await verificationUrl(reference));
  await page.getByRole('button', { name: 'Continue to my reservation' }).click();
  await expect(page.getByText('pending confirmation', { exact: true }).first()).toBeVisible();
  await page.context().clearCookies();
  await page.goto(`/reservation?reference=${reference}`);
  await page.getByLabel('Reservation email').fill(email);
  await page.getByRole('button', { name: 'Email me a secure link' }).click();
  await expect(page.getByRole('status')).toContainText('If the details match', { timeout: 15000 });
  await page.goto(await verificationUrl(reference));
  await page.getByRole('button', { name: 'Continue to my reservation' }).click();
  await expect(page.getByRole('heading', { name: 'Your stay at Del Sol.' })).toBeVisible();
  await page.getByRole('button', { name: 'Cancel reservation', exact: true }).click();
  await page.getByLabel('Reason (optional)').fill('E2E cleanup cancellation');
  await page.getByRole('button', { name: 'Confirm cancellation' }).click();
  await expect(page.getByText('cancelled', { exact: true }).first()).toBeVisible();
});
test('staff login → reservation → confirm → payment → check-in → check-out → audit', async ({
  page,
  context,
}) => {
  await login(page);
  await page.getByRole('link', { name: 'Reservations', exact: true }).click();
  await page.getByRole('button', { name: 'New phone / walk-in booking' }).click();
  await page.getByLabel('Room type', { exact: true }).selectOption({ label: 'Deluxe King' });
  await page.getByLabel('Check-in', { exact: true }).fill(date(0));
  await page.getByLabel('Check-out', { exact: true }).fill(date(1));
  const guestName = `E2E Arrival ${randomUUID().slice(0, 8)}`;
  await page.getByLabel('Guest name', { exact: true }).fill(guestName);
  await page.getByLabel('Email', { exact: true }).fill(`staff-${randomUUID()}@example.test`);
  await page.getByLabel('Mobile', { exact: true }).fill('+639181234567');
  await page.getByRole('button', { name: 'Create reservation', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Create reservation', exact: true })).toHaveCount(
    0,
  );
  const row = page.getByRole('row').filter({ hasText: guestName });
  await expect(row).toBeVisible();
  const ref = await row.getByRole('link').innerText();
  const guest = await context.newPage();
  await guest.goto(await verificationUrl(ref));
  await guest.getByRole('button', { name: 'Continue to my reservation' }).click();
  await expect(guest.getByText('pending confirmation', { exact: true }).first()).toBeVisible();
  await guest.close();
  await row.getByRole('link').click();
  await page.getByRole('button', { name: 'Confirm reservation', exact: true }).click();
  await page.getByRole('button', { name: 'Apply status' }).click();
  await expect(page.locator('.admin-heading .status')).toHaveText('confirmed');
  await page.getByRole('button', { name: 'Record payment', exact: true }).click();
  await page.getByLabel('Amount (PHP)').fill('4500');
  await page.getByLabel('Receipt / reference').fill('E2E-RECEIPT');
  await page.getByRole('button', { name: 'Save payment', exact: true }).click();
  await expect(page.getByText('E2E-RECEIPT', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Check in', exact: true }).click();
  await page.getByRole('button', { name: 'Apply status' }).click();
  await expect(page.locator('.admin-heading .status')).toHaveText('checked in');
  await page.getByRole('button', { name: 'Check out', exact: true }).click();
  await page.getByRole('button', { name: 'Apply status' }).click();
  await expect(page.locator('.admin-heading .status')).toHaveText('checked out');
  await page.getByRole('link', { name: 'Audit trail', exact: true }).click();
  await expect(
    page.getByRole('cell', { name: 'RESERVATION_CHECKED_OUT', exact: true }).first(),
  ).toBeVisible();
});
test('desktop and mobile visual smoke; public navigation and administrative surfaces', async ({
  page,
}) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  mkdirSync(qaDirectory, { recursive: true });
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'A little closer to the sun.' })).toBeVisible();
  await page.screenshot({ path: join(qaDirectory, 'home-desktop.png'), fullPage: true });
  expect(
    await page
      .locator('img')
      .evaluateAll((imgs) =>
        imgs.every(
          (img) => img instanceof HTMLImageElement && img.complete && img.naturalWidth > 0,
        ),
      ),
  ).toBe(true);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.screenshot({ path: join(qaDirectory, 'home-mobile.png'), fullPage: true });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(
    true,
  );
  await page.getByRole('button', { name: 'Open navigation' }).click();
  await page
    .getByRole('navigation', { name: 'Main navigation' })
    .getByRole('link', { name: 'Gallery', exact: true })
    .click();
  await expect(page.getByRole('heading', { name: 'A sense of place.' })).toBeVisible();
  await page.setViewportSize({ width: 1440, height: 1000 });
  await login(page);
  await page.screenshot({ path: join(qaDirectory, 'admin-desktop.png'), fullPage: true });
  for (const [name, heading] of [
    ['Rooms', 'Rooms & inventory'],
    ['Promotions', 'Promotions'],
    ['Reports', 'Reports'],
    ['Content & gallery', 'Content & gallery'],
    ['Team', 'Hotel team'],
    ['Settings', 'Reservation policies'],
    ['Audit trail', 'Audit trail'],
  ]) {
    await page
      .getByRole('navigation', { name: 'Staff navigation' })
      .getByRole('link', { name: name!, exact: true })
      .click();
    await expect(page.getByRole('heading', { name: heading!, exact: true }).first()).toBeVisible();
  }
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/admin');
  await expect(page.getByRole('heading', { name: 'Today at Del Sol' })).toBeVisible();
  await page.screenshot({ path: join(qaDirectory, 'admin-mobile.png'), fullPage: true });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(
    true,
  );
  expect(errors).toEqual([]);
});
