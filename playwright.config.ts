import { defineConfig } from '@playwright/test';
export default defineConfig({
  testDir: 'tests/browser',
  use: { baseURL: 'http://127.0.0.1:5188', headless: true, channel: 'chrome' },
  webServer: {
    command: 'npm run dev -- --host 127.0.0.1 --port 5188 --strictPort',
    url: 'http://127.0.0.1:5188',
    reuseExistingServer: false,
  },
  timeout: 60000,
  workers: 1,
});
