import { defineConfig } from '@playwright/test';
import base from './regression-review.config';

export default defineConfig({
  ...base,
  testMatch: ['legal.spec.ts', 'maintenance-calendar.spec.ts', 'workflows.spec.ts', 'grading-focus.spec.ts'],
  outputDir: './test-results/legal-review',
});
