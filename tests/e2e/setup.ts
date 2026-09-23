import { execFileSync } from 'node:child_process';
export default function setup() {
  const env = { ...process.env, DATABASE_URL: process.env.E2E_DATABASE_URL, NODE_ENV: 'test' };
  execFileSync(
    process.execPath,
    [
      'node_modules/prisma/build/index.js',
      'migrate',
      'deploy',
      '--schema',
      'apps/api/prisma/schema.prisma',
    ],
    { env, stdio: 'pipe', windowsHide: true },
  );
  execFileSync(process.execPath, ['--import', 'tsx', 'apps/api/prisma/seed.ts'], {
    env,
    stdio: 'pipe',
    windowsHide: true,
  });
}
