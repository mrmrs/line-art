import { test, expect } from './fixtures';
import type { CompositionParams } from '../../src/lib/composition-types';

test('shared isometric preview keeps all box edges on three axes and free mode is an explicit regeneration choice', async ({ page }) => {
  const errors: string[]=[];
  page.on('pageerror',error=>errors.push(error.message));
  await page.goto('/');
  await page.getByRole('button',{name:'◈ Packed',exact:true}).click();
  await expect(page.getByLabel('Construction',{exact:true})).toHaveValue('shared');
  await page.getByLabel('Maximum forms',{exact:true}).fill('80');
  await page.getByLabel('Target coverage',{exact:true}).fill('0.35');
  await page.locator('.compose-generate').getByRole('button',{name:'Generate composition',exact:true}).click();
  await expect(page.locator('.compose-generate [role=status]')).toContainText('coverage',{timeout:30000});
  await expect.poll(()=>page.locator('.compose-art polyline').count(),{timeout:30000}).toBeGreaterThan(100);
  await expect(page.getByRole('button',{name:'Cancel preview'})).toHaveCount(0,{timeout:30000});
  const snapshot=()=>page.evaluate(async()=>{
    const {useSceneStore}=await import('/src/lib/store.ts');
    return useSceneStore.getState().nodes.find(n=>n.type==='packed-composition')!.params as unknown as CompositionParams;
  });
  const shared=await snapshot();
  expect(shared.instances.every(i=>i.construction==='shared')).toBeTruthy();
  const axes=await page.locator('.compose-art polyline').evaluateAll(elements=>{
    const directions=[[0,1],[Math.sqrt(3)/2,.5],[Math.sqrt(3)/2,-.5]];
    let total=0,offAxis=0;
    for(const element of elements) {
      const values=(element.getAttribute('points')??'').trim().split(/[\s,]+/).map(Number);
      for(let j=2;j<values.length;j+=2) {
        const dx=values[j]-values[j-2],dy=values[j+1]-values[j-1],length=Math.hypot(dx,dy);
        if(length<.05)continue;
        total++;
        // SVG decimal serialization may introduce tiny endpoint rounding.
        if(!directions.some(([x,y])=>Math.abs(dx*y-dy*x)<.015))offAxis++;
      }
    }
    return {total,offAxis};
  });
  expect(axes.total).toBeGreaterThan(100);
  expect(axes.offAxis).toBe(0);
  await page.screenshot({path:'tests/browser/packed-shared-construction.png',fullPage:true});
  await page.getByLabel('Construction',{exact:true}).selectOption('free');
  expect((await snapshot()).instances).toEqual(shared.instances);
  await page.locator('.compose-generate').getByRole('button',{name:'Generate composition',exact:true}).click();
  await expect(page.locator('.compose-generate [role=status]')).toContainText('coverage',{timeout:30000});
  const free=await snapshot();
  expect(free.instances.every(i=>i.construction==='free')).toBeTruthy();
  expect(free.instances.some(i=>Math.abs(i.angle/(Math.PI/2)-Math.round(i.angle/(Math.PI/2)))>.01)).toBeTruthy();
  await expect(page.getByRole('button',{name:'Cancel preview'})).toHaveCount(0,{timeout:30000});
  await expect(page.locator('.compose-error')).toHaveCount(0);
  await page.screenshot({path:'tests/browser/packed-free-construction.png',fullPage:true});
  await page.locator(`[data-instance-id="${free.instances[0].id}"]`).focus();
  await page.keyboard.press('Enter');
  await page.getByRole('button',{name:'Keep selected',exact:true}).click();
  const kept={...free.instances[0],pinned:true};
  await page.getByLabel('Construction',{exact:true}).selectOption('shared');
  expect((await snapshot()).instances.find(i=>i.id===kept.id)).toEqual(kept);
  await page.locator('.compose-generate').getByRole('button',{name:'Generate composition',exact:true}).click();
  await expect(page.locator('.compose-generate [role=status]')).toContainText('coverage',{timeout:30000});
  const mixed=await snapshot();
  expect(mixed.instances.find(i=>i.id===kept.id)).toEqual(kept);
  expect(mixed.instances.filter(i=>i.id!==kept.id).every(i=>i.construction==='shared')).toBeTruthy();
  expect(errors).toEqual([]);
});
