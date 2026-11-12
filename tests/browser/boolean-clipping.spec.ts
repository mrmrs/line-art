import { test, expect } from '@playwright/test';

test('Boolean curves render once at final quality across views and export', async ({
  page,
}) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto('/');
  await expect(page.getByRole('img', { name: 'Studio mark' })).toBeVisible();
  await page.evaluate(async () => {
    const { useSceneStore } = await import('/src/lib/store.ts');
    const store = useSceneStore.getState();
    store.clearScene();
    const a = store.addNode('sphere', 'Sphere', {
      center: [0, 0, 0],
      radius: 1,
    });
    const b = store.addNode('cylinder', 'Bore', {
      radius: 0.35,
      z0: -2,
      z1: 2,
    });
    store.addNode('boolean', 'Analytic difference', {
      operation: 'difference',
      childIds: [a, b],
    });
    store.setViewMode('2x2');
  });
  await page.getByLabel('Visibility quality').selectOption('0.025');
  await expect(page.locator('.viewport')).toHaveCount(4);
  await expect
    .poll(() => page.locator('.viewport-svg polyline').count())
    .toBeGreaterThan(30);
  await page.waitForFunction(
    () => !document.querySelector('.viewport-rendering'),
  );
  await expect(page.locator('.viewport-stats [role="alert"]')).toHaveCount(0);
  // Exercise the actual Vite worker entry point and assert there is no draft pass.
  const final = await page.evaluate(async () => {
    const { useSceneStore } = await import('/src/lib/store.ts');
    const state = useSceneStore.getState();
    const worker = new Worker(
      new URL('/src/lib/render-worker.ts', location.origin),
      { type: 'module' },
    );
    return new Promise<boolean>((resolve, reject) => {
      const timer = setTimeout(() => {
        worker.terminate();
        reject(new Error('Boolean worker timed out'));
      }, 15000);
      worker.onmessage = ({ data }) => {
        if (data.type !== 'result' && data.type !== 'error') return;
        clearTimeout(timer);
        worker.terminate();
        if (data.type === 'error') reject(new Error(data.error));
        else resolve(data.isFinal);
      };
      worker.onerror = (event) => {
        clearTimeout(timer);
        worker.terminate();
        reject(new Error(event.message));
      };
      worker.postMessage({ type: 'scene', revision: 1, nodes: state.nodes });
      worker.postMessage({
        type: 'render',
        revision: 1,
        id: 1,
        camera: state.cameras[0],
        width: 320,
        height: 320,
        settings: { ...state.renderSettings, curveTolerance: 0.025 },
      });
    });
  });
  expect(final).toBe(true);
  await page.screenshot({ path: 'tests/browser/boolean-clipping-cameras.png' });
  await page.getByRole('button', { name: 'Export SVG', exact: true }).click();
  await page.getByRole('button', { name: 'Generate SVG', exact: true }).click();
  await expect(
    page.getByRole('button', { name: 'Download SVG', exact: true }),
  ).toBeEnabled();
  await expect(page.locator('.export-panel [role="alert"]')).toHaveCount(0);
  expect(errors).toEqual([]);
});
