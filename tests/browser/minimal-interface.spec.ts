import { test, expect } from './fixtures';

test('document controls live in the sidebar and layer/camera fields stay compact', async ({ page }) => {
  await page.goto('/');
  const document = page.getByRole('region', { name: 'Document', exact: true });
  await expect(document).toBeVisible();
  await expect(page.locator('header').getByLabel('Paper size', { exact: true })).toHaveCount(0);
  await expect(document.getByLabel('Paper size', { exact: true })).toBeVisible();
  await document.getByLabel('Paper size', { exact: true }).selectOption('A4');
  await expect(page.locator('.viewport-paper')).toHaveAttribute('data-paper-size', 'A4');
  await expect(page.getByRole('button', { name: /Automata Grid|Packed Composition|Function Surface/ })).toHaveCount(0);
  await page.getByRole('button', { name: '◻ Cube', exact: true }).click();
  const title = page.getByRole('textbox', { name: 'Layer title', exact: true });
  await title.fill('Small title');
  await expect(page.locator('.scene-tree-name')).toHaveText('Small title');
  expect(await title.evaluate(el => ({ font: getComputedStyle(el).fontSize, border: getComputedStyle(el).borderWidth }))).toEqual({ font: '10px', border: '0px' });
  const projection = page.locator('.camera-projection-row');
  await expect(projection).toContainText('FOV');
  await expect(projection.getByRole('checkbox', { name: 'Ortho', exact: true })).toBeVisible();
  await projection.getByRole('checkbox', { name: 'Ortho', exact: true }).check();
  await expect(page.getByText('Ortho Size', { exact: true })).toBeVisible();
  await expect(page.getByTitle('Undo (Cmd+Z)').locator('svg')).toHaveCount(1);
  await expect(page.getByTitle('Redo (Cmd+Shift+Z)').locator('svg')).toHaveCount(1);
  await page.screenshot({ path: 'tests/browser/minimal-interface.png' });
});

test('packed canvas uses the same neutral presentation and keeps editing in the sidebar', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: '◈ Packed', exact: true }).click();
  await expect(page.getByRole('region', { name: 'Document', exact: true })).toBeVisible();
  await expect(page.locator('.compose-workspace button')).toHaveCount(0);
  await expect(page.getByText('COMPOSE / FITTED', { exact: true })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Export composition', exact: true })).toHaveCount(0);
  await expect(page.locator('.compose-empty, .compose-heading, .compose-footer')).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Export SVG', exact: true })).toHaveCount(1);
  await page.locator('.compose-generate').getByRole('button', { name: 'Generate composition', exact: true }).click();
  await expect.poll(() => page.locator('.compose-hit').count()).toBeGreaterThan(0);
  await expect.poll(() => page.locator('.compose-art polyline').count()).toBeGreaterThan(0);
  await expect(page.locator('.compose-workspace button')).toHaveCount(0);
  await page.screenshot({ path: 'tests/browser/minimal-packed.png' });
});
