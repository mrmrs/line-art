import { test, expect, addPacked } from './fixtures';
import type { Page } from '@playwright/test';

async function scene(page: Page) {
  await page.goto('/');
  await expect(page.locator('.viewport-paper')).toBeVisible();
  await page.evaluate(async () => {
    const { useSceneStore } = await import('/src/lib/store.ts');
    const s = useSceneStore.getState();
    s.clearScene(); s.addNode('sphere', 'Custom paper sphere', { center: [0, 0, 0], radius: 1 });
  });
  await expect.poll(() => page.locator('.viewport-svg polyline').count()).toBeGreaterThan(0);
}

async function exportDimensions(page: Page) {
  await page.getByRole('button', { name: 'Export SVG', exact: true }).click();
  const downloading = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Download SVG', exact: true }).click();
  const stream = await (await downloading).createReadStream();
  const chunks: Buffer[] = [];
  for await (const chunk of stream!) chunks.push(Buffer.from(chunk));
  const svg = Buffer.concat(chunks).toString();
  const dimensions = await page.evaluate(svg => {
    const root = new DOMParser().parseFromString(svg, 'image/svg+xml').documentElement;
    return { width: root.getAttribute('width'), height: root.getAttribute('height') };
  }, svg);
  await page.getByRole('button', { name: 'Close', exact: true }).click();
  return dimensions;
}

const frameRatio = async (page: Page) => {
  const bounds = (await page.locator('.viewport-paper').boundingBox())!;
  return bounds.width / bounds.height;
};

const openCustom = async (page: Page) => {
  await page.getByRole('button', { name: 'Custom paper size', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'Custom paper size', exact: true });
  await expect(dialog).toBeVisible();
  return dialog;
};

test('A4 orientation changes both the visible frame and downloaded physical dimensions', async ({ page }) => {
  await scene(page);
  await page.getByLabel('Paper size', { exact: true }).selectOption('A4');
  const orientation = page.getByRole('button', { name: 'Landscape orientation', exact: true });
  await expect(orientation).toHaveAttribute('aria-pressed', 'false');
  await expect(page.locator('.viewport-svg > svg')).toHaveAttribute('viewBox', '0 0 794 1123');
  expect(await frameRatio(page)).toBeCloseTo(794 / 1123, 3);
  expect(await exportDimensions(page)).toEqual({ width: '210mm', height: '297mm' });
  await orientation.click();
  await expect(orientation).toHaveAttribute('aria-pressed', 'true');
  await expect(page.locator('.viewport-svg > svg')).toHaveAttribute('viewBox', '0 0 1123 794');
  expect(await frameRatio(page)).toBeCloseTo(1123 / 794, 3);
  expect(await exportDimensions(page)).toEqual({ width: '297mm', height: '210mm' });
});

test('8 by 10 inch custom paper preserves physical size when displayed in millimetres or centimetres', async ({ page }) => {
  await scene(page);
  let dialog = await openCustom(page);
  await dialog.getByLabel('Paper units').selectOption('in');
  await dialog.getByLabel('Paper width', { exact: true }).fill('8');
  await dialog.getByLabel('Paper height', { exact: true }).fill('10');
  await page.screenshot({ path: 'tests/browser/custom-paper-popover.png' });
  await dialog.getByRole('button', { name: 'Apply', exact: true }).click();
  await expect(dialog).toHaveCount(0);
  await expect(page.getByLabel('Paper size', { exact: true })).toHaveValue('custom');
  await expect.poll(() => frameRatio(page)).toBeCloseTo(0.8, 3);
  await expect.poll(async () => {
    const box = await page.locator('.viewport-svg > svg').getAttribute('viewBox');
    return box?.split(' ').slice(2).map(value => Number(Number(value).toFixed(6)));
  }).toEqual([768, 960]);
  const before = await page.locator('.viewport-svg').innerHTML();
  dialog = await openCustom(page);
  await expect(dialog.getByLabel('Paper width', { exact: true })).toHaveValue('8');
  await expect(dialog.getByLabel('Paper height', { exact: true })).toHaveValue('10');
  await dialog.getByLabel('Paper units').selectOption('mm');
  await expect(dialog.getByLabel('Paper width', { exact: true })).toHaveValue('203.2');
  await expect(dialog.getByLabel('Paper height', { exact: true })).toHaveValue('254');
  await dialog.getByLabel('Paper units').selectOption('cm');
  await expect(dialog.getByLabel('Paper width', { exact: true })).toHaveValue('20.32');
  await expect(dialog.getByLabel('Paper height', { exact: true })).toHaveValue('25.4');
  await dialog.getByRole('button', { name: 'Apply', exact: true }).click();
  expect((await page.locator('.viewport-svg').innerHTML()) === before).toBe(true);
  expect(await exportDimensions(page)).toEqual({ width: '203.2mm', height: '254mm' });
  await page.getByRole('button', { name: 'Landscape orientation', exact: true }).click();
  await expect.poll(() => frameRatio(page)).toBeCloseTo(1.25, 3);
  expect(await exportDimensions(page)).toEqual({ width: '254mm', height: '203.2mm' });
});

test('invalid custom dimensions and cancelled drafts leave the current paper unchanged', async ({ page }) => {
  await scene(page);
  await page.getByLabel('Paper size', { exact: true }).selectOption('A4');
  await expect(page.locator('.viewport-svg > svg')).toHaveAttribute('viewBox', '0 0 794 1123');
  const dialog = await openCustom(page);
  for (const invalid of ['', '0', '-10', '2001']) {
    await dialog.getByLabel('Paper width', { exact: true }).fill(invalid);
    await expect(dialog.getByRole('button', { name: 'Apply', exact: true })).toBeDisabled();
    await expect(dialog.getByRole('alert')).toBeVisible();
    await expect(page.getByLabel('Paper size', { exact: true })).toHaveValue('A4');
    await expect(page.locator('.viewport-svg > svg')).toHaveAttribute('viewBox', '0 0 794 1123');
  }
  await dialog.getByLabel('Paper width', { exact: true }).fill('500');
  await expect(dialog.getByRole('button', { name: 'Apply', exact: true })).toBeEnabled();
  await page.keyboard.press('Escape');
  await expect(dialog).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Custom paper size', exact: true })).toBeFocused();
  const reopened = await openCustom(page);
  await expect(reopened.getByLabel('Paper width', { exact: true })).toHaveValue('210');
  await reopened.getByRole('button', { name: 'Cancel', exact: true }).click();
  await expect(page.getByLabel('Paper size', { exact: true })).toHaveValue('A4');
});

test('composition paper controls change its own physical page and preserve existing forms', async ({ page }) => {
  await page.goto('/');
  await addPacked(page);
  await expect(page.locator('.compose-paper')).toBeVisible();
  await page.locator('.compose-generate').getByRole('button', { name: 'Generate composition', exact: true }).click();
  await expect.poll(() => page.locator('.compose-hit').count()).toBeGreaterThan(0);
  const originalInstances = await page.evaluate(async () => {
    const { useSceneStore } = await import('/src/lib/store.ts');
    return useSceneStore.getState().nodes.find(n => n.type === 'packed-composition')!.params.instances;
  });
  await page.getByRole('button', { name: 'Landscape orientation', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Landscape orientation', exact: true })).toHaveAttribute('aria-pressed', 'true');
  const dialog = await openCustom(page);
  await dialog.getByLabel('Paper units').selectOption('in');
  await dialog.getByLabel('Paper width', { exact: true }).fill('8');
  await dialog.getByLabel('Paper height', { exact: true }).fill('10');
  await dialog.getByRole('button', { name: 'Apply', exact: true }).click();
  await expect.poll(() => page.evaluate(async () => {
    const { useSceneStore } = await import('/src/lib/store.ts');
    const p = useSceneStore.getState().nodes.find(n => n.type === 'packed-composition')!.params;
    return [p.widthMm, p.heightMm];
  })).toEqual([203.2, 254]);
  const paper = (await page.locator('.compose-paper').boundingBox())!;
  expect(paper.width / paper.height).toBeCloseTo(0.8, 3);
  expect(await page.evaluate(async () => {
    const { useSceneStore } = await import('/src/lib/store.ts');
    return useSceneStore.getState().nodes.find(n => n.type === 'packed-composition')!.params.instances;
  })).toEqual(originalInstances);
});
