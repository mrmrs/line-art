// Opt-in full-size worker-library benchmark. Does not run in the normal test suite.
// node scripts/benchmark-large-grid.mjs [countX countY countZ]
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { resolve } from 'node:path';
import { execFileSync } from 'node:child_process';
const counts = process.argv.slice(2).map(Number);
const dimensions = counts.length === 3 ? counts : [64, 64, 128];
if (dimensions.some(n => !Number.isInteger(n) || n < 1) || dimensions.reduce((a,b)=>a*b,1) > 524288)
  throw new Error('Use three positive counts with at most 524288 total cells');
const output = mkdtempSync(resolve('node_modules/.large-grid-benchmark-'));
try {
  writeFileSync(`${output}/package.json`, '{"type":"commonjs"}');
  execFileSync(process.execPath, ['node_modules/typescript/bin/tsc', 'src/lib/render.ts', 'src/lib/plot-output.ts',
    'src/types/flatten-svg.d.ts', '--outDir', output, '--module', 'commonjs', '--target', 'ES2022',
    '--esModuleInterop', '--skipLibCheck', '--ignoreConfig']);
  writeFileSync(`${output}/run.cjs`, `
const {renderScenePerPen,multiPenSvg,renderNavigationPreview}=require('./render.js');
const {preparePlot}=require('./plot-output.js');
const {DEFAULT_PLOT_SETTINGS}=require('./plot-settings.js');
const t=require('./types.js');
const [countX,countY,countZ]=${JSON.stringify(dimensions)};
const nodes=[{id:'benchmark',name:'Grid',type:'cube-grid',visible:true,params:{...t.DEFAULT_CUBE_GRID_PARAMS,countX,countY,countZ},transform:t.DEFAULT_TRANSFORM,slicing:t.DEFAULT_SLICING,fills:[]}];
const camera={name:'Test',eye:[100,80,60],center:[0,0,0],up:[0,0,1],ortho:true,orthoSize:Math.max(countX,countY,countZ)*.4,fovy:45,zoom:1};
const settings={...t.DEFAULT_RENDER_SETTINGS,far:1000};
const start=performance.now();
const result=renderScenePerPen(nodes,camera,1024,1024,settings,undefined,message=>{if(/tile (1|17|33|49) of/.test(message))console.error(message);});
const renderMs=Math.round(performance.now()-start);
const cleaned=preparePlot(result.penGroups,210,210,1024,1024,DEFAULT_PLOT_SETTINGS,true);
const svg=multiPenSvg(cleaned.groups,1024,1024,settings,{}, {width:'210mm',height:'210mm'});
const exportMs=Math.round(performance.now()-start);
const preview=renderNavigationPreview(nodes,camera,1024,1024,settings);
console.log(JSON.stringify({dimensions:[countX,countY,countZ],cells:countX*countY*countZ,renderMs,exportMs,rawPaths:result.penGroups.reduce((n,g)=>n+g.paths.length,0),exportPaths:cleaned.stats.strokes,svgBytes:svg.length,previewMs:Math.round(preview.renderTimeMs),previewSegments:preview.pathCount,memory:process.memoryUsage()},null,2));
`);
  execFileSync(process.execPath, ['--max-old-space-size=4096', `${output}/run.cjs`], { stdio: 'inherit' });
} finally { rmSync(output, { recursive: true, force: true }); }
