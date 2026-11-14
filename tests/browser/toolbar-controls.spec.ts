import { test, expect } from './fixtures';

test('grid controls support keyboard settings and compact file actions', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('button', { name: 'Open', exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Save', exact: true })).toBeVisible();
  const toggle = page.getByRole('button', { name: 'Show grid', exact: true });
  await expect(toggle).toHaveAttribute('aria-pressed', 'true');
  await expect(page.locator('.paper-grid')).toHaveAttribute('data-grid-style', 'lines');
  await toggle.click();
  await expect(toggle).toHaveAttribute('aria-pressed', 'false');
  await expect(page.locator('.paper-grid')).toHaveCount(0);
  await toggle.click();
  await expect(toggle).toHaveAttribute('aria-pressed', 'true');
  const settings = page.getByRole('button', { name: 'Grid settings', exact: true });
  await settings.click();
  const panel = page.getByRole('dialog', { name: 'Grid settings', exact: true });
  await expect(panel).toBeVisible();
  await expect(panel.getByLabel('Spacing (mm)')).toBeFocused();
  await panel.getByLabel('Spacing (mm)').fill('15');
  await panel.getByRole('combobox', { name: 'Style', exact: true }).selectOption('dots');
  await panel.getByLabel('Color', { exact: true }).fill('#aabbcc');
  await page.keyboard.press('Escape');
  await expect(panel).toHaveCount(0);
  await expect(settings).toBeFocused();
  await settings.click();
  await expect(panel.getByLabel('Spacing (mm)')).toHaveValue('15');
  await expect(panel.getByRole('combobox', { name: 'Style', exact: true })).toHaveValue('dots');
  await expect(panel.getByLabel('Color', { exact: true })).toHaveValue('#aabbcc');
  await page.getByRole('img', { name: '3D SVG' }).click();
  await expect(panel).toHaveCount(0);
  await toggle.click();
  await expect(toggle).toHaveAttribute('aria-pressed', 'false');
});

test('large scenes can extend the camera clipping range and undo the change', async ({ page }) => {
  await page.goto('/');
  await page.evaluate(async () => {
    const { useSceneStore, storageReady } = await import('/src/lib/store.ts');
    await storageReady;
    const store = useSceneStore.getState();
    store.addNode('cube', 'Distant cube', { min: [-20, -20, -20], max: [20, 20, 20] });
    store.updateCamera(0, { eye: [200, -200, 200], center: [0, 0, 0], ortho: true, orthoSize: 60 });
  });
  await expect(page.locator('.viewport-svg svg')).toBeVisible();
  await expect(page.locator('.viewport-rendering')).toHaveCount(0);
  await expect(page.locator('.viewport-svg polyline')).toHaveCount(0);
  await page.getByText('Clipping range', { exact: true }).click();
  const far = page.getByRole('spinbutton', { name: 'Far', exact: true });
  await far.fill('1000');
  await far.blur();
  await expect.poll(() => page.locator('.viewport-svg polyline').count()).toBeGreaterThan(0);
  await page.getByRole('button', { name: 'Undo', exact: true }).click();
  await expect(far).toHaveValue('100');
  await expect(page.locator('.viewport-svg polyline')).toHaveCount(0);
  // Repeated out-of-range edits must not leave a stale draft above the limit.
  await far.fill('1000000');
  await expect(far).toHaveValue('100000');
  await far.fill('2000000');
  await expect(far).toHaveValue('100000');
  await far.blur();
  await page.evaluate(async () => {
    const { useSceneStore } = await import('/src/lib/store.ts');
    useSceneStore.getState().updateRenderSettings({ near: 0.0001, far: 0.0002 });
  });
  await expect(far).toHaveValue('0.0002');
  const near = page.getByRole('spinbutton', { name: 'Near', exact: true });
  await near.fill('0.0002');
  await expect(near).toHaveValue('0.0001');
});
