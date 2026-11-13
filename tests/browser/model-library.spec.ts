import { test, expect } from './fixtures';
import { MODEL_LIBRARY } from '../../src/lib/model-library';

test('library hides Packed and redundant presets, with consistent vector icons', async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('.shape-library-item')).toHaveCount(11);
  await expect(page.locator('.shape-library').getByText('Packed', { exact: true })).toHaveCount(0);
  await expect(page.getByRole('button', { name: /Add (Voxel Terrain|Mountain Range|Dense City|Cube) to scene/ })).toHaveCount(0);
  const models = page.getByRole('region', { name: 'Models', exact: true });
  await expect(models.locator('.preset-item')).toHaveCount(8);
  const icons = await page.locator('.preset-icon svg').evaluateAll(elements => elements.map(el => ({
    width: el.getAttribute('width'), height: el.getAttribute('height'), viewBox: el.getAttribute('viewBox'),
    fill: el.getAttribute('fill'), stroke: el.getAttribute('stroke'), weight: el.getAttribute('stroke-width'),
  })));
  expect(icons.length).toBe(23);
  for (const icon of icons) expect(icon).toEqual({ width: '24', height: '24', viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', weight: '1.25' });
  const credits = await page.request.get('/models/ATTRIBUTION.md');
  expect(credits.ok()).toBe(true);
  expect(await credits.text()).toContain('Suzanne');
});

for (const model of MODEL_LIBRARY) {
  test(`${model.name} loads locally and renders visible linework`, async ({ page }) => {
    await page.goto('/');
    await page.getByRole('button', { name: `Add ${model.name} to scene`, exact: true }).click();
    await expect(page.locator('.scene-tree-name')).toHaveText(model.name);
    await expect.poll(() => page.locator('.viewport-svg polyline').count()).toBeGreaterThan(5);
    await expect(page.locator('.viewport-rendering')).toHaveCount(0);
    await expect(page.locator('.viewport-svg')).toHaveAttribute('data-preview', 'false');
    await expect(page.getByRole('alert')).toHaveCount(0);
    await page.mouse.move(600, 45);
    await page.screenshot({ path: `tests/browser/model-${model.id}.png` });
  });
}

test('failed model fetch leaves the scene intact and can be retried', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Cube', exact: true }).click();
  await page.route('**/models/suzanne.obj', route => route.fulfill({ status: 503, body: 'Unavailable' }));
  const add = page.getByRole('button', { name: 'Add Suzanne to scene', exact: true });
  await add.click();
  await expect(page.getByRole('alert')).toContainText('Could not load Suzanne');
  await expect(page.locator('.scene-tree-name')).toHaveText('Cube');
  await expect(add).toBeEnabled();
  await page.unroute('**/models/suzanne.obj');
  await add.click();
  await expect(page.locator('.scene-tree-name')).toHaveText(['Cube', 'Suzanne']);
});

test('a slow replacement cannot overwrite edits made while it loads', async ({ page }) => {
  await page.goto('/');
  let release!: () => void;
  const held = new Promise<void>(resolve => { release = resolve; });
  await page.route('**/models/suzanne.obj', async route => { await held; await route.continue(); });
  await page.getByRole('button', { name: 'Replace scene with Suzanne', exact: true }).click();
  await page.getByRole('button', { name: 'Cube', exact: true }).click();
  release();
  await expect(page.getByRole('alert')).toContainText('The scene changed');
  await expect(page.locator('.scene-tree-name')).toHaveText('Cube');
  await expect(page.getByRole('button', { name: 'Add Suzanne to scene', exact: true })).toBeEnabled();
});

test('a stalled model request times out without locking the library', async ({ page }) => {
  await page.clock.install();
  await page.goto('/');
  await page.route('**/models/suzanne.obj', () => {});
  const add = page.getByRole('button', { name: 'Add Suzanne to scene', exact: true });
  await add.click();
  await expect(add).toBeDisabled();
  await page.clock.fastForward(15000);
  await expect(page.getByRole('alert')).toContainText('took too long to load');
  await expect(add).toBeEnabled();
  await expect(page.locator('.scene-tree-item')).toHaveCount(0);
});
