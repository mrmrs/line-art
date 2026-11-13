import { test, expect } from './fixtures';

test('one download action renders SVG with physical stroke width and no timing controls', async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('ln-plot-settings', JSON.stringify({ drawSpeed: 0, travelSpeed: 0, liftSeconds: null, minimumGapMm: 100 })));
  await page.goto('/');
  await page.evaluate(async () => {
    const { useSceneStore } = await import('/src/lib/store.ts');
    useSceneStore.getState().addNode('cube', 'Export fixture', { min: [-1, -1, -1], max: [1, 1, 1] });
  });
  await page.getByRole('button', { name: 'Export SVG', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'Export SVG' });
  await expect(dialog.getByRole('button', { name: 'Generate SVG' })).toHaveCount(0);
  await expect(dialog.getByLabel(/Drawing speed|Travel speed|Lift time|Pen diameter|Minimum clearance/)).toHaveCount(0);
  await expect(dialog.getByRole('button', { name: 'Copy SVG' })).toHaveCount(0);
  await dialog.getByLabel('SVG stroke width (mm)').fill('0.5');
  const downloading = page.waitForEvent('download');
  await dialog.getByRole('button', { name: 'Download SVG', exact: true }).click();
  const stream = await (await downloading).createReadStream();
  const chunks: Buffer[] = [];
  for await (const chunk of stream!) chunks.push(Buffer.from(chunk));
  const svg = Buffer.concat(chunks).toString('utf8');
  expect(Number(svg.match(/stroke-width="([^"]+)"/)?.[1])).toBeCloseTo(0.5 * 1024 / 250, 8);
  await expect(dialog.getByRole('status')).toHaveText('SVG downloaded');
  await expect(dialog.getByRole('button', { name: 'Copy SVG' })).toBeEnabled();
  await expect(dialog.getByRole('alert')).toHaveCount(0);
  await page.screenshot({ path: 'tests/browser/export-dialog.png' });
});

test('a worker startup failure leaves download available for retry', async ({ page }) => {
  await page.addInitScript(() => {
    const OriginalWorker = window.Worker;
    let failNextExport = true;
    window.Worker = class extends OriginalWorker {
      constructor(url: string | URL, options?: WorkerOptions) {
        if (String(url).includes('export-worker') && failNextExport) {
          failNextExport = false;
          throw new Error('Worker unavailable');
        }
        super(url, options);
      }
    };
  });
  await page.goto('/');
  await page.getByRole('button', { name: 'Export SVG', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'Export SVG' });
  await dialog.getByRole('button', { name: 'Download SVG', exact: true }).click();
  await expect(dialog.getByRole('alert')).toContainText('Worker unavailable');
  const downloading = page.waitForEvent('download');
  await dialog.getByRole('button', { name: 'Download SVG', exact: true }).click();
  await downloading;
  await expect(dialog.getByRole('alert')).toHaveCount(0);
});
