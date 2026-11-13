import { test, expect } from './fixtures';

const endpoint = 'https://ts-gen-count.adam-f8f.workers.dev/**';

test('counts accepted imports and export deliveries, never generation or failed clipboard', async ({ page }) => {
  const posts: string[] = [], gets: string[] = [];
  let exportTotal = 100;
  await page.route(endpoint, route => {
    const request = route.request(), key = new URL(request.url()).searchParams.get('name')!;
    if (request.method() === 'POST') { posts.push(key); if (key === 'SKULLCAT_SVG_EXPORT') exportTotal++; }
    else gets.push(key);
    return route.fulfill({status:200,contentType:'text/plain',body:String(key === 'SKULLCAT_SVG_EXPORT' ? exportTotal : 5)});
  });
  await page.goto('/');
  await expect.poll(() => new Set(gets).size).toBe(4);
  const input = page.locator('input[accept=".obj,.stl,.svg"]');
  const files = [
    {name:'triangle.obj',mimeType:'text/plain',buffer:Buffer.from('v 0 0 0\nv 1 0 0\nv 0 1 0\nf 1 2 3')},
    {name:'triangle.stl',mimeType:'text/plain',buffer:Buffer.from('solid triangle\nfacet normal 0 0 1\nouter loop\nvertex 0 0 0\nvertex 1 0 0\nvertex 0 1 0\nendloop\nendfacet\nendsolid triangle')},
    {name:'triangle.svg',mimeType:'image/svg+xml',buffer:Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"><path d="M0 0L100 0L100 100Z"/></svg>')},
  ];
  await input.setInputFiles(files);
  await expect.poll(() => posts.length).toBe(3);
  expect(posts).toEqual(['SKULLCAT_OBJ_IMPORT','SKULLCAT_STL_IMPORT','SKULLCAT_SVG_IMPORT']);
  await input.setInputFiles({name:'bad.svg',mimeType:'image/svg+xml',buffer:Buffer.from('not svg')});
  await expect(page.locator('.app-error')).toBeVisible();
  expect(posts.length).toBe(3);
  await page.getByRole('button',{name:'Dismiss',exact:true}).click();
  await page.getByRole('button',{name:'Export SVG',exact:true}).click();
  expect(posts.length).toBe(3);
  const download = page.waitForEvent('download');
  await page.getByRole('button',{name:'Download SVG',exact:true}).click();
  await download;
  await expect.poll(() => posts.length).toBe(4);
  await expect(page.getByText('101 SVG exports worldwide')).toBeVisible();
  await page.evaluate(() => Object.defineProperty(navigator, 'clipboard', { configurable:true, value:{writeText:async () => { throw new Error('clipboard denied'); }} }));
  await page.getByRole('button',{name:'Copy SVG',exact:true}).click();
  await expect(page.locator('.export-error')).toContainText('clipboard denied');
  expect(posts.length).toBe(4);
  await page.evaluate(() => Object.defineProperty(navigator, 'clipboard', { configurable:true, value:{writeText:async () => {}} }));
  await page.getByRole('button',{name:'Copy SVG',exact:true}).click();
  await expect.poll(() => posts.length).toBe(5);
  await expect(page.getByText('102 SVG exports worldwide')).toBeVisible();
});

test('offline counters do not block imports or export', async ({ page }) => {
  await page.route(endpoint, route => route.abort('internetdisconnected'));
  await page.goto('/');
  await page.locator('input[accept=".obj,.stl,.svg"]').setInputFiles({name:'offline.obj',mimeType:'text/plain',buffer:Buffer.from('v 0 0 0\nv 1 0 0\nv 0 1 0\nf 1 2 3')});
  await expect(page.getByText('offline.obj',{exact:true}).first()).toBeVisible();
  await page.getByRole('button',{name:'Export SVG',exact:true}).click();
  const download = page.waitForEvent('download');
  await page.getByRole('button',{name:'Download SVG',exact:true}).click();
  await download;
  await expect(page.locator('.export-error')).toHaveCount(0);
});
