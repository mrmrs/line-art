import { test as base, expect, type Page } from '@playwright/test';

// Every browser check stays isolated from the production event counters.
export const test = base.extend<{ mockCounters: void; emptyScene: boolean; seedScene: void }>({
  emptyScene: [true, { option: true }],
  seedScene: [async ({ context, emptyScene }, use) => {
    if (emptyScene) await context.addInitScript(() => {
      // Most interaction checks construct their own scene; startup has dedicated coverage.
      if (!localStorage.getItem('lnjs-studio-scene'))
        localStorage.setItem('lnjs-studio-scene', JSON.stringify({ nodes: [] }));
    });
    await use();
  }, { auto: true }],
  mockCounters: [async ({ context }, use) => {
    await context.route('https://ts-gen-count.adam-f8f.workers.dev/**', route =>
      route.fulfill({ status: 200, contentType: 'text/plain', body: '123' }));
    await use();
  }, { auto: true }],
});
export { expect };


/** Packed remains supported for saved scenes but is intentionally absent from Add Shape. */
export async function addPacked(page: Page) {
  await page.evaluate(async () => {
    const { useSceneStore, storageReady } = await import('/src/lib/store.ts');
    await storageReady;
    const { DEFAULT_COMPOSITION } = await import('/src/lib/composition-types.ts');
    useSceneStore.getState().addNode('packed-composition', 'Packed', DEFAULT_COMPOSITION);
  });
}
