import { test, expect } from './fixtures';

test('shape randomize is undoable and cube grids expose face fills', async ({ page }) => {
  await page.goto('/');
  await page.evaluate(async () => {
    const { useSceneStore, storageReady } = await import('/src/lib/store.ts');
    await storageReady;
    const t = await import('/src/lib/types.ts');
    useSceneStore.getState().loadNodes([{name:'Filled grid',type:'cube-grid',params:{...t.DEFAULT_CUBE_GRID_PARAMS,countX:2,countY:2,countZ:2},visible:true,transform:t.DEFAULT_TRANSFORM,slicing:t.DEFAULT_SLICING}]);
  });
  const before = await page.evaluate(async () => (await import('/src/lib/store.ts')).useSceneStore.getState().nodes[0].params);
  await page.getByRole('button', { name: 'Randomize', exact: true }).click();
  await expect.poll(() => page.evaluate(async () => (await import('/src/lib/store.ts')).useSceneStore.getState().nodes[0].params)).not.toEqual(before);
  await page.evaluate(async () => (await import('/src/lib/store.ts')).useSceneStore.temporal.getState().undo());
  expect(await page.evaluate(async () => (await import('/src/lib/store.ts')).useSceneStore.getState().nodes[0].params)).toEqual(before);
  await page.locator('.fill-add-buttons').getByRole('button', { name:'Surface', exact:true }).click();
  await expect(page.getByText('Surface hatch', {exact:true})).toBeVisible();
  await page.locator('.fill-card select').selectOption('z');
  await expect.poll(() => page.locator('.viewport-svg polyline').count()).toBeGreaterThan(12);
  expect(await page.evaluate(async () => (await import('/src/lib/store.ts')).useSceneStore.getState().nodes[0].fills?.[0].faceAxis)).toEqual('z');
});

test('composition randomize regenerates fresh settings and preserves kept forms', async ({ page }) => {
  await page.goto('/');
  const kept = await page.evaluate(async () => {
    const { useSceneStore, storageReady } = await import('/src/lib/store.ts');
    await storageReady;
    const t = await import('/src/lib/types.ts');
    const { DEFAULT_COMPOSITION } = await import('/src/lib/composition-types.ts');
    const { packComposition } = await import('/src/lib/composition.ts');
    const params = {...DEFAULT_COMPOSITION,widthMm:80,heightMm:80,marginMm:5,minSizeMm:5,maxSizeMm:15,maxInstances:20};
    const form = {...packComposition(params).instances[0],pinned:true};
    useSceneStore.getState().loadNodes([{name:'Explore',type:'packed-composition',params:{...params,instances:[form]},visible:true,transform:t.DEFAULT_TRANSFORM,slicing:t.DEFAULT_SLICING}]);
    return form;
  });
  await page.getByRole('button', {name:'Randomize',exact:true}).click();
  await expect.poll(() => page.evaluate(async () => {
    const { useSceneStore } = await import('/src/lib/store.ts');
    return useSceneStore.getState().nodes[0].params.instances.length;
  })).toBeGreaterThan(1);
  expect(await page.evaluate(async id => {
    const { useSceneStore } = await import('/src/lib/store.ts');
    return useSceneStore.getState().nodes[0].params.instances.find(i => i.id === id);
  }, kept.id)).toEqual(kept);
  await expect(page.getByText('Settings changed. Generate again to use the new settings.')).toHaveCount(0);
  await page.evaluate(async () => (await import('/src/lib/store.ts')).useSceneStore.temporal.getState().undo());
  expect(await page.evaluate(async () => (await import('/src/lib/store.ts')).useSceneStore.getState().nodes[0].params.instances)).toEqual([kept]);
});
