// Requires Node 24+ and ImageMagick (`magick`); no application dependencies.
// Optional: --preview-dir /tmp/3d-svg-favicons writes light/dark size proofs.
import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { SKULLCAT_PATH } from '../src/lib/brand.ts';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const output = join(root, 'public');
const temporary = mkdtempSync(join(tmpdir(), '3d-svg-favicons-'));
const svg = (body) => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32" width="32" height="32">${body}</svg>\n`;
const mark = (fill) => `<path fill="${fill}" transform="translate(0 -1.5)" d="${SKULLCAT_PATH}"/>`;
const raster = (source, size, target) => {
  const input = join(temporary, 'input.svg');
  writeFileSync(input, source);
  // Oversample vector edges, then downsample once for readable eye cutouts.
  execFileSync('magick', ['-background', 'none', '-density', '1536', input, '-resize', `${size}x${size}`, '-depth', '8', '-strip', target]);
};

try {
  execFileSync('magick', ['-version'], { stdio: 'ignore' });
  mkdirSync(output, { recursive: true });
  writeFileSync(join(output, 'favicon.svg'), svg(
    '<style>path{fill:#141414}@media(prefers-color-scheme:dark){path{fill:#f5f5f5}}</style>' + mark('#141414'),
  ));
  const fallback = svg('<rect x="0.5" y="0.5" width="31" height="31" rx="6" fill="#fafafa" stroke="#b5b5b5" stroke-width="0.75"/>' + mark('#141414'));
  const icoSizes = [16, 32, 48];
  const icoFrames = icoSizes.map(size => {
    const path = join(temporary, `favicon-${size}.png`);
    raster(fallback, size, path);
    return path;
  });
  for (const size of [16, 32]) raster(fallback, size, join(output, `favicon-${size}x${size}.png`));
  execFileSync('magick', [...icoFrames, join(output, 'favicon.ico')]);
  raster(svg('<rect width="32" height="32" fill="#141414"/>' +
    `<g transform="translate(2 2) scale(.875)">${mark('#fafafa')}</g>`), 180, join(output, 'apple-touch-icon.png'));

  const previewIndex = process.argv.indexOf('--preview-dir');
  if (previewIndex !== -1) {
    const destination = process.argv[previewIndex + 1];
    if (!destination) throw new Error('--preview-dir requires a directory');
    mkdirSync(destination, { recursive: true });
    for (const [theme, background, foreground] of [['light', '#ffffff', '#141414'], ['dark', '#141414', '#f5f5f5']]) {
      for (const size of [16, 32]) {
        const path = join(destination, `${theme}-${size}.png`);
        raster(svg(`<rect width="32" height="32" fill="${background}"/>${mark(foreground)}`), size, path);
        execFileSync('magick', [path, '-filter', 'point', '-resize', '256x256', join(destination, `${theme}-${size}-zoom.png`)]);
      }
    }
    console.log(`Size proofs written to ${destination}`);
  }
  console.log('Generated favicon.svg, favicon.ico (16/32/48), PNG fallbacks, and Apple touch icon.');
} finally {
  rmSync(temporary, { recursive: true, force: true });
}
