import { defineConfig } from '@playwright/test';

// These tests supply their own API responses. The companion runner owns and
// closes a production preview, so no database or live credentials are needed.
export default defineConfig({
  testDir: './test',
  testMatch: ['login-connection.spec.ts', 'sidebar-mobile.spec.ts', 'grading-focus.spec.ts'],
  workers: 1,
  reporter: 'list',
  expect: { timeout: 10000 },
  timeout: 30000,
  outputDir: './test-results/ui-review',
  use: { baseURL: 'http://127.0.0.1:5185', channel: process.env.CI ? undefined : 'chrome', screenshot: 'only-on-failure', trace: 'retain-on-failure' },
});
