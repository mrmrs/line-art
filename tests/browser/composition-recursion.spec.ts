import { test, expect } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import type { CompositionParams } from '../../src/lib/composition-types';

test('recursive assembly selection, pin preservation, refill, reload and plot export', async ({ page }) => {
  test.setTimeout(120000);
  const errors: string[]=[];
  page.on('pageerror',error=>errors.push(error.message));
  await page.goto('/');
  await page.getByRole('button',{name:'◈ Packed Composition',exact:true}).click();
  await page.getByRole('button',{name:/Recursive arcades/}).click();
  await expect(page.getByLabel('Nest in openings',{exact:true})).toBeChecked();
  await expect(page.getByLabel('Recursion depth',{exact:true})).toHaveValue('3');
  await page.getByLabel('Maximum forms',{exact:true}).fill('90');
  await page.locator('.compose-generate').getByRole('button',{name:'Generate composition',exact:true}).click();
  await expect(page.locator('.compose-generate [role=status]')).toContainText('coverage',{timeout:45000});
  const snapshot=()=>page.evaluate(async()=>{
    const {useSceneStore}=await import('/src/lib/store.ts');
    return useSceneStore.getState().nodes.find(n=>n.type==='packed-composition')!.params as unknown as CompositionParams;
  });
  const original=await snapshot();
  const child=original.instances.find(i=>i.parentId);
  expect(child,'recipe should visibly produce actual children').toBeTruthy();
  const childTarget=page.locator(`[data-instance-id="${child!.id}"]`);
  // Click inside a real child rail, verifying the enclosing frame's aperture
  // does not intercept the pointer despite their overlapping outer bounds.
  const hit=await childTarget.evaluate(element=>{
    const path=element as SVGPathElement;
    const first=(path.getAttribute('d')??'').split(/[Zz]/)[0];
    const coordinates=(first.match(/[-+]?(?:\d*\.)?\d+(?:[eE][-+]?\d+)?/g)??[]).map(Number);
    let x=0,y=0;for(let j=0;j<coordinates.length;j+=2){x+=coordinates[j];y+=coordinates[j+1];}
    const point=new DOMPoint(x/(coordinates.length/2),y/(coordinates.length/2)).matrixTransform(path.getScreenCTM()!);
    return {x:point.x,y:point.y};
  });
  await page.mouse.click(hit.x,hit.y);
  await expect(childTarget).toHaveAttribute('aria-pressed','true');
  await expect(page.locator(`[data-instance-id="${child!.parentId}"]`)).toHaveAttribute('aria-pressed','false');
  await page.getByRole('button',{name:'Select assembly',exact:true}).click();
  await page.getByRole('button',{name:'Keep selected',exact:true}).click();
  const kept=(await snapshot()).instances.filter(i=>i.pinned);
  expect(kept.length).toBeGreaterThan(1);
  expect(kept.some(i=>i.id===child!.parentId)).toBeTruthy();
  await page.getByLabel('Seed',{exact:true}).fill('2026');
  await page.locator('.compose-generate').getByRole('button',{name:'Generate composition',exact:true}).click();
  await expect(page.locator('.compose-generate [role=status]')).toContainText('coverage',{timeout:45000});
  const regenerated=await snapshot();
  for(const item of kept)expect(regenerated.instances.find(i=>i.id===item.id)).toEqual(item);
  const keptIds=new Set(kept.map(i=>i.id));
  expect(regenerated.instances.some(i=>i.parentId&&!keptIds.has(i.parentId)),
    'new frame assemblies should still recurse around the kept family').toBeTruthy();
  await page.getByRole('button',{name:'Refill gaps',exact:true}).click();
  await expect(page.locator('.compose-generate [role=status]')).toContainText('coverage',{timeout:45000});
  const filled=await snapshot();
  for(const item of regenerated.instances)expect(filled.instances.find(i=>i.id===item.id)).toEqual(item);
  expect(filled.instances.length).toBeLessThanOrEqual(90);
  await expect(page.getByRole('button',{name:'Cancel preview'})).toHaveCount(0,{timeout:45000});
  await expect(page.locator('.compose-error')).toHaveCount(0);
  await page.screenshot({path:'tests/browser/packed-recursive.png',fullPage:true});
  await page.waitForTimeout(700);
  await page.reload();
  await page.locator('.scene-tree-item').filter({hasText:'Packed Composition'}).click();
  expect(await snapshot()).toEqual(filled);
  await page.locator(`[data-instance-id="${child!.id}"]`).focus();
  await page.keyboard.press('Enter');
  await page.getByRole('button',{name:'Remove selected',exact:true}).click();
  const pruned=await snapshot();
  const removed=new Set([child!.id]);
  for(let pass=0;pass<5;pass++)for(const item of filled.instances)if(item.parentId&&removed.has(item.parentId))removed.add(item.id);
  expect(pruned.instances).toEqual(filled.instances.filter(i=>!removed.has(i.id)));
  expect(pruned.instances.some(i=>i.id===child!.parentId)).toBeTruthy();
  await page.getByTitle('Undo (Cmd+Z)',{exact:true}).click();
  expect(await snapshot()).toEqual(filled);
  await page.getByRole('button',{name:'Export composition',exact:true}).click();
  await page.getByRole('button',{name:'Generate SVG',exact:true}).click();
  await expect(page.getByText('SVG ready',{exact:true})).toBeVisible({timeout:45000});
  const downloadPromise=page.waitForEvent('download');
  await page.getByRole('button',{name:'Download SVG',exact:true}).click();
  const svg=await readFile((await (await downloadPromise).path())!,'utf8');
  expect(svg).toContain('width="210mm"');expect(svg).toContain('height="297mm"');
  expect(svg).toContain('<polyline');expect(svg).not.toMatch(/NaN|Infinity/);
  expect(errors).toEqual([]);
});
