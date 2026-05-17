import * as ln from '@lnjs/core';
import earcut from 'earcut';
import polygonClipping from 'polygon-clipping';
import type { SvgExtrudeParams, TextExtrudeParams } from './types';

// =============================================================================
// Polyline-based 2D → 3D extrusion.
//
// Inputs are flattened polylines from flatten-svg (SVG) or opentype.js (text).
// We resolve even-odd winding via polygon-clipping XOR, triangulate each
// resulting {outer, holes} polygon with earcut, then extrude top + bottom +
// walls along Z. Result is a manifold ln.Triangle[] ready to wrap in ln.Mesh.
// =============================================================================

// A "ring" is a closed loop of 2D points (last point may equal first; we don't require it)
type Ring = number[][]; // [x,y][]

// Polygon-clipping's input expects MultiPolygon = Polygon[] = Ring[][]
// Output is MultiPolygon as well.
type PgPolygon = Ring[]; // [outerRing, ...holeRings]

// Quality threshold: rings shorter than this length are ignored
const MIN_RING_VERTS = 3;
const MIN_RING_AREA = 1e-6;

function ringArea(ring: Ring): number {
  let a = 0;
  for (let i = 0, n = ring.length; i < n; i++) {
    const [x1, y1] = ring[i];
    const [x2, y2] = ring[(i + 1) % n];
    a += x1 * y2 - x2 * y1;
  }
  return a * 0.5;
}

function closeRing(r: Ring): Ring {
  if (r.length < 2) return r;
  const [x0, y0] = r[0];
  const [xn, yn] = r[r.length - 1];
  if (x0 === xn && y0 === yn) return r;
  return [...r, [x0, y0]];
}

// Build the combined polygon set from raw polylines using XOR (even-odd rule).
// Returns array of polygons in {outer, holes[]} form.
export function ringsToPolygons(polylines: number[][][]): PgPolygon[] {
  const rings: Ring[] = [];
  for (const pl of polylines) {
    if (pl.length < MIN_RING_VERTS) continue;
    const closed = closeRing(pl);
    if (Math.abs(ringArea(closed)) < MIN_RING_AREA) continue;
    rings.push(closed);
  }
  if (rings.length === 0) return [];

  // XOR all rings together (each wrapped as a single-ring polygon)
  // This implements the SVG even-odd fill rule and produces proper {outer, holes} structure.
  let mp: PgPolygon[];
  try {
    const polys: PgPolygon[] = rings.map((r) => [r] as PgPolygon);
    if (polys.length === 1) {
      mp = polys;
    } else {
      // Polygon-clipping signature: xor(geom, ...geoms) where each geom is Polygon or MultiPolygon
      const head = polys[0];
      const tail = polys.slice(1);
      const result = polygonClipping.xor(
        head as unknown as Parameters<typeof polygonClipping.xor>[0],
        ...(tail as unknown as Parameters<typeof polygonClipping.xor>[1][]),
      );
      mp = result as unknown as PgPolygon[];
    }
  } catch {
    // polygon-clipping can throw on degenerate input — fall back to treating
    // every ring as a separate outer with no holes. Triangulation will still
    // succeed; you just won't get hole punching.
    mp = rings.map((r) => [r] as PgPolygon);
  }

  return mp;
}

// Compute global bounds across polylines
function computeBounds(polylines: number[][][]) {
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const pl of polylines) {
    for (const [x, y] of pl) {
      if (x < minX) minX = x; if (x > maxX) maxX = x;
      if (y < minY) minY = y; if (y > maxY) maxY = y;
    }
  }
  if (!Number.isFinite(minX)) return { minX: 0, minY: 0, maxX: 1, maxY: 1 };
  return { minX, minY, maxX, maxY };
}

// =============================================================================
// Extrude polylines into a 3D triangle mesh.
//
// Coordinate convention: input is SVG-style (Y-down). We flip Y and center
// on origin (optionally), then scale so the largest XY dimension matches
// `fitToSize`. Z extends ± extrudeDepth/2 around z=0.
// =============================================================================

export interface ExtrudeOptions {
  polylines: number[][][];
  bounds?: { minX: number; minY: number; maxX: number; maxY: number };
  extrudeDepth: number;
  fitToSize: number;
  centerOnOrigin: boolean;
}

export function extrudePolylines(opts: ExtrudeOptions): ln.Triangle[] {
  const { polylines, extrudeDepth, fitToSize, centerOnOrigin } = opts;
  if (polylines.length === 0) return [];

  const bounds = opts.bounds ?? computeBounds(polylines);

  const w = Math.max(1e-6, bounds.maxX - bounds.minX);
  const h = Math.max(1e-6, bounds.maxY - bounds.minY);
  const scale = fitToSize / Math.max(w, h);
  const cx = (bounds.minX + bounds.maxX) / 2;
  const cy = (bounds.minY + bounds.maxY) / 2;

  // Transform a 2D SVG point into 3D world space (XY plane).
  // Flip Y so the SVG (Y-down) becomes plotter/world (Y-up).
  const toWorld = (x: number, y: number): [number, number] => {
    const wx = (x - (centerOnOrigin ? cx : bounds.minX)) * scale;
    const wy = -(y - (centerOnOrigin ? cy : bounds.minY)) * scale; // flip
    return [wx, wy];
  };

  // Build the resolved polygon set in world XY
  const sourceMp = ringsToPolygons(polylines);
  if (sourceMp.length === 0) return [];

  const halfZ = extrudeDepth / 2;
  const triangles: ln.Triangle[] = [];

  for (const polygon of sourceMp) {
    // polygon = [outer, hole, hole, ...]
    if (polygon.length === 0) continue;

    // Project rings into world XY
    const projRings: number[][][] = polygon.map((ring) =>
      ring.map(([x, y]) => {
        const [wx, wy] = toWorld(x, y);
        return [wx, wy];
      }),
    );

    // Build flat [x,y,x,y,...] vertex array + hole indices for earcut
    const flat: number[] = [];
    const holeIndices: number[] = [];
    for (let r = 0; r < projRings.length; r++) {
      if (r > 0) holeIndices.push(flat.length / 2);
      const ring = projRings[r];
      // Don't duplicate the closing vertex (earcut requires non-closed)
      const lastIsFirst =
        ring.length > 1 &&
        ring[0][0] === ring[ring.length - 1][0] &&
        ring[0][1] === ring[ring.length - 1][1];
      const limit = lastIsFirst ? ring.length - 1 : ring.length;
      for (let i = 0; i < limit; i++) {
        flat.push(ring[i][0], ring[i][1]);
      }
    }

    const indices = earcut(flat, holeIndices.length > 0 ? holeIndices : undefined, 2);

    // Top face (z = +halfZ) — winding as earcut produced (CCW for outer)
    // Bottom face (z = -halfZ) — reverse winding so normal points -Z
    for (let i = 0; i < indices.length; i += 3) {
      const a = indices[i], b = indices[i + 1], c = indices[i + 2];
      const ax = flat[a * 2], ay = flat[a * 2 + 1];
      const bx = flat[b * 2], by = flat[b * 2 + 1];
      const cx2 = flat[c * 2], cy2 = flat[c * 2 + 1];

      // Top
      triangles.push(
        new ln.Triangle(
          new ln.Vector(ax, ay, halfZ),
          new ln.Vector(bx, by, halfZ),
          new ln.Vector(cx2, cy2, halfZ),
        ),
      );
      // Bottom (reverse winding)
      triangles.push(
        new ln.Triangle(
          new ln.Vector(ax, ay, -halfZ),
          new ln.Vector(cx2, cy2, -halfZ),
          new ln.Vector(bx, by, -halfZ),
        ),
      );
    }

    // Walls — two triangles per edge of every ring
    for (const ring of projRings) {
      const n = ring.length;
      if (n < 2) continue;
      // If the ring is closed (last == first), avoid the duplicate edge
      const closed =
        n > 2 &&
        ring[0][0] === ring[n - 1][0] &&
        ring[0][1] === ring[n - 1][1];
      const limit = closed ? n - 1 : n;
      for (let i = 0; i < limit; i++) {
        const [x1, y1] = ring[i];
        const [x2, y2] = ring[(i + 1) % limit];
        // Two triangles per quad (x1,y1,-h)-(x2,y2,-h)-(x2,y2,+h)-(x1,y1,+h)
        const p1 = new ln.Vector(x1, y1, -halfZ);
        const p2 = new ln.Vector(x2, y2, -halfZ);
        const p3 = new ln.Vector(x2, y2, halfZ);
        const p4 = new ln.Vector(x1, y1, halfZ);
        triangles.push(new ln.Triangle(p1, p2, p3));
        triangles.push(new ln.Triangle(p1, p3, p4));
      }
    }
  }

  return triangles;
}

// Convenience wrapper that pulls fields out of SvgExtrudeParams / TextExtrudeParams
export function extrudeFromParams(
  p: SvgExtrudeParams | TextExtrudeParams,
): ln.Triangle[] {
  if (!p.polylines || p.polylines.length === 0) return [];
  return extrudePolylines({
    polylines: p.polylines,
    bounds: p.bounds,
    extrudeDepth: p.extrudeDepth,
    fitToSize: p.fitToSize,
    centerOnOrigin: p.centerOnOrigin,
  });
}
