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
  await expect(dialog.getByRole('button', { name: 'Copy SVG' })).toBeEnabled();
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

test('copy works before download and renders changed settings with one count per delivery', async ({ page }) => {
  const downloads: string[] = [], posts: string[] = [], errors: string[] = [];
  page.on('download', download => downloads.push(download.suggestedFilename()));
  page.on('pageerror', error => errors.push(error.message));
  await page.route('https://ts-gen-count.adam-f8f.workers.dev/**', route => {
    if (route.request().method() === 'POST') posts.push(new URL(route.request().url()).searchParams.get('name')!);
    return route.fulfill({ status: 200, contentType: 'text/plain', body: '123' });
  });
  await page.goto('/');
  await page.evaluate(() => Object.defineProperty(navigator, 'clipboard', { configurable: true, value: {
    write: async (items: ClipboardItem[]) => {
      const activated = navigator.userActivation.isActive;
      const text = await (await items[0].getType('text/plain')).text();
      document.documentElement.dataset.copiedSvg = text;
      document.documentElement.dataset.copyActivated = String(activated);
    },
  } }));
  await page.getByRole('button', { name: 'Cube', exact: true }).click();
  await page.getByRole('button', { name: 'Export SVG', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'Export SVG' });
  for (const [index, width] of [0.5, 0.8].entries()) {
    await dialog.getByLabel('SVG stroke width (mm)').fill(String(width));
    await expect(dialog.getByRole('button', { name: 'Download SVG', exact: true })).toBeEnabled();
    await dialog.getByRole('button', { name: 'Copy SVG', exact: true }).click();
    await expect(dialog.getByRole('status')).toHaveText('SVG copied');
    const svg = await page.locator('html').getAttribute('data-copied-svg');
    expect(svg).toContain('<svg');
    expect(svg).toContain('skullcat-provenance');
    expect(Number(svg!.match(/stroke-width="([^"]+)"/)?.[1])).toBeCloseTo(width * 1024 / 250, 8);
    await expect(page.locator('html')).toHaveAttribute('data-copy-activated', 'true');
    await expect.poll(() => posts.length).toBe(index + 1);
  }
  expect(posts).toEqual(['SKULLCAT_SVG_EXPORT', 'SKULLCAT_SVG_EXPORT']);
  expect(downloads).toEqual([]);
  expect(errors).toEqual([]);
});

test('copy can be cancelled while rendering and retried without a stale delivery', async ({ page }) => {
  const copies: string[] = [], errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.exposeFunction('captureCopy', (text: string) => copies.push(text));
  await page.addInitScript(() => {
    const OriginalWorker = window.Worker;
    let holdNextExport = true;
    window.Worker = class extends OriginalWorker {
      constructor(url: string | URL, options?: WorkerOptions) {
        super(url, options);
        if (String(url).includes('export-worker') && holdNextExport) {
          holdNextExport = false;
          this.postMessage = () => {};
        }
      }
    };
    Object.defineProperty(navigator, 'clipboard', { configurable: true, value: {
      write: async (items: ClipboardItem[]) => {
        const text = await (await items[0].getType('text/plain')).text();
        await (window as unknown as { captureCopy: (svg: string) => Promise<void> }).captureCopy(text);
      },
    } });
  });
  await page.goto('/');
  await page.getByRole('button', { name: 'Cube', exact: true }).click();
  await page.getByRole('button', { name: 'Export SVG', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'Export SVG' });
  await dialog.getByRole('button', { name: 'Copy SVG', exact: true }).click();
  await expect(dialog.getByRole('button', { name: 'Copy SVG', exact: true })).toBeDisabled();
  await expect(dialog.getByRole('button', { name: 'Download SVG', exact: true })).toBeDisabled();
  await dialog.getByRole('button', { name: 'Cancel export' }).click();
  await expect(dialog.getByRole('status')).toHaveText('Export cancelled.');
  await expect(dialog.getByRole('alert')).toHaveCount(0);
  expect(copies).toEqual([]);
  await dialog.getByRole('button', { name: 'Copy SVG', exact: true }).click();
  await expect(dialog.getByRole('status')).toHaveText('SVG copied');
  expect(copies).toHaveLength(1);
  expect(errors).toEqual([]);
});
