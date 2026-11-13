import { test, expect, addPacked } from './fixtures';

test('themes persist without changing artwork and library buttons share styles', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Cube', exact: true }).click();
  await expect.poll(() => page.locator('.viewport-svg polyline').count()).toBeGreaterThan(0);
  await expect(page.locator('.viewport-rendering')).toHaveCount(0);
  const artwork = await page.locator('.viewport-svg').innerHTML();
  for (const theme of ['light', 'dark'] as const) {
    await page.getByRole('button', { name: `Switch to ${theme} mode`, exact: true }).click();
    await expect(page.locator('html')).toHaveAttribute('data-theme', theme);
    expect(await page.locator('html').evaluate(el => getComputedStyle(el).colorScheme)).toBe(theme);
    expect(await page.locator('.viewport-svg').innerHTML()).toBe(artwork);
    const shape = page.getByRole('button', { name: 'Cube', exact: true });
    const preset = page.getByRole('button', { name: 'Add Line Grid to scene', exact: true });
    const styles = (el: Element) => {
      const s = getComputedStyle(el);
      return { background: s.backgroundColor, color: s.color, border: s.border, radius: s.borderRadius, padding: s.padding };
    };
    await page.mouse.move(600, 45);
    await expect.poll(async () => JSON.stringify(await shape.evaluate(styles)) === JSON.stringify(await preset.evaluate(styles))).toBe(true);
    await shape.hover();
    await expect(shape).toHaveCSS('background-color', theme === 'light' ? 'rgb(238, 240, 243)' : 'rgb(28, 28, 28)');
    const hovered = await shape.evaluate(styles);
    await preset.hover();
    await expect.poll(async () => await preset.evaluate(styles)).toEqual(hovered);
    await page.keyboard.press('Escape');
    await page.mouse.move(600, 45);
    await page.screenshot({ path: `tests/browser/theme-${theme}.png` });
  }
  await page.getByRole('button', { name: 'Switch to light mode', exact: true }).click();
  await page.reload();
  await expect(page.getByRole('button', { name: 'Switch to dark mode', exact: true })).toBeVisible();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
  await page.getByRole('button', { name: 'Export SVG', exact: true }).click();
  await expect(page.getByRole('dialog')).toHaveCSS('background-color', 'rgb(238, 240, 243)');
  await page.screenshot({ path: 'tests/browser/theme-light-export.png' });
});

test('theme toggle works when preference storage is unavailable', async ({ page }) => {
  await page.addInitScript(() => {
    Storage.prototype.getItem = () => { throw new Error('Storage unavailable'); };
    Storage.prototype.setItem = () => { throw new Error('Storage unavailable'); };
  });
  await page.goto('/');
  const toggle = page.getByRole('button', { name: 'Switch to light mode', exact: true });
  await toggle.focus();
  await page.keyboard.press('Enter');
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
  await expect(page.getByRole('button', { name: 'Switch to dark mode', exact: true })).toBeFocused();
});

test('grid stays below transparent artwork and interaction layers in both workspaces', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Cube', exact: true }).click();
  await expect.poll(() => page.locator('.viewport-svg polyline').count()).toBeGreaterThan(0);
  await page.evaluate(async () => {
    const { useViewSettings } = await import('/src/lib/view-settings.ts');
    useViewSettings.getState().setGridColor('#ff0000');
    const { useSceneStore } = await import('/src/lib/store.ts');
    useSceneStore.getState().updateRenderSettings({ strokeWidth: 5 });
  });
  for (const packed of [false, true]) {
    if (packed) {
      await addPacked(page);
      await page.getByRole('button', { name: 'Generate composition', exact: true }).click();
      await expect.poll(() => page.locator('.compose-art polyline').count()).toBeGreaterThan(0);
    }
    const art = page.locator(packed ? '.compose-art' : '.viewport-svg');
    const interaction = page.locator(packed ? '.compose-selection' : '.viewport-overlay');
    await expect(art.locator('svg')).toHaveCSS('background-color', 'rgba(0, 0, 0, 0)');
    const z = (el: Element) => Number(getComputedStyle(el).zIndex);
    expect(await page.locator('.paper-grid').evaluate(z)).toBeLessThan(await art.evaluate(z));
    expect(await art.evaluate(z)).toBeLessThan(await interaction.evaluate(z));
    await page.screenshot({ path: `tests/browser/grid-behind-${packed ? 'packed' : 'scene'}.png` });
  }
});
