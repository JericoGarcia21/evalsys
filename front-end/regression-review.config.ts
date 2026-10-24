import { defineConfig } from '@playwright/test';
import base from './playwright.config';

// scripts/run-regression-review.mjs owns the Vite and disposable API lifecycle.
export default defineConfig({
  ...base,
  webServer: undefined,
  reporter: 'list',
  outputDir: './test-results/regression-review',
  use: { ...base.use, baseURL: 'http://127.0.0.1:5186' },
});
