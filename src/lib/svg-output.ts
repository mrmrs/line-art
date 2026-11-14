import type * as ln from '@lnjs/core';
import type { RenderSettings } from './types';
export interface PenGroup {
  pen: number;
  paths: ln.Paths;
}
// Attribution is metadata, never a plotted path or a watermark.
const EXPORT_IDENTITY = `<metadata id="skullcat-provenance"><rdf:RDF xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#" xmlns:dc="http://purl.org/dc/elements/1.1/"><rdf:Description rdf:about=""><dc:title>3D SVG artwork</dc:title><dc:creator>mrmrs</dc:creator><dc:source>https://github.com/mrmrs/line-art</dc:source><dc:description>Created with 3D SVG by mrmrs. Skullcat mark by mrmrs.</dc:description></rdf:Description></rdf:RDF></metadata>`;

// Drop adjacent coordinates that collapse at serialization precision. A zero-
// length polyline otherwise becomes a visible dot with round stroke caps.
function svgPoints(path: ln.Paths[number]): string | null {
  const points: string[] = [];
  for (const p of path) {
    const value = `${p.x.toFixed(6)},${p.y.toFixed(6)}`;
    if (value !== points[points.length - 1]) points.push(value);
  }
  return points.length > 1 ? points.join(' ') : null;
}
// --- Custom SVG output with configurable styling ---

// Physical dimensions for the export SVG. When provided, the <svg> width and
// height use the physical units string (e.g. "210mm") while viewBox stays in
// pixel space. This makes the output print/plot at correct physical size.
export interface PhysicalSize {
  width: string;
  height: string;
}

export function toStyledSVG(
  paths: ln.Paths,
  width: number,
  height: number,
  settings: RenderSettings,
  physical?: PhysicalSize,
): string {
  const { strokeWidth, strokeColor, backgroundColor } = settings;
  const lines: string[] = [];

  const wAttr = physical?.width ?? `${width}`;
  const hAttr = physical?.height ?? `${height}`;
  lines.push(
    `<svg xmlns="http://www.w3.org/2000/svg"${physical ? ' data-generator="skullcat-studio"' : ''} width="${wAttr}" height="${hAttr}" ` +
      `viewBox="0 0 ${width} ${height}" ` +
      `style="background:${backgroundColor}">`,
  );
  if (physical) lines.push(EXPORT_IDENTITY);
  lines.push(`<g transform="translate(0,${height}) scale(1,-1)">`);
  lines.push(
    `<g id="pen-1" stroke="${strokeColor}" stroke-width="${strokeWidth}" stroke-linecap="round" stroke-linejoin="round" fill="none">`,
  );

  for (const path of paths) {
    if (path.length < 2) continue;
    const points = svgPoints(path);
    if (!points) continue;
    lines.push(`<polyline points="${points}" />`);
  }

  lines.push('</g></g></svg>');
  return lines.join('\n');
}

// Compose an SVG with multiple <g id="pen-N"> groups from per-pen path lists.
// `penColors` maps pen number → stroke color; falls back to strokeColor.
export function multiPenSvg(
  penGroups: PenGroup[],
  width: number,
  height: number,
  settings: RenderSettings,
  penColors: Record<number, string> = {},
  physical?: PhysicalSize,
): string {
  const { strokeWidth, strokeColor, backgroundColor } = settings;
  const lines: string[] = [];
  const wAttr = physical?.width ?? `${width}`;
  const hAttr = physical?.height ?? `${height}`;
  lines.push(
    `<svg xmlns="http://www.w3.org/2000/svg"${physical ? ' data-generator="skullcat-studio"' : ''} width="${wAttr}" height="${hAttr}" ` +
      `viewBox="0 0 ${width} ${height}" style="background:${backgroundColor}">`,
  );
  if (physical) lines.push(EXPORT_IDENTITY);
  lines.push(`<g transform="translate(0,${height}) scale(1,-1)">`);
  for (const grp of penGroups) {
    const color = penColors[grp.pen] ?? strokeColor;
    lines.push(
      `<g id="pen-${grp.pen}" stroke="${color}" stroke-width="${strokeWidth}" ` +
        `stroke-linecap="round" stroke-linejoin="round" fill="none">`,
    );
    for (const path of grp.paths) {
      if (path.length < 2) continue;
      const points = svgPoints(path);
      if (!points) continue;
      lines.push(`<polyline points="${points}" />`);
    }
    lines.push(`</g>`);
  }
  lines.push('</g></svg>');
  return lines.join('\n');
}
