// Rebuild the social card from the same line-grid geometry used in the app.
// Requires the repository dependencies and locally installed Google Chrome.
import { mkdtempSync, writeFileSync, readFileSync, rmSync } from 'node:fs';
import { resolve } from 'node:path';
import { execFileSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { chromium } from '@playwright/test';
import opentype from 'opentype.js';
import { SKULLCAT_PATH } from '../src/lib/brand.ts';

const temporary = mkdtempSync(resolve('node_modules/.og-card-'));
let browser;
try {
  writeFileSync(resolve(temporary, 'package.json'), '{"type":"commonjs"}');
  execFileSync(process.execPath, ['node_modules/typescript/bin/tsc', 'src/lib/render.ts',
    'src/types/flatten-svg.d.ts', '--outDir', temporary, '--module', 'commonjs', '--target', 'ES2022',
    '--esModuleInterop', '--skipLibCheck', '--ignoreConfig']);
  const require = createRequire(import.meta.url);
  const { renderScene } = require(resolve(temporary, 'render.js'));
  const { DEFAULT_LINE_GRID_PARAMS, DEFAULT_TRANSFORM, DEFAULT_SLICING, DEFAULT_RENDER_SETTINGS } = require(resolve(temporary, 'types.js'));
  const node = {
    id: 'social-line-grid', name: 'Line Grid', type: 'line-grid', visible: true,
    params: { ...DEFAULT_LINE_GRID_PARAMS, countX: 25, countY: 25, spacing: 0.22,
      lineLength: 2.2, lengthMethod: 'uniform' },
    transform: DEFAULT_TRANSFORM, slicing: DEFAULT_SLICING,
  };
  const camera = { name: 'Social', eye: [8, -12, 11], center: [0, 0, 0], up: [0, 0, 1],
    fovy: 45, ortho: true, orthoSize: 6, zoom: 1 };
  const rendered = renderScene([node], camera, 1000, 1000, DEFAULT_RENDER_SETTINGS);
  const paths = [...rendered.svg.matchAll(/<polyline points="([^"]+)"/g)].map(match =>
    match[1].split(' ').map(pair => { const [x, y] = pair.split(',').map(Number); return [x, 1000 - y]; }));
  if (!paths.length) throw new Error('Social card geometry is empty');
  const points = paths.flat();
  const xs = points.map(p => p[0]), ys = points.map(p => p[1]);
  const minX = Math.min(...xs), minY = Math.min(...ys);
  const width = Math.max(...xs) - minX, height = Math.max(...ys) - minY;
  const scale = Math.min(1024 / width, 480 / height);
  const offsetX = (1200 - width * scale) / 2, offsetY = 34 + (480 - height * scale) / 2;
  const linework = paths.map(path => `<polyline points="${path.map(([x,y]) => `${((x-minX)*scale+offsetX).toFixed(3)},${((y-minY)*scale+offsetY).toFixed(3)}`).join(' ')}"/>`).join('\n');
  const fontBytes = readFileSync('public/fonts/Inter.ttf');
  const font = opentype.parse(fontBytes.buffer.slice(fontBytes.byteOffset, fontBytes.byteOffset + fontBytes.byteLength));
  let cursor = 104;
  const title = [...'3D SVG'].map(character => {
    const glyph = font.charToGlyph(character);
    const path = glyph.getPath(cursor, 575, 30).toPathData(3);
    cursor += (glyph.advanceWidth ?? font.unitsPerEm) / font.unitsPerEm * 30;
    return path;
  }).join(' ');
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="630" viewBox="0 0 1200 630" role="img" aria-labelledby="title description">
<title id="title">3D SVG — a studio for line art</title>
<desc id="description">A geometric field of white lines seen at an oblique angle on black, with a small skullcat mark and 3D SVG signature.</desc>
<rect width="1200" height="630" fill="#000"/>
<g fill="none" stroke="#fff" stroke-width="1.15" stroke-linecap="round" stroke-linejoin="round">${linework}</g>
<g fill="#fff"><path transform="translate(56 544) scale(1.15)" d="${SKULLCAT_PATH}"/><path d="${title}"/></g>
</svg>\n`;
  writeFileSync('public/og-image.svg', svg);
  browser = await chromium.launch({ channel: 'chrome', headless: true });
  const page = await browser.newPage({ viewport: { width: 1200, height: 630 }, deviceScaleFactor: 1 });
  await page.setContent(`<html><head><style>html,body{margin:0;width:1200px;height:630px;background:#000}svg{display:block}</style></head><body>${svg}</body></html>`);
  await page.screenshot({ path: 'public/og-image.png' });
  console.log(`Built social card: ${paths.length} real line-grid paths, 1200×630 PNG + SVG source.`);
} finally {
  await browser?.close();
  rmSync(temporary, { recursive: true, force: true });
}
