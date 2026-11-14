import { test, expect, type Page } from './fixtures';

const baseline = process.env.NAV_BASELINE === '1';

async function instrument(page: Page, responseDelay = 0) {
  await page.addInitScript(({responseDelay}) => {
    const fingerprint=(svg: string)=>{
      let hash=2166136261,count=0;
      for(const match of svg.matchAll(/<polyline\b[^>]*\bpoints="([^"]*)"/g)) {
        count++;const points=match[1];
        for(let j=0;j<points.length;j+=17)hash=Math.imul(hash^points.charCodeAt(j),16777619);
        hash=Math.imul(hash^points.length,16777619);
      }
      return `${count}:${hash>>>0}`;
    };
    const metrics = { requests: [] as { id: number; t: number; zoom: number; interactive: boolean }[],
      results: [] as { id: number; t: number; final: boolean; renderMs: number; fingerprint: string }[],
      paints: [] as { t: number; hash: number; fingerprint: string }[], raf: [] as number[], transforms: [] as { t: number; transform: string; svgVersion: number }[], cameraCommits: [] as number[] };
    (window as unknown as { navMetrics: typeof metrics }).navMetrics = metrics;
    const Original = window.Worker;
    window.Worker = class extends Original {
      constructor(url: string | URL, options?: WorkerOptions) {
        super(url, options);
        if (!String(url).includes('render-worker')) return;
        if(responseDelay>0) {
          let handler: ((this: Worker,event: MessageEvent)=>unknown) | null=null;
          Object.defineProperty(this,'onmessage',{get:()=>handler,set:value=>{handler=value;}});
          this.addEventListener('message',event=>{
            const receive=handler;if(!receive)return;
            if(event.data.type==='result')setTimeout(()=>receive.call(this,event),responseDelay);
            else receive.call(this,event);
          });
        }
        this.addEventListener('message', e => {
          if (e.data.type === 'result') metrics.results.push({ id: e.data.id, t: performance.now(), final: e.data.isFinal, renderMs: e.data.renderTimeMs, fingerprint: fingerprint(e.data.svg) });
        });
      }
      postMessage(message: unknown, options?: StructuredSerializeOptions) {
        const m = message as { type?: string; id: number; camera?: { zoom?: number }; interactive?: boolean };
        if (m.type === 'render') metrics.requests.push({ id: m.id, t: performance.now(), zoom: m.camera?.zoom ?? 1, interactive: !!m.interactive });
        super.postMessage(message, options);
      }
    };
    window.addEventListener('DOMContentLoaded', () => {
      let lastSvg = '', lastTransform = '', lastSvgNode: Element | null = null;
      const frame = (t: number) => {
        metrics.raf.push(t);
        const svg = document.querySelector('.viewport-svg');
        if (svg) {
          const currentSvgNode=svg.firstElementChild;
          const text=currentSvgNode!==lastSvgNode?svg.innerHTML:lastSvg;
          lastSvgNode=currentSvgNode;
          if (text && text !== lastSvg) {
            let hash = 2166136261;
            for (let j=0;j<text.length;j+=17) hash = Math.imul(hash ^ text.charCodeAt(j),16777619);
            metrics.paints.push({ t, hash: hash >>> 0, fingerprint: fingerprint(text) }); lastSvg=text;
          }
          const transform=getComputedStyle(svg).transform;
          if(transform!==lastTransform){metrics.transforms.push({t,transform,svgVersion:metrics.paints.length});lastTransform=transform;}
        }
        requestAnimationFrame(frame);
      };
      requestAnimationFrame(frame);
    });
  },{responseDelay});
}
async function fixture(page: Page) {
  await page.goto('/');
  await page.evaluate(async () => {
    const {useSceneStore, storageReady}=await import('/src/lib/store.ts');
    await storageReady;
    const t=await import('/src/lib/types.ts');
    const s=useSceneStore.getState();
    s.clearScene();
    s.addNode('cube-grid','Navigation load',{...t.DEFAULT_CUBE_GRID_PARAMS,countX:12,countY:12,countZ:12});
    s.addNode('sphere','Navigation sphere',{center:[0,0,0],radius:1.25});
    s.updateCamera(0,{eye:[10,8,7],center:[0,0,0],up:[0,0,1],ortho:true,orthoSize:5,zoom:1});
  });
  await expect.poll(()=>page.locator('.viewport-svg polyline').count(),{timeout:30000}).toBeGreaterThan(100);
  await expect(page.locator('.viewport-rendering')).toHaveCount(0,{timeout:30000});
}
const camera = (page: Page) => page.evaluate(async () => {
  const {useSceneStore}=await import('/src/lib/store.ts');return useSceneStore.getState().cameras[0];
});

test('dense scene orbit presents live frames rather than starving behind newer input', async ({page},testInfo) => {
  test.setTimeout(90000);
  await instrument(page);await fixture(page);
  await page.evaluate(async()=>{
    const {useSceneStore}=await import('/src/lib/store.ts');
    useSceneStore.temporal.getState().clear();
    const metrics=(window as unknown as {navMetrics:{cameraCommits:number[]}}).navMetrics;
    useSceneStore.subscribe((state,previous)=>{if(state.cameras[0]!==previous.cameras[0])metrics.cameraCommits.push(performance.now());});
  });
  const overlay=page.locator('.viewport-overlay').first(),box=(await overlay.boundingBox())!;
  const x=box.x+box.width*.4,y=box.y+box.height*.5;
  const start=await page.evaluate(()=>performance.now());
  await page.mouse.move(x,y);await page.mouse.down();
  for(let j=1;j<=60;j++) {
    await page.mouse.move(x+j*2.5,y+Math.sin(j/14)*32);
    await page.waitForTimeout(16);
  }
  const duringHistory=await page.evaluate(async()=>{
    const {useSceneStore}=await import('/src/lib/store.ts');return useSceneStore.temporal.getState().pastStates.length;
  });
  const measuredEnd=await page.evaluate(()=>performance.now());
  await page.screenshot({path:'tests/browser/navigation-preview.png'});
  const release=await page.evaluate(()=>performance.now());
  await page.mouse.up();
  await expect(page.locator('.viewport-rendering')).toHaveCount(0,{timeout:30000});
  if(!baseline)await expect(page.locator('.viewport-svg').first()).toHaveAttribute('data-preview','false');
  await page.waitForTimeout(80);
  const summary=await page.evaluate(({start,measuredEnd,release})=>{
    const m=(window as unknown as { navMetrics: {requests:{id:number;t:number;interactive:boolean}[];results:{id:number;t:number;renderMs:number;final:boolean;fingerprint:string}[];paints:{t:number;hash:number;fingerprint:string}[];raf:number[];cameraCommits:number[]} }).navMetrics;
    const during=<T extends {t:number}>(events:T[])=>events.filter(e=>e.t>=start&&e.t<measuredEnd);
    const requests=during(m.requests),results=during(m.results),paints=during(m.paints);
    const raf=m.raf.filter(t=>t>=start&&t<measuredEnd),gaps=raf.slice(1).map((t,j)=>t-raf[j]).sort((a,b)=>a-b);
    const lags=results.map(result=>result.t-(m.requests.find(r=>r.id===result.id)?.t??result.t));
    const pending=new Set<number>();let maxOutstanding=0;
    const events=[...requests.map(r=>({t:r.t,id:r.id,begin:true})),...m.results.filter(r=>r.t>=start&&r.final).map(r=>({t:r.t,id:r.id,begin:false}))].sort((a,b)=>a.t-b.t);
    for(const e of events){if(e.begin)pending.add(e.id);else pending.delete(e.id);maxOutstanding=Math.max(maxOutstanding,pending.size);}
    return {maxOutstanding,durationMs:measuredEnd-start,requests:requests.length,results:results.length,visibleFrames:paints.length,
      uniqueFrames:new Set(paints.map(p=>p.hash)).size,interactiveRequests:requests.filter(r=>r.interactive).length,
      maxResultAgeMs:Math.max(0,...lags),maxRafGapMs:Math.max(0,...gaps),p95RafGapMs:gaps[Math.floor(gaps.length*.95)]??0,
      cameraCommits:m.cameraCommits.length,finalRequest:m.requests.at(-1),finalResult:m.results.at(-1),finalPaintFingerprint:m.paints.at(-1)?.fingerprint,renderTimesMs:results.map(r=>r.renderMs),settleAfterReleaseMs:(m.paints.at(-1)?.t??release)-release};
  },{start,measuredEnd,release});
  console.log('Navigation orbit metrics:',JSON.stringify(summary));
  await testInfo.attach('orbit-metrics',{body:JSON.stringify(summary,null,2),contentType:'application/json'});
  if(!baseline){
    expect(summary.visibleFrames).toBeGreaterThanOrEqual(5);expect(summary.uniqueFrames).toBeGreaterThanOrEqual(5);
    expect(duringHistory).toBe(0);expect(summary.cameraCommits).toBe(1);expect(summary.maxOutstanding).toBeLessThanOrEqual(1);
    expect(summary.finalRequest?.interactive).toBe(false);
    expect(summary.finalResult?.id).toBe(summary.finalRequest?.id);
    expect(summary.finalResult?.final).toBe(true);
    expect(summary.finalPaintFingerprint).toBe(summary.finalResult?.fingerprint);
    expect(await page.evaluate(async()=>{const {useSceneStore}=await import('/src/lib/store.ts');return useSceneStore.temporal.getState().pastStates.length;})).toBe(1);
  }
  await expect(page.locator('.viewport-stats [role=alert]')).toHaveCount(0);
  await page.screenshot({path:'tests/browser/navigation-final.png'});
});

test('wheel magnitude is proportional and pan distance follows rendered zoom', async ({page},testInfo) => {
  test.setTimeout(90000);
  await instrument(page);await fixture(page);
  const overlay=page.locator('.viewport-overlay').first(),box=(await overlay.boundingBox())!;
  const x=box.x+box.width/2,y=box.y+box.height/2;
  await page.mouse.move(x,y);
  const initial=await camera(page);
  await page.mouse.wheel(0,-1);await expect.poll(async()=>(await camera(page)).zoom).not.toBe(initial.zoom);
  const small=await camera(page);
  await expect(page.locator('.viewport-rendering')).toHaveCount(0,{timeout:30000});
  await page.mouse.wheel(0,1);await expect.poll(async()=>(await camera(page)).zoom).not.toBe(small.zoom);
  const reversed=await camera(page);
  await expect(page.locator('.viewport-rendering')).toHaveCount(0,{timeout:30000});
  await page.mouse.wheel(0,-120);await expect.poll(async()=>(await camera(page)).zoom).not.toBe(reversed.zoom);
  const large=await camera(page);
  await expect(page.locator('.viewport-rendering')).toHaveCount(0,{timeout:30000});
  const pan=async(zoom:number)=>{
    await page.evaluate(async zoom=>{const {useSceneStore}=await import('/src/lib/store.ts');useSceneStore.getState().updateCamera(0,{eye:[10,8,7],center:[0,0,0],zoom});},zoom);
    await expect(page.locator('.viewport-rendering')).toHaveCount(0,{timeout:30000});
    await page.mouse.move(x,y);await page.keyboard.down('Shift');await page.mouse.down();
    await page.mouse.move(x+80,y,{steps:12});await page.mouse.up();await page.keyboard.up('Shift');
    const c=await camera(page);return Math.hypot(...c.center);
  };
  const pan1=await pan(1),pan2=await pan(2);
  const summary={smallRatio:small.zoom!/initial.zoom!,reverseRatio:reversed.zoom!/initial.zoom!,largeRatio:large.zoom!/reversed.zoom!,panAtZoom1:pan1,panAtZoom2:pan2,panRatio:pan2/pan1};
  console.log('Navigation wheel/pan metrics:',JSON.stringify(summary));
  await testInfo.attach('wheel-pan-metrics',{body:JSON.stringify(summary,null,2),contentType:'application/json'});
  if(!baseline){expect(summary.smallRatio-1).toBeLessThan(.01);expect(summary.largeRatio-1).toBeGreaterThan((summary.smallRatio-1)*20);expect(summary.reverseRatio).toBeCloseTo(1,4);expect(summary.panRatio).toBeCloseTo(.5,1);}
});

test('a delayed old-scene preview cannot replace the scene after deletion during drag', async ({page})=>{
  test.setTimeout(60000);
  await instrument(page,250);await fixture(page);
  const box=(await page.locator('.viewport-overlay').first().boundingBox())!;
  const start=await page.evaluate(()=>performance.now());
  await page.mouse.move(box.x+box.width/2,box.y+box.height/2);await page.mouse.down();
  await page.mouse.move(box.x+box.width/2+40,box.y+box.height/2+20,{steps:5});
  await page.waitForFunction(start=>{
    const m=(window as unknown as {navMetrics:{requests:{id:number;t:number;interactive:boolean}[];results:{id:number;t:number}[]}}).navMetrics;
    return m.results.some(result=>result.t>start&&m.requests.some(request=>request.id===result.id&&request.interactive));
  },start);
  const changed=await page.evaluate(async()=>{
    const {useSceneStore}=await import('/src/lib/store.ts');useSceneStore.getState().clearScene();return performance.now();
  });
  await page.mouse.up();
  await expect(page.locator('.viewport-svg polyline')).toHaveCount(0,{timeout:15000});
  await expect(page.locator('.viewport-rendering')).toHaveCount(0,{timeout:15000});
  await page.waitForTimeout(100);
  const paints=await page.evaluate(changed=>(window as unknown as {navMetrics:{paints:{t:number;fingerprint:string}[]}}).navMetrics.paints.filter(p=>p.t>changed),changed);
  expect(paints.length).toBeGreaterThan(0);
  expect(paints.every(p=>p.fingerprint.startsWith('0:'))).toBeTruthy();
  await expect(page.locator('.viewport-stats [role=alert]')).toHaveCount(0);
});

test('pointer capture completes outside the viewport and one undo restores the entire gesture', async ({page})=>{
  await fixture(page);
  await page.evaluate(async()=>{const {useSceneStore}=await import('/src/lib/store.ts');useSceneStore.temporal.getState().clear();});
  const before=await camera(page),box=(await page.locator('.viewport-overlay').first().boundingBox())!;
  const x=box.x+box.width*.45,y=box.y+box.height*.5;
  await page.mouse.move(x,y);await page.mouse.down();
  await page.mouse.move(x+50,y+20,{steps:8});
  await page.mouse.move(box.x-60,y+50,{steps:10});
  expect(await camera(page)).toEqual(before);
  await page.mouse.up();
  await expect.poll(async()=>JSON.stringify(await camera(page))).not.toBe(JSON.stringify(before));
  await expect(page.locator('.viewport-rendering')).toHaveCount(0,{timeout:30000});
  expect(await page.evaluate(async()=>{const {useSceneStore}=await import('/src/lib/store.ts');return useSceneStore.temporal.getState().pastStates.length;})).toBe(1);
  await page.getByTitle('Undo (Cmd+Z)',{exact:true}).click();
  expect(await camera(page)).toEqual(before);
  await page.mouse.click(x,y);
  expect(await camera(page)).toEqual(before);
});

test('top and bottom views pan along their displayed right and up axes', async ({page})=>{
  await fixture(page);
  const box=(await page.locator('.viewport-overlay').first().boundingBox())!;
  const x=box.x+box.width/2,y=box.y+box.height/2;
  for(const side of [1,-1]) {
    await page.evaluate(async side=>{const {useSceneStore}=await import('/src/lib/store.ts');useSceneStore.getState().updateCamera(0,{eye:[0,0,side*10],center:[0,0,0],up:[0,1,0],ortho:true,orthoSize:5,zoom:1});},side);
    await expect(page.locator('.viewport-rendering')).toHaveCount(0,{timeout:30000});
    await page.mouse.move(x,y);await page.keyboard.down('Shift');await page.mouse.down();
    await page.mouse.move(x+60,y+40,{steps:10});await page.mouse.up();await page.keyboard.up('Shift');
    const moved=await camera(page);
    expect(moved.center[0]*side).toBeLessThan(0);
    expect(moved.center[1]).toBeGreaterThan(0);
    expect(Math.abs(moved.center[2])).toBeLessThan(1e-9);
    expect(Math.abs(moved.center[0]/moved.center[1])).toBeCloseTo(1.5,5);
    const direction=moved.eye.map((v,j)=>v-moved.center[j]);
    expect(direction[0]).toBeCloseTo(0,8);expect(direction[1]).toBeCloseTo(0,8);expect(direction[2]).toBeCloseTo(side*10,8);
  }
});

test('wheel feedback remains scaled after commit until the matching SVG arrives', async ({page})=>{
  await instrument(page,350);await fixture(page);
  const svg=page.locator('.viewport-svg').first(),beforeHtml=await svg.innerHTML();
  const box=(await page.locator('.viewport-overlay').first().boundingBox())!;
  await page.mouse.move(box.x+box.width/2,box.y+box.height/2);
  const before=await camera(page);
  await page.mouse.wheel(0,-120);
  await expect.poll(()=>svg.evaluate(e=>getComputedStyle(e).transform)).not.toBe('none');
  const feedback=await svg.evaluate(e=>getComputedStyle(e).transform);
  await expect.poll(async()=>(await camera(page)).zoom).not.toBe(before.zoom);
  expect(await svg.innerHTML()).toBe(beforeHtml);
  expect(await svg.evaluate(e=>getComputedStyle(e).transform)).toBe(feedback);
  await expect.poll(()=>svg.innerHTML(),{timeout:15000}).not.toBe(beforeHtml);
  await expect(svg).toHaveAttribute('data-preview','false',{timeout:15000});
  await expect(page.locator('.viewport-rendering')).toHaveCount(0,{timeout:15000});
  expect(await svg.evaluate(e=>getComputedStyle(e).transform)).toBe('none');
});

test('orthographic wheel zoom reuses exact artwork and keeps viewport bounds stable', async ({page}) => {
  await instrument(page); await fixture(page);
  const overlay=page.locator('.viewport-overlay').first();
  const box=(await overlay.boundingBox())!;
  const svg=page.locator('.viewport-svg').first();
  const before=await svg.innerHTML();
  const start=await page.evaluate(()=>performance.now());
  await page.mouse.move(box.x+box.width/2,box.y+box.height/2);
  for(let j=0;j<12;j++) {
    await page.mouse.wheel(0,4);
    await page.waitForTimeout(25);
    expect(await overlay.boundingBox()).toEqual(box);
    expect(await page.locator('.viewport-paper').first().evaluate(e=>getComputedStyle(e).backgroundColor)).toBe('rgb(255, 255, 255)');
    expect((await svg.innerHTML()) === before).toBe(true);
  }
  const requests=await page.evaluate(start=>(window as unknown as {navMetrics:{requests:{t:number}[]}}).navMetrics.requests.filter(r=>r.t>start).length,start);
  expect(requests).toBe(0);
  await expect(page.locator('.viewport-rendering')).toHaveCount(0,{timeout:30000});
});

test('perspective wheel previews do not apply an incorrect flat scale to a dolly', async ({page}) => {
  await instrument(page,350); await fixture(page);
  await page.evaluate(async()=>{const {useSceneStore}=await import('/src/lib/store.ts');useSceneStore.getState().updateCamera(0,{ortho:false});});
  await expect(page.locator('.viewport-rendering')).toHaveCount(0,{timeout:30000});
  await page.waitForTimeout(400);
  const overlay=page.locator('.viewport-overlay').first(),box=(await overlay.boundingBox())!;
  await page.mouse.move(box.x+box.width/2,box.y+box.height/2);
  await page.mouse.wheel(0,-120);
  await page.waitForTimeout(50);
  expect(await page.locator('.viewport-svg').first().evaluate(e=>getComputedStyle(e).transform)).toBe('none');
  expect(await overlay.boundingBox()).toEqual(box);
});
