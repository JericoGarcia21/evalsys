import { defineConfig } from '@playwright/test';
import base from './video.config';

export default defineConfig({
  ...base,
  webServer: undefined,
  use: { ...base.use, baseURL: 'http://127.0.0.1:5186' },
});
