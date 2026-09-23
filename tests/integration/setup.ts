import { execFileSync } from 'node:child_process';
export default function setup() {
  execFileSync(
    process.execPath,
    [
      'node_modules/prisma/build/index.js',
      'migrate',
      'deploy',
      '--schema',
      'apps/api/prisma/schema.prisma',
    ],
    { stdio: 'pipe', env: process.env, windowsHide: true },
  );
}
