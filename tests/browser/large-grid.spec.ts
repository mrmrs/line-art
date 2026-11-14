import { test, expect } from './fixtures';

test('large cube grid warns, reports tile progress, and remains cancellable', async ({ page }) => {
  await page.goto('/');
  await page.evaluate(async () => {
    const { useSceneStore, storageReady } = await import('/src/lib/store.ts');
    const t = await import('/src/lib/types.ts');
    await storageReady;
    const s = useSceneStore.getState();
    s.loadNodes([{ name: 'Large grid', type: 'cube-grid', visible: true,
      transform: t.DEFAULT_TRANSFORM, slicing: t.DEFAULT_SLICING,
      params: { ...t.DEFAULT_CUBE_GRID_PARAMS, countX: 64, countY: 64, countZ: 128 } }]);
    s.updateCamera(0, { eye: [100, 80, 60], ortho: true, orthoSize: 51.2 });
    s.updateRenderSettings({ far: 1000 });
  });
  await expect(page.getByText(/524,288 cells: rendering may take minutes/)).toBeVisible();
  await expect(page.locator('.viewport-rendering')).toContainText('Rendering tile', { timeout: 30000 });
  await page.locator('.viewport-stats').getByRole('button', { name: 'Cancel', exact: true }).click();
  await expect(page.locator('.viewport-stats')).toContainText('Render cancelled');
  await expect(page.locator('.viewport-rendering')).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Export SVG', exact: true })).toBeEnabled();
});
