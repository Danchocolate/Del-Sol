import { defineConfig } from 'vitest/config';
import { config } from 'dotenv';
config({ quiet: true });
process.env.NODE_ENV = 'test';
export default defineConfig({
  test: {
    include: ['tests/unit/**/*.test.ts', 'apps/web/src/**/*.test.tsx'],
    environment: 'node',
    projects: [
      { test: { name: 'backend', include: ['tests/unit/**/*.test.ts'], environment: 'node' } },
      { test: { name: 'frontend', include: ['apps/web/src/**/*.test.tsx'], environment: 'jsdom' } },
    ],
  },
});
