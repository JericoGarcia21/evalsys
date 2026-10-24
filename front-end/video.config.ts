import { defineConfig } from '@playwright/test';
import config from './playwright.config';

export default defineConfig(config, {
  testDir: './scripts',
  testMatch: 'product-video.capture.spec.ts',
  timeout: 150000,
  reporter: 'list',
  use: { viewport: { width: 1440, height: 800 }, screenshot: 'off', trace: 'off' },
});
