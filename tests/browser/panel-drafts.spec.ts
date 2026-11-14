import { test, expect } from './fixtures';
import type { Page } from '@playwright/test';

test.use({ viewport: { width: 390, height: 844 } });

async function fixture(page: Page) {
  await page.goto('/');
  await expect(page.getByRole('button', { name: 'Properties', exact: true })).toBeVisible();
  await page.evaluate(async () => {
    const { useSceneStore } = await import('/src/lib/store.ts');
    const s = useSceneStore.getState();
    s.clearScene();
    s.addNode('sphere', 'Other sphere', { center: [0,0,0], radius: 3 });
    s.addNode('sphere', 'Draft sphere', { center: [0,0,0], radius: 1 });
    useSceneStore.temporal.getState().clear();
  });
  await page.getByRole('button', { name: 'Properties', exact: true }).click();
  await expect(page.getByRole('dialog', { name: 'Properties', exact: true })).toBeVisible();
}

async function pendingRadius(page: Page) {
  // Hold real rAF callbacks so dismissing the panel before its pending number
  // commit is deterministic; native input still exercises the React call site.
  await page.evaluate(() => {
    const originalRequest = window.requestAnimationFrame.bind(window);
    const originalCancel = window.cancelAnimationFrame.bind(window);
    let serial = 0;
    const pending = new Map<number, FrameRequestCallback>();
    window.requestAnimationFrame = callback => { const id = ++serial; pending.set(id, callback); return id; };
    window.cancelAnimationFrame = id => { pending.delete(id); };
    (window as unknown as { restoreDraftFrames: () => void }).restoreDraftFrames = () => {
      window.requestAnimationFrame = originalRequest; window.cancelAnimationFrame = originalCancel;
      for (const callback of pending.values()) callback(performance.now());
      pending.clear();
    };
    const row = [...document.querySelectorAll('.property-row')].find(row => row.querySelector('.property-label')?.textContent === 'Radius')!;
    const input = row.querySelector('input')!;
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(input, '2');
    input.dispatchEvent(new Event('input', { bubbles: true }));
    if (!pending.size) throw new Error('The real radius input did not schedule its draft commit');
  });
  await expect(page.locator('.property-row').filter({ has: page.locator('.property-label', { hasText: /^Radius$/ }) }).locator('input')).toHaveValue('2');
}

const values = (page: Page) => page.evaluate(async () => {
  const { useSceneStore } = await import('/src/lib/store.ts');
  return useSceneStore.getState().nodes.map(node => ({ name: node.name, radius: node.params.radius }));
});
const restore = (page: Page) => page.evaluate(() => (window as unknown as { restoreDraftFrames: () => void }).restoreDraftFrames());
const close = (page: Page) => page.evaluate(() => (document.querySelector('[aria-label="Close properties panel"]') as HTMLButtonElement).click());

test('dismissing Properties retains the last numeric edit until its animation frame', async ({ page }) => {
  await fixture(page); await pendingRadius(page);
  expect(await values(page)).toEqual([{name:'Other sphere',radius:3},{name:'Draft sphere',radius:1}]);
  await close(page);
  await expect(page.getByRole('dialog', { name: 'Properties', exact: true })).toHaveCount(0);
  await restore(page);
  expect(await values(page)).toEqual([{name:'Other sphere',radius:3},{name:'Draft sphere',radius:2}]);
  expect(await page.evaluate(async () => (await import('/src/lib/store.ts')).useSceneStore.temporal.getState().pastStates.length)).toBe(1);
});

test('switching to desktop flushes a pending numeric edit when the panel remounts', async ({ page }) => {
  await fixture(page); await pendingRadius(page);
  await page.setViewportSize({ width: 1280, height: 900 });
  await expect(page.getByRole('dialog', { name: 'Properties', exact: true })).toHaveCount(0);
  await expect.poll(() => values(page)).toEqual([{name:'Other sphere',radius:3},{name:'Draft sphere',radius:2}]);
  await restore(page);
  expect(await values(page)).toEqual([{name:'Other sphere',radius:3},{name:'Draft sphere',radius:2}]);
});

test('a pending edit follows its original layer when selection changes before the frame', async ({ page }) => {
  await fixture(page); await pendingRadius(page);
  await page.evaluate(async () => {
    const { useSceneStore } = await import('/src/lib/store.ts');
    const s = useSceneStore.getState();
    s.selectNode(s.nodes[0].id);
  });
  await expect(page.getByRole('textbox', { name: 'Layer title', exact: true })).toHaveValue('Other sphere');
  await restore(page);
  expect(await values(page)).toEqual([{name:'Other sphere',radius:3},{name:'Draft sphere',radius:2}]);
});

test('an external value supersedes a pending draft instead of being overwritten on dismissal', async ({ page }) => {
  await fixture(page); await pendingRadius(page);
  await page.evaluate(async () => {
    const { useSceneStore } = await import('/src/lib/store.ts');
    const s = useSceneStore.getState();
    s.updateNodeParams(s.nodes[1].id, { radius: 4 });
  });
  await expect(page.locator('.property-row').filter({ has: page.locator('.property-label', { hasText: /^Radius$/ }) }).locator('input')).toHaveValue('4');
  await close(page);
  await expect(page.getByRole('dialog', { name: 'Properties', exact: true })).toHaveCount(0);
  await restore(page);
  expect(await values(page)).toEqual([{name:'Other sphere',radius:3},{name:'Draft sphere',radius:4}]);
  expect(await page.evaluate(async () => (await import('/src/lib/store.ts')).useSceneStore.temporal.getState().pastStates.length)).toBe(1);
});
