import { test, expect } from './fixtures';

test('fork renders scaled solids across cameras and exports at physical precision', async ({
  page,
}) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto('/');
  await expect(page.getByRole('img', { name: '3D SVG' })).toBeVisible();
  await page.evaluate(async () => {
    const { useSceneStore } = await import('/src/lib/store.ts');
    const { DEFAULT_TRANSFORM } = await import('/src/lib/types.ts');
    const store = useSceneStore.getState();
    store.clearScene();
    store.addNode(
      'sphere',
      'Ellipsoid',
      { center: [0, 0, 0], radius: 1 },
      {
        ...DEFAULT_TRANSFORM,
        scale: [1.2, 0.65, 1],
        translate: [-0.4, 0, 0],
      },
    );
    store.addNode('cube', 'Front blocker', {
      min: [0.2, -0.6, 0.3],
      max: [0.8, 0.5, 1.5],
    });
    store.addNode(
      'cylinder',
      'Closed cylinder',
      { radius: 0.35, z0: -1, z1: 1 },
      {
        ...DEFAULT_TRANSFORM,
        translate: [1.5, 0, 0],
      },
    );
    store.setViewMode('2x2');
  });
  await page.getByLabel('Visibility quality').selectOption('0.025');
  await expect(page.locator('.viewport')).toHaveCount(4);
  await expect
    .poll(() => page.locator('.viewport-svg polyline').count())
    .toBeGreaterThan(50);
  await page.waitForFunction(
    () => !document.querySelector('.viewport-rendering'),
  );
  await expect(page.locator('.viewport-stats [role="alert"]')).toHaveCount(0);
  await page.screenshot({ path: 'tests/browser/occlusion-cameras.png' });
  await page.getByRole('button', { name: 'Export SVG', exact: true }).click();
  await page.getByRole('button', { name: 'Download SVG', exact: true }).click();
  await expect(page.getByText('SVG downloaded', { exact: true })).toBeVisible();
  await expect(page.locator('.export-panel [role="alert"]')).toHaveCount(0);
  expect(errors).toEqual([]);
});
