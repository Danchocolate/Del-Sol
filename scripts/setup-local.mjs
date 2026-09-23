import { mkdirSync, existsSync, writeFileSync, readFileSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { randomBytes } from 'node:crypto';
import { spawnSync } from 'node:child_process';
const root = resolve(import.meta.dirname, '..');
const local = join(root, '.local');
mkdirSync(local, { recursive: true });
const bin =
  process.env.PG_BIN ||
  (process.platform === 'win32'
    ? 'C:/Program Files/PostgreSQL/18/bin'
    : '/usr/lib/postgresql/18/bin');
const run = (name, args, env = {}) => {
  const r = spawnSync(join(bin, name), args, {
    cwd: root,
    windowsHide: true,
    encoding: 'utf8',
    env: { ...process.env, ...env },
  });
  if (r.status !== 0) throw new Error(r.stderr || r.error?.message || `${name} failed`);
  return r.stdout;
};
const envFile = join(root, '.env');
if (!existsSync(envFile)) {
  const password = randomBytes(24).toString('hex');
  const base = readFileSync(join(root, '.env.example'), 'utf8')
    .replaceAll('REPLACE_PASSWORD', password)
    .replaceAll(':5432/', ':55432/')
    .replace('REPLACE_WITH_RANDOM_32_BYTE_SECRET', randomBytes(32).toString('hex'))
    .replace('REPLACE_WITH_64_HEX_CHARACTERS', randomBytes(32).toString('hex'))
    .replace('REPLACE_WITH_STRONG_UNIQUE_PASSWORD', randomBytes(18).toString('base64url'));
  writeFileSync(envFile, base, { mode: 0o600 });
}
const env = Object.fromEntries(
  readFileSync(envFile, 'utf8')
    .split(/\r?\n/)
    .filter((l) => l.includes('='))
    .map((l) => {
      const at = l.indexOf('=');
      return [l.slice(0, at), l.slice(at + 1)];
    }),
);
const url = new URL(env.DATABASE_URL);
if (!env.E2E_DATABASE_URL) {
  const e2eUrl = new URL(env.DATABASE_URL);
  e2eUrl.pathname = '/hotel_del_sol_e2e_test';
  writeFileSync(
    envFile,
    readFileSync(envFile, 'utf8') + '\nE2E_DATABASE_URL=' + e2eUrl.href + '\n',
    { mode: 0o600 },
  );
}
if (url.hostname !== '127.0.0.1' || url.port !== '55432')
  throw new Error('Local setup only accepts isolated 127.0.0.1:55432 database');
const data = join(local, 'postgres');
if (!existsSync(data)) {
  const pw = join(local, 'pg-password');
  writeFileSync(pw, decodeURIComponent(url.password), { mode: 0o600 });
  run('initdb', [
    '-D',
    data,
    '-U',
    'hotel',
    '--pwfile',
    pw,
    '--auth=scram-sha-256',
    '--encoding=UTF8',
    '--locale=C',
  ]);
  const { unlinkSync } = await import('node:fs');
  unlinkSync(pw);
  writeFileSync(
    join(data, 'postgresql.auto.conf'),
    "listen_addresses = '127.0.0.1'\nport = 55432\nmax_connections = 50\n",
  );
}
const status = spawnSync(join(bin, 'pg_isready'), ['-h', '127.0.0.1', '-p', '55432'], {
  windowsHide: true,
  encoding: 'utf8',
  timeout: 5000,
});
if (status.status !== 0) {
  const result = spawnSync(
    join(bin, 'pg_ctl'),
    ['-D', data, '-l', join(local, 'postgres.log'), 'start', '-w'],
    { windowsHide: true, stdio: 'ignore', timeout: 30000 },
  );
  if (result.status !== 0) throw new Error('Could not start isolated PostgreSQL');
}
for (const database of ['hotel_del_sol', 'hotel_del_sol_test', 'hotel_del_sol_e2e_test']) {
  const existing = run(
    'psql',
    [
      '-h',
      '127.0.0.1',
      '-p',
      '55432',
      '-U',
      'hotel',
      '-d',
      'postgres',
      '-tAc',
      `SELECT 1 FROM pg_database WHERE datname='${database}'`,
    ],
    { PGPASSWORD: decodeURIComponent(url.password) },
  ).trim();
  if (existing !== '1')
    run('createdb', ['-h', '127.0.0.1', '-p', '55432', '-U', 'hotel', database], {
      PGPASSWORD: decodeURIComponent(url.password),
    });
}
console.log(
  'Isolated PostgreSQL is running on 127.0.0.1:55432. Secrets are in ignored .env. Run db:migrate and db:seed.',
);
