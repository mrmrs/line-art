import { test as base, expect } from '@playwright/test';

// Every browser check stays isolated from the production event counters.
export const test = base.extend<{ mockCounters: void }>({
  mockCounters: [async ({ context }, use) => {
    await context.route('https://ts-gen-count.adam-f8f.workers.dev/**', route =>
      route.fulfill({ status: 200, contentType: 'text/plain', body: '123' }));
    await use();
  }, { auto: true }],
});
export { expect };
