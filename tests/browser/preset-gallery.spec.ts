import { test, expect } from './fixtures';
import { PRESETS } from '../../src/lib/presets';

for (const preset of PRESETS) {
  test(`${preset.name} produces a complete visible drawing`, async ({ page }) => {
    await page.goto('/');
    await page.getByRole('button', { name: `Add ${preset.name} to scene`, exact: true }).click();
    await expect.poll(() => page.locator('.viewport-svg polyline').count()).toBeGreaterThan(5);
    await expect(page.locator('.viewport-rendering')).toHaveCount(0);
    await expect(page.locator('.viewport-svg')).toHaveAttribute('data-preview', 'false');
    await expect(page.getByRole('alert')).toHaveCount(0);
    await page.mouse.move(600, 45);
    await page.screenshot({ path: `tests/browser/preset-${preset.name.toLowerCase().replaceAll(' ', '-')}.png` });
  });
}
