import { flattenSVG } from 'flatten-svg';

// =============================================================================
// SVG → flattened polylines.
// Runs on the MAIN THREAD only (needs DOMParser). Worker only sees the
// resulting polylines + bounds.
// =============================================================================

export interface ParsedSvg {
  polylines: number[][][];                       // [poly][pt][x|y]
  bounds: { minX: number; minY: number; maxX: number; maxY: number };
}

export function parseSvgString(svgText: string, maxError = 0.1): ParsedSvg {
  const doc = new DOMParser().parseFromString(svgText, 'image/svg+xml');
  const errorNode = doc.querySelector('parsererror');
  if (errorNode) throw new Error('Invalid SVG: ' + errorNode.textContent);

  const svg = doc.documentElement as unknown as SVGSVGElement;
  if (!svg || svg.tagName.toLowerCase() !== 'svg') {
    throw new Error('Document root is not <svg>');
  }

  // flattenSVG walks the tree and emits per-shape polylines (with applied
  // CTM). Y is in SVG coordinates (downward positive).
  const lines = flattenSVG(svg, { maxError });

  const polylines: number[][][] = [];
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;

  for (const line of lines) {
    const pts = line.points;
    if (!pts || pts.length < 2) continue;
    const poly: number[][] = [];
    for (const [x, y] of pts) {
      if (x < minX) minX = x; if (x > maxX) maxX = x;
      if (y < minY) minY = y; if (y > maxY) maxY = y;
      poly.push([x, y]);
    }
    polylines.push(poly);
  }

  if (!Number.isFinite(minX)) {
    minX = 0; minY = 0; maxX = 1; maxY = 1;
  }

  return { polylines, bounds: { minX, minY, maxX, maxY } };
}
