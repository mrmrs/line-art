// Rebuild the social card from the same Skullcat silhouette used in the app.
// Requires repository dependencies and locally installed Google Chrome.
import { writeFileSync } from 'node:fs';
import { chromium } from '@playwright/test';
import { SKULLCAT_PATH } from '../src/lib/brand.ts';

const width = 1200;
const height = 630;
const goldenRatio = (1 + Math.sqrt(5)) / 2;
// The original path occupies x=2…30 and y=7…28. Size and center the visible
// silhouette, rather than its 32×32 viewBox, so its height is exactly 1/φ.
const markScale = height / goldenRatio / 21;
const markX = width / 2 - 16 * markScale;
const markY = height / 2 - 17.5 * markScale;
const description = 'A large skullcat silhouette filled with a fine angled white line grid on black.';
const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" role="img" aria-labelledby="title description">
<title id="title">3D SVG</title>
<desc id="description">${description}</desc>
<defs>
  <pattern id="line-grid" width="10" height="10" patternUnits="userSpaceOnUse" patternTransform="rotate(-22 600 315)">
    <path d="M0 10V0H10" fill="none" stroke="#fff" stroke-width="1.35"/>
  </pattern>
  <clipPath id="skullcat">
    <path transform="translate(${markX.toFixed(6)} ${markY.toFixed(6)}) scale(${markScale.toFixed(6)})" d="${SKULLCAT_PATH}" clip-rule="evenodd"/>
  </clipPath>
</defs>
<rect width="${width}" height="${height}" fill="#000"/>
<rect width="${width}" height="${height}" fill="url(#line-grid)" clip-path="url(#skullcat)"/>
</svg>\n`;

let browser;
try {
  writeFileSync('public/og-image.svg', svg);
  browser = await chromium.launch({ channel: 'chrome', headless: true });
  const page = await browser.newPage({ viewport: { width, height }, deviceScaleFactor: 1 });
  await page.setContent(`<html><head><style>html,body{margin:0;width:${width}px;height:${height}px;background:#000}svg{display:block}</style></head><body>${svg}</body></html>`);
  await page.screenshot({ path: 'public/og-image.png' });
  console.log(`Built social card: ${width}×${height} PNG + SVG; Skullcat visible height ${(height / goldenRatio).toFixed(2)}px.`);
} finally {
  await browser?.close();
}
