import { test, expect } from './fixtures';

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    const requests: { type: string; width: number; height: number }[] = [];
    (window as unknown as { paperRequests: typeof requests }).paperRequests = requests;
    const Original = window.Worker;
    window.Worker = class extends Original {
      postMessage(message: unknown, options?: StructuredSerializeOptions) {
        const value = message as { type: string; width: number; height: number };
        if (value.width) requests.push(value);
        super.postMessage(message, options);
      }
    };
  });
  await page.goto('/');
  await expect(page.locator('.viewport-paper')).toBeVisible();
  await page.evaluate(async () => {
    const { useSceneStore } = await import('/src/lib/store.ts');
    const s = useSceneStore.getState();
    s.clearScene(); s.addNode('sphere', 'Paper sphere', { center: [0,0,0], radius: 1 });
  });
  await expect.poll(() => page.locator('.viewport-svg polyline').count()).toBeGreaterThan(0);
  await expect(page.locator('.viewport-rendering')).toHaveCount(0);
});

test('paper frame and render projection match export dimensions in perspective and orthographic views', async ({ page }) => {
  for (const ortho of [false, true]) {
    await page.evaluate(async ortho => {
      const { useSceneStore } = await import('/src/lib/store.ts');
      useSceneStore.getState().updateCamera(0, { ortho });
    }, ortho);
    for (const [key, width, height] of [['square',1024,1024],['A4',794,1123],['A4L',1123,794],['letter',816,1056]] as const) {
      await page.getByLabel('Paper size', { exact: true }).selectOption(key);
      await expect(page.locator('.viewport-paper')).toHaveAttribute('data-paper-size',key);
      await expect(page.locator('.viewport-svg > svg')).toHaveAttribute('viewBox',`0 0 ${width} ${height}`);
      const matchesExportProjection = await page.evaluate(async ({ width, height }) => {
        const { useSceneStore } = await import('/src/lib/store.ts');
        const { renderScenePerPen, multiPenSvg } = await import('/src/lib/render.ts');
        const s = useSceneStore.getState();
        const { penGroups } = renderScenePerPen(s.nodes, s.cameras[0], width, height, s.renderSettings);
        const exportSvg = new DOMParser().parseFromString(multiPenSvg(penGroups, width, height, s.renderSettings, {}), 'image/svg+xml');
        const points = (root: ParentNode) => [...root.querySelectorAll('polyline')].map(p => p.getAttribute('points')).sort();
        return JSON.stringify(points(exportSvg)) === JSON.stringify(points(document.querySelector('.viewport-svg')!));
      }, { width, height });
      expect(matchesExportProjection).toBe(true);
      const frame = (await page.locator('.viewport-paper').boundingBox())!;
      const viewport = (await page.locator('.viewport').boundingBox())!;
      expect(frame.width / frame.height).toBeCloseTo(width / height, 3);
      expect(frame.x).toBeGreaterThan(viewport.x + 20);
      expect(frame.y).toBeGreaterThan(viewport.y + 20);
      expect(frame.x + frame.width).toBeLessThan(viewport.x + viewport.width - 20);
      expect(frame.y + frame.height).toBeLessThan(viewport.y + viewport.height - 20);
    }
  }
});

test('millimetre grid updates without rendering geometry and stays outside SVG export', async ({ page }) => {
  const before = await page.locator('.viewport-svg').innerHTML();
  const requestsBefore = await page.evaluate(() => (window as unknown as {paperRequests: unknown[]}).paperRequests.length);
  await page.evaluate(async () => {
    const { useViewSettings } = await import('/src/lib/view-settings.ts');
    const view = useViewSettings.getState();
    view.setGridVisible(true); view.setGridSpacingMm(25); view.setGridColor('#ff0000');
  });
  const grid = page.locator('.paper-grid');
  await expect(grid).toHaveAttribute('viewBox', '0 0 250 250');
  await expect(grid.locator('pattern')).toHaveAttribute('width', '25');
  await expect(grid.locator('path')).toHaveAttribute('stroke', '#ff0000');
  await page.evaluate(async () => (await import('/src/lib/view-settings.ts')).useViewSettings.getState().setGridStyle('dots'));
  await expect(grid.locator('circle')).toHaveCount(1);
  expect((await page.locator('.viewport-svg').innerHTML()) === before).toBe(true);
  expect(await page.evaluate(() => (window as unknown as {paperRequests: unknown[]}).paperRequests.length)).toBe(requestsBefore);
  await page.getByRole('button', { name: 'Export SVG', exact: true }).click();
  await page.getByRole('button', { name: 'Generate SVG', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Download SVG', exact: true })).toBeEnabled();
  const download = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Download SVG', exact: true }).click();
  const stream = await (await download).createReadStream();
  const chunks: Buffer[] = [];
  for await (const chunk of stream!) chunks.push(Buffer.from(chunk));
  const svg = Buffer.concat(chunks).toString();
  expect(svg).not.toContain('pattern');
  expect(svg).not.toContain('#ff0000');
  expect(svg).toContain('width="250mm"');
});

test('selecting a camera chooses the visible export view without consuming undo history', async ({ page }) => {
  await page.evaluate(async () => {
    const { useSceneStore } = await import('/src/lib/store.ts');
    useSceneStore.getState().setViewMode('2x2');
    useSceneStore.temporal.getState().clear();
  });
  const top = page.getByRole('region', { name: 'Top canvas', exact: true });
  await top.focus();
  await expect(page.locator('.viewport[data-active="true"] .viewport-camera-name')).toHaveText('Top');
  expect(await page.evaluate(async () => (await import('/src/lib/store.ts')).useSceneStore.temporal.getState().pastStates.length)).toBe(0);
  await page.evaluate(async () => (await import('/src/lib/store.ts')).useSceneStore.getState().setViewMode('single'));
  await expect(page.getByRole('region', { name: 'Top canvas', exact: true })).toHaveCount(1);
  await expect(page.locator('.viewport')).toHaveCount(1);
  await page.evaluate(async () => (await import('/src/lib/store.ts')).useSceneStore.getState().setViewMode('1x2'));
  expect(await page.evaluate(async () => (await import('/src/lib/store.ts')).useSceneStore.getState().activeCameraIndex)).toBe(0);
  await expect(page.locator('.viewport[data-active="true"] .viewport-camera-name')).toHaveText('Hero');
});
