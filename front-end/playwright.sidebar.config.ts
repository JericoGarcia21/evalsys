import { defineConfig } from '@playwright/test';
export default defineConfig({
  testDir: './test',
  testMatch: 'sidebar-mobile.spec.ts',
  workers: 1,
  use: { baseURL: 'http://127.0.0.1:5181', channel: 'chrome', screenshot: 'only-on-failure' },
  webServer: { command: 'npm run dev -- --host 127.0.0.1 --port 5181 --strictPort', url: 'http://127.0.0.1:5181', reuseExistingServer: false },
});
