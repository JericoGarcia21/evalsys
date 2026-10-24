import { defineConfig } from '@playwright/test';
import base from './video-playback.config';

export default defineConfig({
  ...base,
  webServer: undefined,
  outputDir: './test-results/playback-review',
  use: { ...base.use, baseURL: 'http://127.0.0.1:5185' },
});
