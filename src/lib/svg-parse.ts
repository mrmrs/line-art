import { flattenSVG } from 'flatten-svg';
import polygonClipping from 'polygon-clipping';
import { LIMITS, bounded } from './limits';
export interface ParsedSvg {
  polylines: number[][][];
  bounds: { minX: number; minY: number; maxX: number; maxY: number };
}
type Multi = polygonClipping.MultiPolygon;
const area = (ring: number[][]) =>
  ring.reduce((sum, p, i) => {
    const q = ring[(i + 1) % ring.length];
    return sum + p[0] * q[1] - q[0] * p[1];
  }, 0) / 2;
// Overlay signed winding regions so nested same-direction rings stay filled;
// opposing rings create holes. Even-odd is handled independently per SVG shape.
export function filledRings(rings: number[][][], rule: string): Multi {
  if (rule === 'evenodd') {
    let out: Multi = [];
    for (const ring of rings)
      if (ring.length >= 3)
        out = polygonClipping.xor(out, [ring as polygonClipping.Ring]);
    return out;
  }
  let zones = new Map<number, Multi>();
  for (const ring of rings) {
    if (ring.length < 3) continue;
    if (Math.abs(area(ring)) < 1e-12)
      throw new Error(
        'A filled SVG contour has zero signed area; import it as lines instead',
      );
    const sign = area(ring) > 0 ? 1 : -1,
      shape: Multi = [[ring as polygonClipping.Ring]],
      next = new Map<number, Multi>();
    let remainder = shape;
    const add = (w: number, g: Multi) => {
      if (!g.length) return;
      next.set(w, polygonClipping.union(next.get(w) ?? [], g));
    };
    for (const [w, zone] of zones) {
      add(w, polygonClipping.difference(zone, shape));
      add(w + sign, polygonClipping.intersection(zone, shape));
      remainder = polygonClipping.difference(remainder, zone);
    }
    add(sign, remainder);
    zones = next;
  }
  let out: Multi = [];
  for (const [w, zone] of zones)
    if (w !== 0) out = polygonClipping.union(out, zone);
  return out;
}
export function parseSvgString(
  svgText: string,
  maxError = 0.1,
  mode: 'regions' | 'lines' = 'regions',
): ParsedSvg {
  bounded(svgText.length, 'SVG input bytes', 1, LIMITS.inputBytes);
  bounded(maxError, 'SVG flattening tolerance', 0.001, 10);
  const doc = new DOMParser().parseFromString(svgText, 'image/svg+xml');
  if (
    doc.querySelector('parsererror') ||
    doc.documentElement.localName !== 'svg'
  )
    throw new Error('Invalid SVG document');
  if (
    doc.querySelector(
      'use, image, text, foreignObject, style, clipPath, mask, filter',
    )
  )
    throw new Error(
      'SVG contains references, text, stylesheets or effects. Convert them to plain paths before importing.',
    );
  const svg = document.importNode(
    doc.documentElement,
    true,
  ) as unknown as SVGSVGElement;
  const allowed = new Set([
    'svg',
    'g',
    'a',
    'path',
    'rect',
    'circle',
    'ellipse',
    'line',
    'polyline',
    'polygon',
    'title',
    'desc',
  ]);
  const elements = [svg, ...svg.querySelectorAll('*')];
  bounded(elements.length, 'SVG elements', 1, 5000);
  for (const el of elements) {
    if (!allowed.has(el.localName)) {
      el.remove();
      continue;
    }
    for (const attr of [...el.attributes])
      if (
        ![
          'd',
          'points',
          'x',
          'y',
          'x1',
          'y1',
          'x2',
          'y2',
          'width',
          'height',
          'cx',
          'cy',
          'r',
          'rx',
          'ry',
          'transform',
          'viewBox',
          'preserveAspectRatio',
          'fill',
          'fill-rule',
          'stroke',
          'stroke-width',
          'display',
          'visibility',
          'style',
          'xmlns',
        ].includes(attr.name)
      )
        el.removeAttribute(attr.name);
    if (el.hasAttribute('style')) {
      const style = (el as SVGElement).style;
      for (const key of [...style])
        if (
          ![
            'fill',
            'fill-rule',
            'stroke',
            'stroke-width',
            'display',
            'visibility',
          ].includes(key)
        )
          style.removeProperty(key);
      if (/url\s*\(/i.test(el.getAttribute('style') ?? ''))
        throw new Error('SVG external paint references are unsupported');
    }
    for (const attr of ['fill', 'stroke'])
      if (/url\s*\(/i.test(el.getAttribute(attr) ?? ''))
        throw new Error('SVG paint references are unsupported');
  }
  const container = document.createElement('div');
  container.style.cssText =
    'position:fixed;left:-100000px;top:0;pointer-events:none;opacity:0';
  container.appendChild(svg);
  document.body.appendChild(container);
  try {
    const rules = new Map<string, string>();
    for (const [i, shape] of [
      ...svg.querySelectorAll('path,rect,circle,ellipse,line,polyline,polygon'),
    ].entries()) {
      const computed = getComputedStyle(shape);
      if (
        computed.display === 'none' ||
        computed.visibility === 'hidden' ||
        (mode === 'regions' && computed.fill === 'none')
      ) {
        shape.remove();
        continue;
      }
      const group = document.createElementNS('http://www.w3.org/2000/svg', 'g');
      group.id = `import-shape-${i}`;
      rules.set(group.id, computed.fillRule || 'nonzero');
      shape.replaceWith(group);
      group.appendChild(shape);
    }
    const lines = flattenSVG(svg, { maxError });
    let vertices = 0;
    const shapes = new Map<string, number[][][]>();
    for (const line of lines) {
      if ((vertices += line.points.length) > LIMITS.vertices)
        throw new Error('SVG vertex budget exceeded');
      if (!line.points.every((p) => p.every(Number.isFinite)))
        throw new Error('SVG coordinates must be finite');
      const id = line.groupId ?? '',
        list = shapes.get(id) ?? [];
      list.push(line.points);
      shapes.set(id, list);
    }
    let polylines: number[][][];
    if (mode === 'lines')
      polylines = lines.map((line) => line.points).filter((p) => p.length >= 2);
    else {
      let regions: Multi = [];
      for (const [id, rings] of shapes)
        regions = polygonClipping.union(
          regions,
          filledRings(rings, rules.get(id) ?? 'nonzero'),
        );
      polylines = regions.flatMap((polygon) => polygon);
    }
    let minX = Infinity,
      minY = Infinity,
      maxX = -Infinity,
      maxY = -Infinity;
    for (const line of polylines)
      for (const [x, y] of line) {
        minX = Math.min(minX, x);
        minY = Math.min(minY, y);
        maxX = Math.max(maxX, x);
        maxY = Math.max(maxY, y);
      }
    return {
      polylines,
      bounds: Number.isFinite(minX)
        ? { minX, minY, maxX, maxY }
        : { minX: 0, minY: 0, maxX: 1, maxY: 1 },
    };
  } finally {
    container.remove();
  }
}
