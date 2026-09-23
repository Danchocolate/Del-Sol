import { defineConfig } from 'vitest/config';
import { config } from 'dotenv';
config({ quiet: true });
if (!process.env.TEST_DATABASE_URL) throw new Error('TEST_DATABASE_URL is required');
const url = new URL(process.env.TEST_DATABASE_URL);
if (!['127.0.0.1', 'localhost'].includes(url.hostname) || !url.pathname.endsWith('_test'))
  throw new Error('Integration tests require a localhost database ending in _test');
process.env.DATABASE_URL = process.env.TEST_DATABASE_URL;
process.env.NODE_ENV = 'test';
process.env.JOBS_SECRET = 'integration-test-only-jobs-secret-123456789';
export default defineConfig({
  test: {
    include: ['tests/integration/**/*.test.ts'],
    fileParallelism: false,
    maxWorkers: 1,
    testTimeout: 30000,
    hookTimeout: 30000,
    globalSetup: ['tests/integration/setup.ts'],
  },
});
