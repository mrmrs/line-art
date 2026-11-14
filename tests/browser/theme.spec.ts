import { test, expect, addPacked } from './fixtures';

test.beforeEach(async ({ page }) => {
  await page.emulateMedia({ colorScheme: 'dark' });
});

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
    // Compare settled styles, not an intermediate frame of the hover transition.
    await expect(shape).toHaveCSS('background-color', theme === 'light' ? 'rgb(255, 255, 255)' : 'rgb(28, 28, 28)');
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
  await expect(page.getByRole('dialog')).toBeVisible();
  expect(await page.getByRole('dialog').evaluate(el => getComputedStyle(el).colorScheme)).toBe('light');
  await page.screenshot({ path: 'tests/browser/theme-light-export.png' });
});

test('theme toggle works when preference storage is unavailable', async ({ page }) => {
  await page.addInitScript(() => {
    Storage.prototype.getItem = () => { throw new Error('Storage unavailable'); };
    Storage.prototype.setItem = () => { throw new Error('Storage unavailable'); };
  });
  await page.goto('/');
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  await page.emulateMedia({ colorScheme: 'light' });
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
  await page.emulateMedia({ colorScheme: 'dark' });
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  const toggle = page.getByRole('button', { name: 'Switch to light mode', exact: true });
  await toggle.focus();
  await page.keyboard.press('Enter');
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
  await expect(page.getByRole('button', { name: 'Switch to dark mode', exact: true })).toBeFocused();
  await page.emulateMedia({ colorScheme: 'light' });
  await page.emulateMedia({ colorScheme: 'dark' });
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
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


for (const system of ['light', 'dark'] as const) {
  test(`head bootstrap resolves ${system} before application modules load`, async ({ page }) => {
    await page.emulateMedia({ colorScheme: system });
    await page.route('**/src/main.tsx', route => route.abort());
    await page.goto('/');
    await expect(page.locator('html')).toHaveAttribute('data-theme', system);
    await expect(page.locator('meta[name="theme-color"]')).toHaveAttribute('content', system === 'dark' ? '#141414' : '#fafafa');
    expect(await page.evaluate(() => localStorage.getItem('skullcat-theme'))).toBeNull();
    expect(await page.locator('#root').innerHTML()).toBe('');
  });
}

test('system theme follows live changes without storing a preference or altering scene state', async ({ page }) => {
  await page.emulateMedia({ colorScheme: 'light' });
  await page.goto('/');
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
  await page.getByRole('button', { name: 'Cube', exact: true }).click();
  await expect.poll(() => page.locator('.viewport-svg polyline').count()).toBeGreaterThan(0);
  await expect(page.locator('.viewport-rendering')).toHaveCount(0);
  const snapshot = () => page.evaluate(async () => {
    const { useSceneStore } = await import('/src/lib/store.ts');
    const { useViewSettings } = await import('/src/lib/view-settings.ts');
    const { nodes, cameras, activeCameraIndex, renderSettings, renderVersion, selectedId, viewMode } = useSceneStore.getState();
    const { pastStates, futureStates } = useSceneStore.temporal.getState();
    return JSON.stringify({ nodes, cameras, activeCameraIndex, renderSettings, renderVersion, selectedId, viewMode, pastStates, futureStates, paper: useViewSettings.getState() });
  });
  const before = await snapshot();
  const artwork = await page.locator('.viewport-svg').innerHTML();
  for (const system of ['dark', 'light', 'dark'] as const) {
    await page.emulateMedia({ colorScheme: system });
    await expect(page.locator('html')).toHaveAttribute('data-theme', system);
    await expect(page.locator('meta[name="theme-color"]')).toHaveAttribute('content', system === 'dark' ? '#141414' : '#fafafa');
    expect(await snapshot()).toBe(before);
    expect(await page.locator('.viewport-svg').innerHTML()).toBe(artwork);
    expect(await page.evaluate(() => localStorage.getItem('skullcat-theme'))).toBeNull();
  }
  await page.getByRole('button', { name: 'Switch to light mode', exact: true }).click();
  expect(await page.evaluate(() => localStorage.getItem('skullcat-theme'))).toBe('light');
  expect(await snapshot()).toBe(before);
  await page.emulateMedia({ colorScheme: 'light' });
  await page.emulateMedia({ colorScheme: 'dark' });
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
  await page.reload();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
});

test('stored choices override system before paint and after initialization', async ({ page }) => {
  await page.emulateMedia({ colorScheme: 'light' });
  await page.addInitScript(() => localStorage.setItem('skullcat-theme', 'dark'));
  await page.route('**/src/main.tsx', route => route.abort());
  await page.goto('/');
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  await page.unroute('**/src/main.tsx');
  await page.reload();
  await expect(page.getByRole('button', { name: 'Switch to light mode', exact: true })).toBeVisible();
});

test('cross-tab preferences synchronize and removing the override resumes system changes', async ({ page, context }) => {
  await page.goto('/');
  const other = await context.newPage();
  await other.goto('/');
  await other.evaluate(() => localStorage.setItem('skullcat-theme', 'light'));
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
  await other.evaluate(() => localStorage.removeItem('skullcat-theme'));
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  await page.emulateMedia({ colorScheme: 'light' });
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
  await other.evaluate(() => localStorage.setItem('skullcat-theme', 'invalid'));
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
  await page.emulateMedia({ colorScheme: 'dark' });
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  await other.close();
});
