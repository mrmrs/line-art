import { test, expect } from '@playwright/test';

test('layer trash control appears on hover and focus and deletes selected layers', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'ln.studio' })).toBeVisible();
  await page.evaluate(async () => {
    const { useSceneStore } = await import('/src/lib/store.ts');
    useSceneStore.getState().clearScene();
    for (const name of ['First layer', 'Second layer', 'Third layer']) {
      useSceneStore.getState().addNode('cube', name, { min: [-1, -1, -1], max: [1, 1, 1] });
    }
  });
  const first = page.locator('.scene-tree-item').filter({ hasText: 'First layer' });
  const button = first.locator('.delete-btn');
  await first.hover();
  await expect(button).toHaveCSS('opacity', '1');
  await expect(button.locator('svg')).toBeVisible();
  await page.getByRole('heading', { name: 'ln.studio' }).hover();
  await expect(button).toHaveCSS('opacity', '0');
  await button.focus();
  await expect(button).toHaveCSS('opacity', '1');
  await page.keyboard.press('Enter');
  await expect(first).toHaveCount(0);
  const second = page.locator('.scene-tree-item').filter({ hasText: 'Second layer' });
  const third = page.locator('.scene-tree-item').filter({ hasText: 'Third layer' });
  await second.click();
  await third.click({ modifiers: ['ControlOrMeta'] });
  await third.getByRole('button', { name: 'Delete 2 selected', exact: true }).click();
  await expect(page.locator('.scene-tree-item')).toHaveCount(0);
});
