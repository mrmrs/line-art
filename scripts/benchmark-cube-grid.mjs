// Exact render/interaction benchmark; --baseline loads the retained 0.8.1 core
// and original cube edge representation. No work limits are changed.
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { resolve } from 'node:path';
import { execFileSync } from 'node:child_process';
const output=mkdtempSync(resolve('node_modules/.grid-benchmark-'));
try {
  writeFileSync(`${output}/package.json`,'{"type":"commonjs"}');
  execFileSync(process.execPath,['node_modules/typescript/bin/tsc','src/lib/render.ts','src/types/flatten-svg.d.ts','--outDir',output,'--module','commonjs','--target','ES2022','--esModuleInterop','--skipLibCheck','--ignoreConfig']);
  const baseline=process.argv.includes('--baseline');
  if(baseline)execFileSync('tar',['-xzf',resolve('vendor/lnjs-core-0.8.1.tgz'),'-C',output]);
  writeFileSync(`${output}/run.cjs`, `
if(${baseline}){const Module=require('module'),resolve=Module._resolveFilename;Module._resolveFilename=function(name,...args){return resolve.call(this,name==='@lnjs/core'?${JSON.stringify(output+'/package/lib/index.js')}:name,...args)}}
const ln=require('@lnjs/core');
const {renderScene,renderNavigationPreview,clearGeneratorCache,clearMeshCache}=require('./render.js');
const {DEFAULT_CUBE_GRID_PARAMS,DEFAULT_TRANSFORM,DEFAULT_SLICING,DEFAULT_RENDER_SETTINGS}=require('./types.js');
const {generateCubeGrid}=require('./cube-grid.js');
if(${baseline})Object.getPrototypeOf(generateCubeGrid({...DEFAULT_CUBE_GRID_PARAMS,countX:1,countY:1,countZ:1})[0]).paths=ln.Cube.prototype.paths;
for(const count of [20,24,28,30,36]) {
 clearGeneratorCache();clearMeshCache();global.gc();
 const params={...DEFAULT_CUBE_GRID_PARAMS,countX:count,countY:count,countZ:count};
 const node={id:'benchmark',name:'Grid',type:'cube-grid',visible:true,params,transform:DEFAULT_TRANSFORM,slicing:DEFAULT_SLICING,fills:[]};
 const nodes=[node];
 const camera={name:'Test',eye:[30,24,18],center:[0,0,0],up:[0,0,1],ortho:true,orthoSize:count*.55,fovy:45,zoom:1};
 const start=performance.now(),cells=generateCubeGrid(params),paths=cells.flatMap(c=>c.paths());
 const result={count,cells:count**3,sourcePaths:paths.length,sourceVertices:paths.reduce((n,p)=>n+p.length,0),generationMs:Math.round(performance.now()-start)};
 try {
  const cold=renderScene(nodes,camera,1024,1024,DEFAULT_RENDER_SETTINGS);result.coldMs=Math.round(cold.renderTimeMs);result.paths=cold.pathCount;
  result.warmMs=Math.round(renderScene(nodes,{...camera,eye:[32,23,16]},1024,1024,DEFAULT_RENDER_SETTINGS).renderTimeMs);
  result.firstPreviewMs=Math.round(renderNavigationPreview(nodes,camera,1024,1024,DEFAULT_RENDER_SETTINGS).renderTimeMs);
  result.cachedPreviewMs=Math.round(renderNavigationPreview(nodes,{...camera,eye:[32,23,16]},1024,1024,DEFAULT_RENDER_SETTINGS).renderTimeMs);
 } catch(error){result.error=error.message;}
 console.log(JSON.stringify(result));
}
`);
  execFileSync(process.execPath,['--expose-gc',`${output}/run.cjs`],{stdio:'inherit'});
} finally { rmSync(output,{recursive:true,force:true}); }
