import { defineConfig } from '@playwright/test';

const port = Number(process.env['E2E_PORT'] ?? 4200);

export default defineConfig({
  testDir: '.',
  testMatch: '*.e2e.ts',
  outputDir: './test-results',
  timeout: 120_000,
  expect: { timeout: 15_000 },
  workers: 1,
  reporter: 'list',
  use: {
    baseURL: `http://localhost:${port}`,
    channel: process.env['E2E_CHANNEL'] ?? 'chrome',
    viewport: { width: 400, height: 860 },
    trace: 'retain-on-failure'
  },
  webServer: {
    command: `npx ng serve --port ${port}`,
    cwd: '..',
    url: `http://localhost:${port}`,
    reuseExistingServer: process.env['E2E_REUSE'] === '1',
    timeout: 240_000
  }
});
