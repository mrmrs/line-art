import opentype from 'opentype.js';
import { parseSvgString } from './svg-parse';

// =============================================================================
// Font registry — manages opentype.js Font instances available for
// text-extrude. Supports both bundled fonts (loaded from /public/fonts/) and
// user uploads (cached in memory; not persisted yet).
// =============================================================================

export interface FontEntry {
  id: string;
  name: string;
  source: 'bundled' | 'uploaded';
  url?: string;          // for bundled
  font?: opentype.Font;  // populated lazily
  loading?: Promise<opentype.Font>;
}

// Bundled font slots — add files to /public/fonts/ and register them here.
// Empty by default; the upload flow works without bundled fonts.
const BUNDLED: Omit<FontEntry, 'font' | 'loading'>[] = [
  // Example (add real files to /public/fonts/ to enable):
  // { id: 'inter', name: 'Inter', source: 'bundled', url: '/fonts/Inter-Regular.ttf' },
];

const registry = new Map<string, FontEntry>();
for (const f of BUNDLED) registry.set(f.id, { ...f });

export function listFonts(): FontEntry[] {
  return Array.from(registry.values());
}

export function getFontEntry(id: string): FontEntry | undefined {
  return registry.get(id);
}

export async function loadFont(id: string): Promise<opentype.Font> {
  const entry = registry.get(id);
  if (!entry) throw new Error(`Unknown font: ${id}`);
  if (entry.font) return entry.font;
  if (entry.loading) return entry.loading;
  if (!entry.url) throw new Error(`Font ${id} has no URL and is not uploaded`);
  entry.loading = opentype.load(entry.url).then((font) => {
    entry.font = font;
    return font;
  });
  return entry.loading;
}

// Upload a font from an ArrayBuffer (TTF/OTF). Returns the new font id.
export function uploadFont(name: string, buffer: ArrayBuffer): string {
  const font = opentype.parse(buffer);
  const id = `upload-${Date.now().toString(36)}-${Math.floor(Math.random() * 1e6).toString(36)}`;
  registry.set(id, {
    id,
    name: name.replace(/\.(ttf|otf)$/i, ''),
    source: 'uploaded',
    font,
  });
  return id;
}

// Render a string with the given font into flattened polylines suitable for
// extrudePolylines. Operates synchronously — font must already be loaded.
//
// Strategy: get the SVG path data from opentype.js, run it through the same
// flatten-svg pipeline used for imported SVG files. Reuses one well-tested
// curve-flattening implementation across both extrude types.
export function textToPolylines(
  font: opentype.Font,
  text: string,
  options: {
    fontSize: number;
    letterSpacing?: number;
    lineHeight?: number;
    align?: 'left' | 'center' | 'right';
  },
): { polylines: number[][][]; bounds: { minX: number; minY: number; maxX: number; maxY: number } } {
  const { fontSize, letterSpacing = 0, lineHeight = 1.2, align = 'center' } = options;

  // For multi-line text: split on \n and render each line via getPath with y offset.
  const lines = text.split(/\r?\n/);
  const lineHeightPx = fontSize * lineHeight;

  // Pre-compute each line's path data + advance width (for alignment)
  const linePaths: { d: string; advance: number; y: number }[] = [];
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    // Manual layout for letter spacing: walk glyphs ourselves
    let x = 0;
    const segments: string[] = [];
    for (const ch of line) {
      const glyph = font.charToGlyph(ch);
      const gPath = glyph.getPath(x, 0, fontSize);
      segments.push(gPath.toPathData(2));
      const adv = (glyph.advanceWidth ?? 0) * (fontSize / font.unitsPerEm);
      x += adv + letterSpacing;
    }
    linePaths.push({ d: segments.join(' '), advance: x, y: i * lineHeightPx });
  }

  // Compute max line width for alignment
  const maxAdvance = Math.max(0, ...linePaths.map((l) => l.advance));

  // Combine all lines into a single SVG path string with translations applied
  // by editing the start coordinates is complex; simpler to wrap each line in
  // its own <path transform="translate(dx,dy)">.
  const parts: string[] = [];
  for (const l of linePaths) {
    let dx = 0;
    if (align === 'center') dx = (maxAdvance - l.advance) / 2;
    else if (align === 'right') dx = maxAdvance - l.advance;
    parts.push(
      `<g transform="translate(${dx.toFixed(2)},${l.y.toFixed(2)})"><path d="${l.d}"/></g>`,
    );
  }
  const svg = `<svg xmlns="http://www.w3.org/2000/svg">${parts.join('')}</svg>`;
  return parseSvgString(svg);
}
