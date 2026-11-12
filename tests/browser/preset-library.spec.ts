import { test, expect } from '@playwright/test';

test('presets offer compact grid and list views with keyboard descriptions and atomic replacement', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('img', { name: 'Studio mark' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Preset grid view' })).toHaveAttribute('aria-pressed', 'true');
  const cube = page.getByRole('button', { name: 'Add Cube to scene', exact: true });
  await cube.focus();
  await expect(page.getByRole('tooltip')).toContainText('Simple wireframe cube');
  await expect(cube.locator('.preset-name')).toBeHidden();
  await page.keyboard.press('Escape');
  await expect(page.getByRole('tooltip')).toHaveCount(0);
  await page.getByRole('button', { name: 'Preset list view' }).click();
  await expect(cube.locator('.preset-name')).toBeVisible();
  await expect(page.locator('.preset-desc')).toHaveCount(0);
  await page.evaluate(async () => {
    const { useSceneStore } = await import('/src/lib/store.ts');
    useSceneStore.getState().clearScene();
    useSceneStore.getState().addNode('sphere', 'Original sphere', { center: [0, 0, 0], radius: 1 });
    useSceneStore.temporal.getState().clear();
  });
  await cube.focus();
  await page.getByRole('button', { name: 'Replace scene with Cube', exact: true }).click();
  await expect(page.locator('.scene-tree-item')).toHaveCount(1);
  await expect(page.locator('.scene-tree-name')).toHaveText('Cube');
  await page.evaluate(async () => {
    const { useSceneStore } = await import('/src/lib/store.ts');
    useSceneStore.temporal.getState().undo();
  });
  await expect(page.locator('.scene-tree-name')).toHaveText('Original sphere');
});
