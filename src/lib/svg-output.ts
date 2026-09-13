import type * as ln from '@lnjs/core';
import type { RenderSettings } from './types';
export interface PenGroup {
  pen: number;
  paths: ln.Paths;
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
    `<svg xmlns="http://www.w3.org/2000/svg" width="${wAttr}" height="${hAttr}" ` +
      `viewBox="0 0 ${width} ${height}" ` +
      `style="background:${backgroundColor}">`,
  );
  lines.push(`<g transform="translate(0,${height}) scale(1,-1)">`);
  lines.push(
    `<g id="pen-1" stroke="${strokeColor}" stroke-width="${strokeWidth}" stroke-linecap="round" stroke-linejoin="round" fill="none">`,
  );

  for (const path of paths) {
    if (path.length < 2) continue;
    const points = path
      .map((v) => `${v.x.toFixed(6)},${v.y.toFixed(6)}`)
      .join(' ');
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
    `<svg xmlns="http://www.w3.org/2000/svg" width="${wAttr}" height="${hAttr}" ` +
      `viewBox="0 0 ${width} ${height}" style="background:${backgroundColor}">`,
  );
  lines.push(`<g transform="translate(0,${height}) scale(1,-1)">`);
  for (const grp of penGroups) {
    const color = penColors[grp.pen] ?? strokeColor;
    lines.push(
      `<g id="pen-${grp.pen}" stroke="${color}" stroke-width="${strokeWidth}" ` +
        `stroke-linecap="round" stroke-linejoin="round" fill="none">`,
    );
    for (const path of grp.paths) {
      if (path.length < 2) continue;
      const points = path
        .map((v) => `${v.x.toFixed(6)},${v.y.toFixed(6)}`)
        .join(' ');
      lines.push(`<polyline points="${points}" />`);
    }
    lines.push(`</g>`);
  }
  lines.push('</g></svg>');
  return lines.join('\n');
}
