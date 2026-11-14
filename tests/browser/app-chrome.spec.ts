import { test, expect, addPacked } from './fixtures';

const sizes = [
  { width: 320, height: 740 }, { width: 390, height: 844 },
  { width: 640, height: 800 }, { width: 800, height: 900 },
  { width: 1440, height: 900 }, { width: 640, height: 320 },
  { width: 800, height: 360 }, { width: 320, height: 320 },
];

for (const theme of ['light', 'dark'] as const) {
  test(`${theme} chrome preserves canvas space and aligned controls at all target sizes`, async ({ page }) => {
    await page.emulateMedia({ colorScheme: theme });
    await page.goto('/');
    await page.evaluate(async () => {
      const { useSceneStore, storageReady } = await import('/src/lib/store.ts');
      await storageReady;
      useSceneStore.getState().addNode('cube', 'Responsive fixture', { min: [-1, -1, -1], max: [1, 1, 1] });
    });
    await expect.poll(() => page.locator('.viewport-svg polyline').count()).toBeGreaterThan(0);
    await page.evaluate(() => document.fonts.ready);
    for (const size of sizes) {
      await page.setViewportSize(size);
      await expect(page.locator('.app')).toHaveAttribute('data-compact', String(size.width <= 1040));
      const canvas = await page.getByRole('main', { name: 'Drawing canvas' }).boundingBox();
      expect(canvas!.width).toBe(size.width <= 1040 ? size.width : size.width - 500);
      expect(canvas!.height).toBeGreaterThanOrEqual(size.height - 49);
      const exported = page.getByRole('button', { name: 'Export SVG', exact: true });
      await expect(exported).toHaveText('Export SVG');
      const header = await page.locator('.toolbar').boundingBox();
      expect(header!.height).toBe(48);
      const bounds = await page.locator('.toolbar > .toolbar-right > button, .toolbar-center button, .project-actions button').evaluateAll(buttons => buttons.filter(b => b.getClientRects().length).map(b => {
        const box = b.getBoundingClientRect(); return { x: box.x, y: box.y, right: box.right, height: box.height };
      }));
      expect(bounds.every(b => b.x >= 0 && b.right <= size.width && b.height === 30)).toBe(true);
      expect(new Set(bounds.map(b => b.y)).size).toBe(1);
      expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(size.width);
      await page.screenshot({ path: `tests/browser/chrome-${theme}-${size.width}x${size.height}.png`, animations: 'disabled' });
    }
    await page.setViewportSize({ width: 1440, height: 900 });
    await expect(page.getByRole('button', { name: 'Export SVG', exact: true })).toHaveCSS('background-color', theme === 'light' ? 'rgb(23, 23, 23)' : 'rgb(255, 255, 255)');
    await expect(page.locator('body')).toHaveCSS('font-family', /DM Sans/);
    await expect(page.locator('input[type="number"]').first()).toHaveCSS('font-family', /IBM Plex Mono/);
    await expect(page.locator('input[type="checkbox"]').first()).toHaveCSS('appearance', 'none');
  });
}

test('desktop project actions keep editable scenes separate from mesh imports and SVG export', async ({ page }) => {
  await page.goto('/');
  const project = page.getByRole('group', { name: 'Project', exact: true });
  await expect(project.getByRole('button')).toHaveText(['Open', 'Save']);
  await expect(project.getByRole('button', { name: 'Open', exact: true })).toHaveAttribute('title', 'Open project');
  await expect(project.getByRole('button', { name: 'Save', exact: true })).toHaveAttribute('title', 'Save project');
  const chooser = page.waitForEvent('filechooser');
  await project.getByRole('button', { name: 'Open', exact: true }).click();
  expect(await (await chooser).element().getAttribute('accept')).toBe('.lnscene,.json');
  await (await chooser).setFiles([]);
  await expect(page.locator('input[accept=".obj,.stl,.svg"]')).toHaveCount(1);
  await page.getByRole('button', { name: 'Cube', exact: true }).click();
  const saving = page.waitForEvent('download');
  await project.getByRole('button', { name: 'Save', exact: true }).click();
  const download = await saving;
  expect(download.suggestedFilename()).toBe('drawing.lnscene');
  const stream = await download.createReadStream();
  const chunks: Buffer[] = [];
  for await (const chunk of stream!) chunks.push(Buffer.from(chunk));
  const contents = Buffer.concat(chunks);
  expect(JSON.parse(contents.toString()).format).toBe('ln-studio');
  await page.getByRole('button', { name: 'Clear', exact: true }).click();
  await page.locator('input[accept=".lnscene,.json"]').setInputFiles({ name: 'drawing.lnscene', mimeType: 'application/json', buffer: contents });
  await expect(page.locator('.scene-tree-item')).toHaveCount(1);
  await page.getByRole('button', { name: 'Export SVG', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'Export SVG' });
  await expect(dialog.getByRole('button', { name: 'Download SVG' })).toBeEnabled();
  await expect(dialog.getByRole('button', { name: 'Copy SVG' })).toBeEnabled();
  await expect(dialog.getByLabel('SVG stroke width (mm)')).toBeVisible();
});

test('narrow panels and secondary actions support keyboard, backdrop dismissal and unchanged canvas state', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/');
  const scene = page.getByRole('button', { name: 'Scene', exact: true });
  await scene.click();
  const panel = page.getByRole('dialog', { name: 'Scene', exact: true });
  await expect(panel.getByRole('button', { name: 'Close scene panel' })).toBeFocused();
  await panel.getByRole('button', { name: 'Add Line Grid to scene', exact: true }).focus();
  await expect(panel.getByRole('tooltip')).toContainText('Grid of vertical lines');
  await panel.getByRole('button', { name: 'Cube', exact: true }).click();
  await page.keyboard.press('Escape');
  await expect(panel).toHaveCount(0);
  await expect(scene).toBeFocused();
  const canvas = await page.locator('.viewport').elementHandle();
  const snapshot = () => page.evaluate(async () => {
    const { useSceneStore } = await import('/src/lib/store.ts');
    const s = useSceneStore.getState(), h = useSceneStore.temporal.getState();
    return JSON.stringify({ nodes: s.nodes, cameras: s.cameras, history: h.pastStates });
  });
  const before = await snapshot();
  const properties = page.getByRole('button', { name: 'Properties', exact: true });
  await properties.click();
  const editor = page.getByRole('dialog', { name: 'Properties', exact: true });
  const close = editor.getByRole('button', { name: 'Close properties panel' });
  await expect(close).toBeFocused();
  await close.press('Shift+Tab');
  expect(await editor.evaluate(el => el.contains(document.activeElement))).toBe(true);
  await page.keyboard.press('Tab');
  await expect(close).toBeFocused();
  await page.mouse.click(385, 200);
  await expect(editor).toHaveCount(0);
  await expect(properties).toBeFocused();
  expect(await snapshot()).toBe(before);
  expect(await canvas!.evaluate(el => el.isConnected)).toBe(true);
  await properties.click();
  await page.setViewportSize({ width: 1440, height: 900 });
  await expect(editor).toHaveCount(0);
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(editor).toHaveCount(0);
  expect(await canvas!.evaluate(el => el.isConnected)).toBe(true);
  const more = page.getByRole('button', { name: 'More actions', exact: true });
  await more.focus();
  await more.press('ArrowDown');
  const menu = page.getByRole('dialog', { name: 'More actions', exact: true });
  await expect(menu.getByRole('button', { name: 'Open', exact: true })).toBeFocused();
  await page.keyboard.press('ArrowDown');
  await expect(menu.getByRole('button', { name: 'Save', exact: true })).toBeFocused();
  const saving = page.waitForEvent('download');
  await page.keyboard.press('Enter');
  expect((await saving).suggestedFilename()).toBe('drawing.lnscene');
  await expect(more).toBeFocused();
  await more.click();
  await menu.getByRole('button', { name: '1×2', exact: true }).click();
  await expect(page.locator('.viewport')).toHaveCount(2);
  await menu.getByRole('button', { name: 'Undo', exact: true }).click();
  await menu.getByRole('button', { name: 'Redo', exact: true }).click();
  await menu.getByRole('button', { name: 'Show grid', exact: true }).click();
  await expect(menu.getByRole('button', { name: 'Show grid', exact: true })).toHaveAttribute('aria-pressed', 'false');
  await menu.getByRole('button', { name: 'Grid settings', exact: true }).click();
  await menu.getByLabel('Spacing (mm)').fill('16');
  await menu.getByLabel('Spacing (mm)').press('Escape');
  await expect(menu).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(more).toBeFocused();
  await more.click();
  await page.mouse.click(10, 700);
  await expect(more).toHaveAttribute('aria-expanded', 'false');
});

test('short compact composition keeps its artwork while controls open and close', async ({ page }) => {
  await page.setViewportSize({ width: 640, height: 320 });
  await page.goto('/');
  await addPacked(page);
  await page.getByRole('button', { name: 'Properties', exact: true }).click();
  const editor = page.getByRole('dialog', { name: 'Properties', exact: true });
  await editor.getByRole('button', { name: 'Generate composition', exact: true }).click();
  await page.keyboard.press('Escape');
  await expect.poll(() => page.locator('.compose-art polyline').count()).toBeGreaterThan(0);
  const canvas = await page.locator('.compose-workspace').elementHandle();
  const artwork = await page.locator('.compose-art').innerHTML();
  await page.getByRole('button', { name: 'Properties', exact: true }).click();
  await editor.getByRole('button', { name: 'Close properties panel' }).click();
  expect(await canvas!.evaluate(el => el.isConnected)).toBe(true);
  expect(await page.locator('.compose-art').innerHTML()).toBe(artwork);
  expect((await page.locator('.compose-workspace').boundingBox())!.width).toBe(640);
  await page.getByRole('button', { name: 'Export SVG', exact: true }).click();
  const exported = page.getByRole('dialog', { name: 'Export SVG' });
  await expect(exported.getByRole('button', { name: 'Copy SVG' })).toBeEnabled();
  await exported.getByRole('button', { name: 'Copy SVG' }).scrollIntoViewIfNeeded();
  expect((await exported.boundingBox())!.height).toBeLessThan(320);
});

test.describe('coarse pointer controls', () => {
  test.use({ hasTouch: true });
  test('remain 40px with visibly labeled export at 320px and in landscape', async ({ page }) => {
    await page.setViewportSize({ width: 320, height: 740 });
    await page.goto('/');
    expect(await page.evaluate(() => matchMedia('(pointer: coarse)').matches)).toBe(true);
    for (const size of [{ width: 320, height: 740 }, { width: 640, height: 320 }, { width: 1440, height: 900 }]) {
      await page.setViewportSize(size);
      await expect(page.locator('.app')).toHaveAttribute('data-compact', String(size.width <= 1040));
      const heights = await page.locator('.toolbar button:visible').evaluateAll(buttons => buttons.map(b => b.getBoundingClientRect().height));
      expect(heights.every(height => height === 40)).toBe(true);
      const exportBox = await page.getByRole('button', { name: 'Export SVG', exact: true }).boundingBox();
      expect(exportBox!.x + exportBox!.width).toBeLessThanOrEqual(size.width);
      expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(size.width);
      await page.screenshot({ path: `tests/browser/chrome-touch-${size.width}.png`, animations: 'disabled' });
    }
  });
});

test('closing the Scene panel preserves an in-flight model import', async ({ page }) => {
  let release!: () => void;
  const ready = new Promise<void>(resolve => { release = resolve; });
  await page.route('**/models/suzanne.obj', async route => {
    await ready;
    await route.fulfill({ status: 200, contentType: 'text/plain', body: 'v 0 0 0\nv 1 0 0\nv 0 1 0\nf 1 2 3' });
  });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/');
  await page.getByRole('button', { name: 'Scene', exact: true }).click();
  const panel = page.getByRole('dialog', { name: 'Scene', exact: true });
  const requested = page.waitForRequest('**/models/suzanne.obj');
  await panel.getByRole('button', { name: 'Add Suzanne to scene', exact: true }).click();
  await requested;
  await panel.getByRole('button', { name: 'Close scene panel', exact: true }).click();
  await expect(panel).toHaveCount(0);
  release();
  await expect.poll(() => page.evaluate(async () => (await import('/src/lib/store.ts')).useSceneStore.getState().nodes.map(n => n.name))).toEqual(['Suzanne']);
  await page.getByRole('button', { name: 'Scene', exact: true }).click();
  await expect(panel.locator('.scene-tree-name')).toHaveText('Suzanne');
});
