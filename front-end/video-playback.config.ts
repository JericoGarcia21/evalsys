import { defineConfig } from '@playwright/test';
import config from './playwright.config';

// Playback can be verified against the production build without a database.
export default defineConfig({
  ...config,
  testMatch: 'product-video.spec.ts',
  reporter: 'list',
  use: { ...config.use, baseURL: 'http://127.0.0.1:5181' },
  webServer: {
    command: 'npm run preview -- --host 127.0.0.1 --port 5181 --strictPort',
    url: 'http://127.0.0.1:5181',
    reuseExistingServer: false,
  },
});
