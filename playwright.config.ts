import { defineConfig } from '@playwright/test';
const port = Number(process.env.PLAYWRIGHT_PORT ?? 5188);
export default defineConfig({
  testDir: 'tests/browser',
  use: { baseURL: `http://127.0.0.1:${port}`, headless: true, channel: 'chrome' },
  webServer: {
    command: `npm run dev -- --host 127.0.0.1 --port ${port} --strictPort`,
    url: `http://127.0.0.1:${port}`,
    reuseExistingServer: false,
  },
  timeout: 60000,
  workers: 1,
});
