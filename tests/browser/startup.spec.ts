import { test, expect } from './fixtures';

test.use({ emptyScene: false });

// Only scene construction uses these random values. Avoid replacing Math.random,
// which would also change unrelated library IDs and renderer behavior.
async function seedStarter(page: import('@playwright/test').Page, kind: number) {
  await page.route('**/src/lib/starter-scene.ts', async route => {
    const response = await route.fetch();
    const body = await response.text();
    await route.fulfill({ response, body: body.replace('random = Math.random', `random = () => ${kind}`) });
  });
}

for (const [kind, shape] of [[0.1, 'line-grid'], [0.5, 'cube-grid'], [0.9, 'mesh']] as const) {
  test(`fresh ${shape} scene is visible with a clean undo baseline`, async ({ page }) => {
    await seedStarter(page, kind);
    await page.emulateMedia({ colorScheme: 'dark' });
    await page.goto('/');
    await expect(page.getByRole('button', { name: 'Undo', exact: true })).toBeDisabled();
    await expect.poll(() => page.locator('.viewport-svg polyline').count()).toBeGreaterThan(0);
    const initial = await page.evaluate(async () => {
      const { useSceneStore } = await import('/src/lib/store.ts');
      const { nodes, renderSettings } = useSceneStore.getState();
      return { nodes, renderSettings };
    });
    expect(initial.nodes).toHaveLength(1);
    expect(initial.nodes[0].type).toBe(shape);
    expect(initial.renderSettings.strokeColor).toBe('#ffffff');
    expect(initial.renderSettings.backgroundColor).toBe('#141414');
    await page.evaluate(async () => {
      const { useSceneStore } = await import('/src/lib/store.ts');
      useSceneStore.getState().selectNode(null);
      useSceneStore.getState().bumpRenderVersion();
    });
    await expect(page.getByRole('button', { name: 'Undo', exact: true })).toBeDisabled();
    await page.getByRole('button', { name: 'Cube', exact: true }).click();
    await expect(page.getByRole('button', { name: 'Undo', exact: true })).toBeEnabled();
    await page.getByRole('button', { name: 'Undo', exact: true }).click();
    await expect(page.getByRole('button', { name: 'Undo', exact: true })).toBeDisabled();
    await page.evaluate(async () => {
      const { flushSceneSave } = await import('/src/lib/store.ts');
      await flushSceneSave();
    });
    await page.reload();
    await expect(page.getByRole('button', { name: 'Undo', exact: true })).toBeDisabled();
    expect(await page.evaluate(async () => {
      const { useSceneStore } = await import('/src/lib/store.ts');
      return useSceneStore.getState().nodes;
    })).toEqual(initial.nodes);
  });
}

test('no recognized system preference falls back to dark before and after loading', async ({ page }) => {
  await page.addInitScript(() => {
    const matchMedia = window.matchMedia.bind(window);
    window.matchMedia = query => {
      const media = matchMedia(query);
      if (query.includes('prefers-color-scheme')) Object.defineProperty(media, 'matches', { value: false });
      return media;
    };
  });
  await seedStarter(page, 0.1);
  await page.route('**/src/main.tsx', route => route.abort());
  await page.goto('/');
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  await page.unroute('**/src/main.tsx');
  await page.reload();
  await expect(page.getByRole('button', { name: 'Switch to light mode', exact: true })).toBeVisible();
  expect(await page.evaluate(() => localStorage.getItem('skullcat-theme'))).toBeNull();
});

test('saved light preference creates light artwork and an empty saved project stays empty', async ({ page }) => {
  await page.emulateMedia({ colorScheme: 'dark' });
  await page.addInitScript(() => localStorage.setItem('skullcat-theme', 'light'));
  await seedStarter(page, 0.1);
  await page.goto('/');
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
  await expect.poll(() => page.locator('.viewport-svg polyline').count()).toBeGreaterThan(0);
  await page.evaluate(async () => {
    const { useSceneStore, flushSceneSave } = await import('/src/lib/store.ts');
    if (useSceneStore.getState().renderSettings.backgroundColor !== '#ffffff') throw new Error('Expected light paper');
    useSceneStore.getState().clearScene();
    await flushSceneSave();
  });
  await page.reload();
  await expect(page.getByRole('button', { name: 'Undo', exact: true })).toBeDisabled();
  expect(await page.evaluate(async () => (await import('/src/lib/store.ts')).useSceneStore.getState().nodes)).toEqual([]);
});

test('a failed Suzanne download falls back to editable line art', async ({ page }) => {
  await seedStarter(page, 0.9);
  await page.route('**/models/suzanne.obj', route => route.abort());
  await page.goto('/');
  await expect.poll(() => page.locator('.viewport-svg polyline').count()).toBeGreaterThan(0);
  await expect(page.getByRole('button', { name: 'Undo', exact: true })).toBeDisabled();
  expect(await page.evaluate(async () => (await import('/src/lib/store.ts')).useSceneStore.getState().nodes[0].type)).toBe('line-grid');
});

test('unavailable scene storage still opens dark starter artwork with an empty history', async ({ page }) => {
  await page.emulateMedia({ colorScheme: 'dark' });
  await seedStarter(page, 0.1);
  await page.addInitScript(() => {
    IDBFactory.prototype.open = () => { throw new Error('Scene storage unavailable'); };
  });
  await page.goto('/');
  await expect(page.getByRole('alert')).toContainText('Scene storage unavailable');
  await expect.poll(() => page.locator('.viewport-svg polyline').count()).toBeGreaterThan(0);
  await expect(page.getByRole('button', { name: 'Undo', exact: true })).toBeDisabled();
  expect(await page.evaluate(async () => (await import('/src/lib/store.ts')).useSceneStore.getState().renderSettings.backgroundColor)).toBe('#141414');
});
