import { defineConfig, devices } from '@playwright/test';
import { config } from 'dotenv';
import { resolve } from 'node:path';
import { tmpdir } from 'node:os';
config({ quiet: true });
process.env.PLAYWRIGHT_BROWSERS_PATH ??= resolve('.local/browsers');
if (
  !process.env.E2E_DATABASE_URL ||
  !new URL(process.env.E2E_DATABASE_URL).pathname.endsWith('_test') ||
  !['127.0.0.1', 'localhost'].includes(new URL(process.env.E2E_DATABASE_URL).hostname)
)
  throw new Error('E2E needs a localhost E2E_DATABASE_URL ending in _test');
const env = {
  ...Object.fromEntries(
    Object.entries(process.env).filter((pair): pair is [string, string] => pair[1] !== undefined),
  ),
  DATABASE_URL: process.env.E2E_DATABASE_URL,
  NODE_ENV: 'test',
  APP_ORIGIN: 'http://127.0.0.1:5174',
  PORT: '3002',
  API_PROXY_TARGET: 'http://127.0.0.1:3002',
};
export default defineConfig({
  testDir: 'tests/e2e',
  fullyParallel: false,
  workers: 1,
  timeout: 60000,
  retries: 0,
  reporter: 'list',
  outputDir: resolve(tmpdir(), 'hotel-del-sol-e2e-results'),
  globalSetup: './tests/e2e/setup.ts',
  use: { baseURL: env.APP_ORIGIN, trace: 'retain-on-failure', screenshot: 'only-on-failure' },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: [
    {
      command: 'node --import tsx apps/api/src/index.ts',
      url: 'http://127.0.0.1:3002/api/health',
      env,
      reuseExistingServer: false,
      timeout: 30000,
    },
    {
      command: 'npm run preview -w @hotel/web -- --port 5174',
      url: 'http://127.0.0.1:5174',
      env,
      reuseExistingServer: false,
      timeout: 30000,
    },
  ],
});
